import { Router } from 'express';
import { col, nextSeq } from '../db/index.js';
import { authRequired, allowRoles, STAFF } from '../middleware/auth.js';
import { resolveEmailRecipients } from '../utils/emailRecipients.js';
import { enqueueEmailEvent } from '../utils/emailOutbox.js';
import { summarizeStudentFees } from '../utils/studentFees.js';
import {
  allocateFeePayment,
  buildRemainingBalanceBreakdown,
  normalizeFeeHead,
  resolveStudentFeeComponents,
  summarizeComponentPayments,
} from '../utils/feeAllocation.js';
import { toWhatsAppNumber } from '../utils/whatsapp.js';
import { acquireKeyedLock } from '../utils/keyedLock.js';
import { sendInternalError } from '../utils/httpErrors.js';
import { invalidateDailyAccountsCache } from './misc.js';

const router = Router();
router.use(authRequired);
const PAYING_STUDENT_STATUSES = ['active', 'passed-out'];
const PAYING_STUDENT_QUERY = { status: { $in: PAYING_STUDENT_STATUSES } };
const ACTIVE_CLASS_QUERY = { _deleted: { $ne: true }, status: { $ne: 'archived' } };

// 30-second cache for outstanding dues (invalidated on new receipt)
const OUTSTANDING_CACHE_MS = 30_000;
let outstandingCache = null;
let outstandingCacheAt = 0;
export function invalidateOutstandingCache() { outstandingCacheAt = 0; }

// 20-second cache for receipts list (keyed by studentId+status filter)
const RECEIPTS_CACHE_MS = 20_000;
const receiptsCache = new Map();
let receiptsCacheAt = 0;
function invalidateReceiptsCache() { receiptsCache.clear(); receiptsCacheAt = 0; }
const OUTSTANDING_STUDENT_PROJECTION = {
  _id: 1,
  firstName: 1,
  lastName: 1,
  admissionNo: 1,
  classId: 1,
  parentIds: 1,
  totalDemand: 1,
};
const RECEIPT_SUMMARY_PROJECTION = {
  _id: 1,
  receiptNo: 1,
  studentId: 1,
  studentName: 1,
  admissionNo: 1,
  className: 1,
  date: 1,
  amountDue: 1,
  amountPaid: 1,
  discount: 1,
  lateFee: 1,
  balance: 1,
  mode: 1,
  reference: 1,
  remarks: 1,
  items: 1,
  status: 1,
  subTotal: 1,
  totalDemand: 1,
  currentGradeFeeRate: 1,
  previousYearArrears: 1,
  totalPaidLifetime: 1,
  balanceBreakdown: 1,
  createdAt: 1,
  emailStatus: 1,
  emailRecipientCount: 1,
};

function mayReadStudent(req, student) {
  if (req.user.role === 'student') return req.user.refId === student._id;
  if (req.user.role === 'parent') return (student.parentIds || []).includes(req.user.refId);
  return STAFF.includes(req.user.role);
}

async function ensureDailyAccount(entry) {
  let existing = await col('dailyAccounts').findOne({ ledgerKey: entry.ledgerKey });
  if (!existing && entry.receiptId) {
    existing = await col('dailyAccounts').findOne({
      receiptId: entry.receiptId,
      type: entry.type,
      category: entry.category,
    });
    if (existing) {
      const res = await col('dailyAccounts').updateOne({ _id: existing._id }, { ledgerKey: entry.ledgerKey });
      invalidateDailyAccountsCache();
      return res;
    }
  }
  if (existing) return existing;
  try {
    const doc = await col('dailyAccounts').insertOne(entry);
    invalidateDailyAccountsCache();
    return doc;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return col('dailyAccounts').findOne({ ledgerKey: entry.ledgerKey });
  }
}

async function ensureRefundLedger(receipt) {
  let refund = await col('feeRefunds').findOne({ receiptId: receipt._id });
  if (!refund) {
    try {
      refund = await col('feeRefunds').insertOne({
        receiptId: receipt._id,
        receiptNo: receipt.receiptNo,
        studentId: receipt.studentId,
        amount: receipt.amountPaid,
        reason: receipt.refundReason,
        refundedBy: receipt.refundedBy,
        refundedAt: receipt.refundedAt,
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      refund = await col('feeRefunds').findOne({ receiptId: receipt._id });
    }
  }
  await ensureDailyAccount({
    ledgerKey: `fee-refund:${receipt._id}`,
    date: receipt.refundedAt.slice(0, 10),
    type: 'expense',
    category: 'Fee Refund',
    description: `Refund of fee receipt ${receipt.receiptNo} — ${receipt.studentName}`,
    amount: receipt.amountPaid,
    mode: receipt.mode,
    recordedBy: receipt.refundedBy,
    receiptId: receipt._id,
  });
  return refund;
}

async function calculateFeeStructureItems(student, klass) {
  const structures = await col('feeStructures').find({ status: 'active' });
  return resolveStudentFeeComponents({ student, klass, structures });
}

function sanitizeManualSplit(items, amountPaid, componentSummaries = []) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const cleanItems = items
    .map((item) => ({
      description: String(item.description || item.name || '').trim(),
      amount: Number(item.amount) || 0,
    }))
    .filter((item) => item.description && item.amount > 0);
  const splitTotal = cleanItems.reduce((sum, item) => sum + item.amount, 0);
  if (Math.abs(splitTotal - amountPaid) > 0.01) {
    const expected = amountPaid.toFixed(2);
    const received = splitTotal.toFixed(2);
    throw new Error(`Split total (${received}) must match payment amount (${expected}).`);
  }
  const outstandingByHead = new Map(componentSummaries.map((item) => [normalizeFeeHead(item.name), Number(item.outstandingAmount || 0)]));
  for (const item of cleanItems) {
    if (normalizeFeeHead(item.description) === 'school fees payment') continue;
    const outstanding = outstandingByHead.get(normalizeFeeHead(item.description));
    if (outstanding === undefined) throw new Error(`Unknown fee head in split: ${item.description}`);
    if (item.amount - outstanding > 0.01) throw new Error(`${item.description} split cannot exceed its pending balance.`);
  }
  return cleanItems;
}

async function queueReceiptEmail(receipt, student, createdBy) {
  try {
    const recipientResult = await resolveEmailRecipients({ parentIds: student.parentIds || [] });
    const queued = await enqueueEmailEvent({
      eventType: 'receipt',
      entityType: 'feeReceipt',
      entityId: receipt._id,
      version: receipt.createdAt,
      recipients: recipientResult.recipients,
      payload: receipt,
      createdBy,
    });
    await col('feeReceipts').updateOne({ _id: receipt._id }, {
      emailStatus: queued.queuedCount ? 'queued' : 'no-recipients',
      emailRecipientCount: queued.queuedCount,
      emailSkipped: recipientResult.skipped,
    });
  } catch (err) {
    console.error('[Receipt Email Queue Error]', err);
    await col('feeReceipts').updateOne({ _id: receipt._id }, {
      emailStatus: 'failed',
      emailFailureReason: err.message,
    });
  }
}

// Compute what a student owes: tuition + transport + late fee - discount
router.get('/compute/:studentId', async (req, res) => {
  const student = await col('students').findOne({ _id: req.params.studentId, status: { $ne: 'deleted' } });
  if (!student || !mayReadStudent(req, student)) return res.status(404).json({ error: 'Student not found' });
  const klass = await col('classes').findOne({ _id: student.classId, ...ACTIVE_CLASS_QUERY });

  const paid = await col('feeReceipts').find({ studentId: student._id });
  const summary = summarizeStudentFees(student, paid);

  const items = await calculateFeeStructureItems(student, klass);
  const itemSummaries = summarizeComponentPayments(items, paid);
  const amountPaid = Number(req.query.amountPaid) || 0;
  const allocation = allocateFeePayment(amountPaid, itemSummaries);

  res.json({
    student: { _id: student._id, name: `${student.firstName} ${student.lastName || ''}`.trim(), admissionNo: student.admissionNo },
    className: klass ? `${klass.name} ${klass.section} (${klass.academicYear})` : '',
    ...summary,
    items: itemSummaries,
    allocationPreview: allocation.preview,
  });
});

// Receipts list
router.get('/', allowRoles(...STAFF), async (req, res) => {
  const cacheKey = `${req.query.studentId || ''}:${req.query.status || ''}`;
  const now = Date.now();
  if (receiptsCache.has(cacheKey) && now - receiptsCacheAt < RECEIPTS_CACHE_MS) {
    return res.json(receiptsCache.get(cacheKey));
  }
  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.studentId) query.studentId = req.query.studentId;
  const result = await col('feeReceipts').find(query, { sort: { createdAt: -1 }, projection: RECEIPT_SUMMARY_PROJECTION });
  receiptsCache.set(cacheKey, result);
  receiptsCacheAt = Date.now();
  res.json(result);
});

// Get outstanding dues for all active students
router.get('/outstanding', allowRoles(...STAFF), async (req, res) => {
  try {
    const now = Date.now();
    if (outstandingCache && now - outstandingCacheAt < OUTSTANDING_CACHE_MS) {
      return res.json(outstandingCache);
    }
    const [students, receipts, classes, parents] = await Promise.all([
      col('students').find(PAYING_STUDENT_QUERY, { projection: OUTSTANDING_STUDENT_PROJECTION }),
      col('feeReceipts').find({ status: { $in: ['paid', 'partial', 'unpaid'] } }, {
        projection: { _id: 1, studentId: 1, amountPaid: 1, discount: 1, lateFee: 1, status: 1 },
      }),
      col('classes').find(ACTIVE_CLASS_QUERY),
      col('parents').find({ status: 'active' }, {
        projection: { _id: 1, name: 1, relation: 1, mobile: 1, status: 1 },
      }),
    ]);
    const receiptsByStudent = new Map();
    for (const receipt of receipts) {
      if (!receiptsByStudent.has(receipt.studentId)) receiptsByStudent.set(receipt.studentId, []);
      receiptsByStudent.get(receipt.studentId).push(receipt);
    }
    const classesById = new Map(classes.map((klass) => [klass._id, klass]));
    const parentsById = new Map(parents.map((parent) => [parent._id, parent]));

    const records = [];
    for (const s of students) {
      const summary = summarizeStudentFees(s, receiptsByStudent.get(s._id) || []);
      const klass = classesById.get(s.classId);
      const guardians = (s.parentIds || [])
        .map((parentId) => parentsById.get(parentId))
        .filter((parent) => parent?.status === 'active')
        .map((parent) => ({
          parentId: parent._id,
          name: parent.name,
          relation: parent.relation || 'Guardian',
          mobile: parent.mobile || '',
          whatsappNumber: toWhatsAppNumber(parent.mobile),
        }));
      const guardianOptions = guardians.filter((guardian) => guardian.whatsappNumber);

      records.push({
        id: s._id,
        grNumber: s.admissionNo,
        studentName: `${s.firstName} ${s.lastName || ''}`.trim(),
        grade: klass ? klass.name : '—',
        section: klass ? klass.section : '—',
        guardianMobile: guardianOptions[0]?.mobile || 'N/A',
        guardianOptions,
        missingGuardianNumbers: Math.max(0, (s.parentIds || []).length - guardianOptions.length),
        totalDemand: summary.totalDemand,
        paidAmount: summary.totalPaid,
        outstandingAmount: summary.balance
      });
    }

    outstandingCache = records;
    outstandingCacheAt = Date.now();
    res.json(records);
  } catch (e) {
    sendInternalError(res, e, 'Outstanding fees');
  }
});

router.post('/whatsapp-reminders/prepared', allowRoles(...STAFF), async (req, res) => {
  const { studentId, parentId } = req.body;
  const student = await col('students').findOne({ _id: studentId, ...PAYING_STUDENT_QUERY });
  if (!student || !(student.parentIds || []).includes(parentId)) {
    return res.status(400).json({ error: 'The selected parent is not linked to this student' });
  }
  const parent = await col('parents').findOne({ _id: parentId, status: 'active' });
  const whatsappNumber = toWhatsAppNumber(parent?.mobile);
  if (!parent || !whatsappNumber) return res.status(400).json({ error: 'The selected parent has no valid WhatsApp number' });
  const receipts = await col('feeReceipts').find({ studentId: student._id });
  const outstandingAmount = summarizeStudentFees(student, receipts).balance;

  const log = await col('whatsappReminderLogs').insertOne({
    eventType: 'fee-reminder',
    status: 'prepared',
    studentId: student._id,
    parentId: parent._id,
    whatsappNumber,
    outstandingAmount,
    preparedBy: req.user.name || req.user.username,
    preparedAt: new Date().toISOString(),
  });
  res.status(201).json(log);
});

router.get('/:id', async (req, res) => {
  const doc = await col('feeReceipts').findOne({ _id: req.params.id });
  if (!doc) return res.status(404).json({ error: 'Receipt not found' });
  const student = await col('students').findOne({ _id: doc.studentId, status: { $ne: 'deleted' } });
  if (!student || !mayReadStudent(req, student)) return res.status(404).json({ error: 'Receipt not found' });
  res.json(doc);
});

router.post('/:id/email', allowRoles(...STAFF), async (req, res) => {
  const receipt = await col('feeReceipts').findOne({ _id: req.params.id });
  if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
  const student = await col('students').findOne({ _id: receipt.studentId, status: { $ne: 'deleted' } });
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const recipients = await resolveEmailRecipients({ parentIds: student.parentIds || [] });
  const resendNumber = Number(receipt.emailResendCount || 0) + 1;
  const queued = await enqueueEmailEvent({
    eventType: 'receipt',
    entityType: 'feeReceipt',
    entityId: receipt._id,
    version: `${receipt.createdAt}:resend:${resendNumber}`,
    recipients: recipients.recipients,
    payload: receipt,
    createdBy: req.user.name,
  });
  await col('feeReceipts').updateOne({ _id: receipt._id }, {
    emailStatus: queued.queuedCount ? 'queued' : 'no-recipients',
    emailRecipientCount: queued.queuedCount,
    emailSkipped: recipients.skipped,
    emailResendCount: resendNumber,
    emailResentBy: req.user.name,
    emailResentAt: new Date().toISOString(),
  });
  res.json({ ...queued, skipped: recipients.skipped });
});

// Record a payment
router.post('/', allowRoles(...STAFF), async (req, res) => {
  const b = req.body;
  const student = await col('students').findOne({ _id: b.studentId, ...PAYING_STUDENT_QUERY });
  if (!student) return res.status(400).json({ error: 'Please select a valid student' });
  const release = await acquireKeyedLock(`fee:${student._id}`);
  try {
    const idempotencyKey = String(req.get('idempotency-key') || b.idempotencyKey || '').trim();
    if (idempotencyKey.length > 128) return res.status(400).json({ error: 'Invalid payment request identifier' });
    if (idempotencyKey) {
      const previous = await col('feeReceipts').findOne({ idempotencyKey });
      if (previous) {
        await ensureDailyAccount({
          ledgerKey: `fee-income:${previous._id}`,
          date: previous.date,
          type: 'income',
          category: 'Fees',
          description: `Fee receipt ${previous.receiptNo} — ${previous.studentName}`,
          amount: previous.amountPaid,
          mode: previous.mode,
          recordedBy: previous.collectedBy,
          receiptId: previous._id,
        });
        return res.json(previous);
      }
    }
    const klass = await col('classes').findOne({ _id: student.classId, ...ACTIVE_CLASS_QUERY });

  const amountPaid = Number(b.amountPaid) || 0;
  const lateFee = Number(b.lateFee) || 0;
  const discount = Number(b.discount) || 0;
  const totalDemand = student.totalDemand || 0;

  // Enforce positive validation check
  if (amountPaid <= 0) {
    return res.status(400).json({ error: 'Please enter a valid payment amount greater than 0.' });
  }

  // Get what was previously paid
  const paid = await col('feeReceipts').find({ studentId: student._id, status: { $ne: 'refunded' } });
  const feeSummary = summarizeStudentFees(student, paid);
  const balanceBefore = feeSummary.balance;
  const adjustedBalance = balanceBefore + lateFee - discount;
  if (adjustedBalance < 0) {
    return res.status(400).json({ error: 'Discount cannot exceed the current outstanding balance plus late fee.' });
  }

  // Enforce maximum outstanding validation check
  if (amountPaid > adjustedBalance) {
    return res.status(400).json({ error: `Payment amount (${amountPaid}) exceeds adjusted outstanding balance (${adjustedBalance}).` });
  }

  // Payment mode specific validation reference check
  const mode = (b.mode || 'cash').toLowerCase();
  if (mode === 'upi' && !b.reference) {
    return res.status(400).json({ error: 'UPI Transaction ID / UTR reference is required.' });
  }
  if (mode === 'check' && !b.reference) {
    return res.status(400).json({ error: 'Cheque Number is required.' });
  }
  if (mode === 'online' && !b.reference) {
    return res.status(400).json({ error: 'Bank Reference Number is required.' });
  }

  const balanceAfter = adjustedBalance - amountPaid;

  // Dynamic chronological fee allocation (FIFO)
  const applicableItems = await calculateFeeStructureItems(student, klass);
  const componentSummaries = summarizeComponentPayments(applicableItems, paid);
  let items;
  try {
    items = sanitizeManualSplit(b.items, amountPaid, componentSummaries) || allocateFeePayment(amountPaid, componentSummaries).items;
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const status = balanceAfter <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';
  const balanceBreakdown = buildRemainingBalanceBreakdown(applicableItems, [...paid, { items, amountPaid, status }], balanceAfter);

  const subTotal = amountPaid;
  const amountDue = amountPaid + lateFee - discount;

  const arrearItem = applicableItems.find(i => i.name === 'Arrear Fees (Previous Balance)');
  const previousYearArrears = arrearItem ? arrearItem.amount : 0;
  const currentGradeFeeRate = totalDemand - previousYearArrears;
  const totalPaidLifetime = feeSummary.totalPaid + amountPaid;

  const seq = await nextSeq('receipt');
  const doc = await col('feeReceipts').insertOne({
    receiptNo: `RCP-${new Date().getFullYear()}-${String(seq).padStart(8, '0')}`,
    studentId: student._id,
    studentName: `${student.firstName} ${student.lastName || ''}`.trim(),
    admissionNo: student.admissionNo,
    className: klass ? `${klass.name} ${klass.section} (${klass.academicYear})` : '',
    academicYear: klass?.academicYear || '',
    date: b.date || new Date().toISOString().slice(0, 10),
    items, balanceBreakdown, subTotal, lateFee, discount, amountDue, amountPaid, balance: balanceAfter,
    previousYearArrears,
    currentGradeFeeRate,
    totalDemand,
    totalPaidLifetime,
    mode,
    reference: b.reference || '',
    remarks: b.remarks || '',
    collectedBy: req.user.name,
    status,
    emailStatus: 'pending',
    emailRecipientCount: 0,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });

  // Mirror income into Daily Accounts
  if (amountPaid > 0) {
    await ensureDailyAccount({
      ledgerKey: `fee-income:${doc._id}`,
      date: doc.date, type: 'income', category: 'Fees',
      description: `Fee receipt ${doc.receiptNo} — ${doc.studentName}`,
      amount: amountPaid, mode: doc.mode, recordedBy: req.user.name, receiptId: doc._id,
    });
  }
  res.status(201).json(doc);
  invalidateOutstandingCache(); // new receipt changes balances
  invalidateReceiptsCache();    // new receipt appears in list
  queueMicrotask(() => queueReceiptEmail(doc, student, req.user.name).catch((err) => console.error('[Receipt Email Queue Error]', err)));
  } finally {
    release();
  }
});

router.put('/:id', allowRoles(...STAFF), async (req, res) => {
  res.status(409).json({ error: 'Financial receipts are immutable. Use a refund and issue a corrected receipt.' });
});

router.post('/:id/refund', allowRoles('admin', 'clerk'), async (req, res) => {
  const initial = await col('feeReceipts').findOne({ _id: req.params.id });
  if (!initial) return res.status(404).json({ error: 'Receipt not found' });
  const release = await acquireKeyedLock(`fee:${initial.studentId}`);
  try {
    const receipt = await col('feeReceipts').findOne({ _id: req.params.id });
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    if (receipt.status === 'refunded') {
      await ensureRefundLedger(receipt);
      return res.status(409).json({ error: 'Receipt is already refunded' });
    }
    const refundedAt = new Date().toISOString();
    const refundReason = String(req.body.reason || 'Administrator refund').trim().slice(0, 500);
    const doc = await col('feeReceipts').updateOne(
      { _id: receipt._id, status: { $ne: 'refunded' } },
      { status: 'refunded', refundReason, refundedBy: req.user.name, refundedAt }
    );
    if (!doc) return res.status(409).json({ error: 'Receipt was already refunded' });
    await ensureRefundLedger(doc);
    res.json(doc);
  } finally {
    release();
  }
});

router.delete('/:id', allowRoles('admin'), async (req, res) => {
  res.status(409).json({ error: 'Financial receipts cannot be deleted. Use the refund action to preserve the audit trail.' });
});

export default router;
