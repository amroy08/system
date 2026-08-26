import { Router } from 'express';
import { col } from '../db/index.js';
import { authRequired, allowRoles, STAFF, STAFF_TEACHER } from '../middleware/auth.js';
import { ensureParentUser, syncParentUser } from '../utils/parentAccounts.js';
import { isStrongPassword } from '../utils/credentials.js';
import { teacherClassIds } from '../utils/accessScope.js';

const router = Router();
router.use(authRequired);

router.get('/', allowRoles(...STAFF_TEACHER), async (req, res) => {
  let parents = await col('parents').find({ status: { $ne: 'deleted' } }, { sort: { name: 1 } });
  if (req.user.role === 'teacher') {
    const classIds = await teacherClassIds(req.user.id);
    const students = await col('students').find({ classId: { $in: classIds }, status: 'active' });
    const parentIds = new Set(students.flatMap((student) => student.parentIds || []));
    parents = parents.filter((parent) => parentIds.has(parent._id));
  }
  res.json(parents);
});

router.post('/', allowRoles(...STAFF), async (req, res) => {
  const body = { ...req.body, status: 'active' };
  for (const key of ['_id', '_deleted', 'deletedAt', 'deletedBy', 'credentials']) delete body[key];
  delete body.password;
  if (!String(body.name || '').trim()) return res.status(400).json({ error: 'Parent name is required' });
  if (req.body.password !== undefined && !isStrongPassword(req.body.password)) {
    return res.status(400).json({ error: 'Parent password must include 6–128 characters, uppercase, lowercase, number and symbol' });
  }
  const parent = await col('parents').insertOne(body);
  const account = await ensureParentUser(parent, req.body.password);
  res.status(201).json({ ...parent, credentials: { username: account.user.username, temporaryPassword: account.temporaryPassword } });
});

router.put('/:id', allowRoles(...STAFF), async (req, res) => {
  const existing = await col('parents').findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!existing) return res.status(404).json({ error: 'Parent not found' });
  const body = { ...req.body };
  delete body._id;
  delete body.credentials;
  delete body.password;
  delete body._deleted;
  delete body.deletedAt;
  delete body.deletedBy;
  const parent = await col('parents').updateOne({ _id: existing._id }, body);
  await syncParentUser(parent);
  res.json(parent);
});

router.delete('/:id', allowRoles('admin'), async (req, res) => {
  const parent = await col('parents').findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!parent) return res.status(404).json({ error: 'Parent not found' });
  const students = await col('students').find({ status: { $ne: 'deleted' } });
  const linked = students.filter((student) => (student.parentIds || []).includes(parent._id));
  if (linked.length) return res.status(409).json({ error: `Unlink this parent from ${linked.length} student${linked.length === 1 ? '' : 's'} before deleting` });
  const deletedAt = new Date().toISOString();
  await col('users').updateMany({ role: 'parent', refId: parent._id }, { status: 'deleted', deletedAt, deletedBy: req.user.name });
  await col('parents').updateOne({ _id: parent._id }, { status: 'deleted', deletedAt, deletedBy: req.user.name, deletedPreviousStatus: parent.status });
  res.json({ ok: true });
});

export default router;
