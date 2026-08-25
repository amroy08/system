import { Router } from 'express';
import { col, nextSeq } from '../db/index.js';
import { authRequired, allowRoles, STAFF } from '../middleware/auth.js';
import { resolveEmailRecipients } from '../utils/emailRecipients.js';
import { enqueueEmailEvent } from '../utils/emailOutbox.js';
import { summarizeStudentFees } from '../utils/studentFees.js';
import {
  allocateFeePayment,
  resolveStudentFeeComponents,
  summarizeComponentPayments,
} from '../utils/feeAllocation.js';
import { toWhatsAppNumber } from '../utils/whatsapp.js';
import { acquireKeyedLock } from '../utils/keyedLock.js';
import { sendInternalError } from '../utils/httpErrors.js';

const router = Router();
router.use(authRequired);

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
    if (existing) return col('dailyAccounts').updateOne({ _id: existing._id }, { ledgerKey: entry.ledgerKey });
  }
  if (existing) return existing;
  try {
    return await col('dailyAccounts').insertOne(entry);
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

// Compute what a student owes: tuition + transport + late fee - discount
router.get('/compute/:studentId', async (req, res) => {
  const student = await col('students').findOne({ _id: req.params.studentId });
  if (!student || !mayReadStudent(req, student)) return res.status(404).json({ error: 'Student not found' });
  const klass = await col('classes').findOne({ _id: student.classId });

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
  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.studentId) query.studentId = req.query.studentId;
  res.json(await col('feeReceipts').find(query, { sort: { createdAt: -1 } }));
});

// Get outstanding dues for all active students
router.get('/outstanding', allowRoles(...STAFF), async (req, res) => {
  try {
    const students = await col('students').find({ status: { $in: ['active', 'passed-out'] } });
    const receipts = await col('feeReceipts').find({ status: { $ne: 'refunded' } });
    const classes = await col('classes').find({});
    const parents = await col('parents').find({});

    const records = [];
    for (const s of students) {
      const summary = summarizeStudentFees(s, receipts.filter((receipt) => receipt.studentId === s._id));
      const klass = classes.find(c => c._id === s.classId);
      const guardians = (s.parentIds || [])
        .map((parentId) => parents.find((parent) => parent._id === parentId))
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

    res.json(records);
  } catch (e) {
    sendInternalError(res, e, 'Outstanding fees');
  }
});

router.post('/whatsapp-reminders/prepared', allowRoles(...STAFF), async (req, res) => {
  const { studentId, parentId } = req.body;
  const student = await col('students').findOne({ _id: studentId });
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
  const student = await col('students').findOne({ _id: doc.studentId });
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
  const student = await col('students').findOne({ _id: b.studentId });
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
    const klass = await col('classes').findOne({ _id: student.classId });

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
  const { items } = allocateFeePayment(amountPaid, componentSummaries);

  const subTotal = amountPaid;
  const amountDue = amountPaid + lateFee - discount;
  const status = balanceAfter <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';

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
    items, subTotal, lateFee, discount, amountDue, amountPaid, balance: balanceAfter,
    previousYearArrears,
    currentGradeFeeRate,
    totalDemand,
    totalPaidLifetime,
    mode,
    reference: b.reference || '',
    remarks: b.remarks || '',
    collectedBy: req.user.name,
    status,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });

  try {
    const recipientResult = await resolveEmailRecipients({ parentIds: student.parentIds || [] });
    const queued = await enqueueEmailEvent({
      eventType: 'receipt', entityType: 'feeReceipt', entityId: doc._id, version: doc.createdAt,
      recipients: recipientResult.recipients, payload: doc, createdBy: req.user.name,
    });
    await col('feeReceipts').updateOne({ _id: doc._id }, {
      emailStatus: queued.queuedCount ? 'queued' : 'no-recipients',
      emailRecipientCount: queued.queuedCount,
      emailSkipped: recipientResult.skipped,
    });
  } catch (err) { console.error('[Receipt Email Queue Error]', err); }

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
