import { Router } from 'express';
import { col, nextSeq } from '../db/index.js';
import { authRequired, allowRoles, STAFF } from '../middleware/auth.js';
import { acquireKeyedLock } from '../utils/keyedLock.js';

const router = Router();
router.use(authRequired);

function compute(b) {
  const normalizeItems = (items, label) => (items || []).map((item) => {
    const name = String(item?.name || '').trim();
    const amount = Number(item?.amount);
    if (!name || !Number.isFinite(amount) || amount < 0) throw new Error(`${label} entries require a name and a non-negative amount`);
    return { name, amount };
  });
  const allowances = normalizeItems(b.allowances, 'Allowance');
  const deductions = normalizeItems(b.deductions, 'Deduction');
  const basic = Number(b.basicSalary);
  if (!Number.isFinite(basic) || basic < 0) throw new Error('Basic salary must be a non-negative amount');
  const totalAllowances = allowances.reduce((s, a) => s + a.amount, 0);
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const netPay = basic + totalAllowances - totalDeductions;
  if (netPay < 0) throw new Error('Deductions cannot exceed gross salary');
  return {
    basicSalary: basic, allowances, deductions,
    gross: basic + totalAllowances,
    totalAllowances, totalDeductions,
    netPay,
  };
}

function workDays(body) {
  const workingDays = Number(body.workingDays ?? 26);
  const presentDays = Number(body.presentDays ?? workingDays);
  if (!Number.isInteger(workingDays) || workingDays < 1 || workingDays > 31) throw new Error('Working days must be between 1 and 31');
  if (!Number.isInteger(presentDays) || presentDays < 0 || presentDays > workingDays) throw new Error('Present days must be between 0 and working days');
  return { workingDays, presentDays };
}

async function ensureSalaryLedger(slip, paidOn, mode, recordedBy) {
  const ledgerKey = `salary-expense:${slip._id}`;
  const existing = await col('dailyAccounts').findOne({ ledgerKey });
  if (existing) return existing;
  try {
    return await col('dailyAccounts').insertOne({
      ledgerKey,
      date: paidOn,
      type: 'expense',
      category: 'Salary',
      description: `Salary ${slip.month} — ${slip.staffName} (${slip.slipNo})`,
      amount: slip.netPay,
      mode,
      recordedBy,
      salarySlipId: slip._id,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return col('dailyAccounts').findOne({ ledgerKey });
  }
}

// Staff can see their own slips; admin/clerk see all
router.get('/', allowRoles(...STAFF, 'teacher'), async (req, res) => {
  const isStaff = ['admin', 'clerk', 'supervisor'].includes(req.user.role);
  const query = isStaff ? { _deleted: { $ne: true } } : { staffId: req.user.id, _deleted: { $ne: true } };
  if (req.query.month) query.month = req.query.month;
  if (req.query.status) query.status = req.query.status;
  res.json(await col('salarySlips').find(query, { sort: { createdAt: -1 } }));
});

router.post('/', allowRoles('admin', 'clerk'), async (req, res) => {
  const b = req.body;
  if (!b.staffId || !b.month) return res.status(400).json({ error: 'Staff member and month are required' });
  if (!/^\d{4}-\d{2}$/.test(String(b.month))) return res.status(400).json({ error: 'Salary month must use YYYY-MM format' });
  const staff = await col('users').findOne({ _id: b.staffId });
  if (!staff || !['admin', 'clerk', 'supervisor', 'teacher'].includes(staff.role)) return res.status(400).json({ error: 'Staff member not found' });
  const release = await acquireKeyedLock(`salary:${b.staffId}:${b.month}`);
  try {
    const dup = await col('salarySlips').findOne({ staffId: b.staffId, month: b.month });
    if (dup) return res.status(400).json({ error: `A slip for ${staff.fullName} (${b.month}) already exists` });
    const salary = compute(b);
    const days = workDays(b);
    const seq = await nextSeq('salarySlip');
    const doc = await col('salarySlips').insertOne({
      slipNo: `SLP-${b.month.replace('-', '')}-${String(seq).padStart(4, '0')}`,
      staffId: staff._id, staffName: staff.fullName, role: staff.role,
      designation: staff.specialization || staff.role,
      month: b.month,
      ...salary,
      ...days,
      status: 'generated',
      generatedBy: req.user.name,
    });
    res.status(201).json(doc);
  } catch (error) {
    res.status(error?.code === 11000 ? 409 : 400).json({ error: error?.code === 11000 ? 'A salary slip already exists for this staff member and month' : error.message });
  } finally {
    release();
  }
});

router.put('/:id', allowRoles('admin', 'clerk'), async (req, res) => {
  const existing = await col('salarySlips').findOne({ _id: req.params.id });
  if (!existing) return res.status(404).json({ error: 'Slip not found' });
  if (existing.status === 'paid') return res.status(400).json({ error: 'Paid slips cannot be edited' });
  const b = { ...req.body };
  for (const key of ['_id', 'slipNo', 'staffId', 'staffName', 'role', 'designation', 'month', 'status', 'generatedBy', 'paidOn', 'paidBy', 'mode', '_deleted', 'deletedAt', 'deletedBy']) delete b[key];
  try {
    const mergedInput = { ...existing, ...b };
    const merged = { ...b, ...compute(mergedInput), ...workDays(mergedInput) };
    res.json(await col('salarySlips').updateOne({ _id: req.params.id }, merged));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Mark paid -> records expense in Daily Accounts
router.post('/:id/pay', allowRoles('admin', 'clerk'), async (req, res) => {
  const release = await acquireKeyedLock(`salary-pay:${req.params.id}`);
  try {
    const slip = await col('salarySlips').findOne({ _id: req.params.id });
    if (!slip) return res.status(404).json({ error: 'Slip not found' });
    if (slip.status === 'paid') {
      await ensureSalaryLedger(slip, slip.paidOn, slip.mode, slip.paidBy);
      return res.status(409).json({ error: 'Already paid' });
    }
    const mode = String(req.body.mode || 'online').toLowerCase();
    if (!['cash', 'online', 'upi', 'check'].includes(mode)) return res.status(400).json({ error: 'Invalid payment mode' });
    const today = new Date().toISOString().slice(0, 10);
    const doc = await col('salarySlips').updateOne(
      { _id: slip._id },
      { status: 'paid', paidOn: today, mode, paidBy: req.user.name }
    );
    await ensureSalaryLedger(doc, today, mode, req.user.name);
    res.json(doc);
  } finally {
    release();
  }
});

router.delete('/:id', allowRoles('admin'), async (req, res) => {
  const slip = await col('salarySlips').findOne({ _id: req.params.id, _deleted: { $ne: true } });
  if (!slip) return res.status(404).json({ error: 'Slip not found' });
  if (slip.status === 'paid') return res.status(409).json({ error: 'Paid salary slips must be reversed through an audited adjustment' });
  await col('salarySlips').updateOne({ _id: req.params.id }, {
    _deleted: true, deletedAt: new Date().toISOString(), deletedBy: req.user.name,
  });
  res.json({ ok: true });
});

export default router;
