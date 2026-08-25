import { Router } from 'express';
import { col } from '../db/index.js';
import { authRequired, allowRoles } from '../middleware/auth.js';

const router = Router();
const COLLECTIONS = new Set([
  'students', 'parents', 'users', 'admissions', 'exams', 'assets', 'inventory',
  'books', 'salarySlips', 'homework', 'notices', 'documents', 'lessonPlans',
  'activities', 'complaints', 'helpdesk', 'discipline', 'conduct', 'ptm',
  'assignments', 'substitutes', 'classes', 'subjects', 'calendarEvents',
  'logbook', 'dailyAccounts',
]);

router.use(authRequired, allowRoles('admin'));

router.get('/deleted', async (req, res) => {
  const rows = [];
  for (const collectionName of COLLECTIONS) {
    const deleted = await col(collectionName).find({ $or: [{ _deleted: true }, { status: 'deleted' }] }, { sort: { deletedAt: -1 }, limit: 100 });
    for (const record of deleted) {
      rows.push({
        collection: collectionName,
        _id: record._id,
        label: record.name || record.fullName || record.title || record.admissionNo || record._id,
        deletedAt: record.deletedAt,
        deletedBy: record.deletedBy,
      });
    }
  }
  rows.sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')));
  res.json(rows.slice(0, 250));
});

router.post('/:collection/:id/restore', async (req, res) => {
  const { collection: collectionName, id } = req.params;
  if (!COLLECTIONS.has(collectionName)) return res.status(400).json({ error: 'This record type cannot be restored here' });
  const record = await col(collectionName).findOne({ _id: id });
  if (!record || (!record._deleted && record.status !== 'deleted')) return res.status(404).json({ error: 'Deleted record not found' });
  const updates = {
    _deleted: false,
    deletedAt: null,
    deletedBy: null,
    restoredAt: new Date().toISOString(),
    restoredBy: req.user.name,
  };
  if (record.status !== undefined) {
    updates.status = record.deletedPreviousStatus || (record.status === 'deleted' ? 'active' : record.status);
  }
  const restored = await col(collectionName).updateOne({ _id: id }, updates);
  if (collectionName === 'students') {
    const users = await col('users').find({ role: 'student', refId: id });
    for (const user of users) {
      await col('users').updateOne({ _id: user._id }, {
        status: user.credentialVersion === 2 && !user.legacyCredentialDisabledAt ? 'active' : 'credential-reset-required', deletedAt: null, deletedBy: null,
      });
    }
  }
  if (collectionName === 'parents') {
    const users = await col('users').find({ role: 'parent', refId: id });
    for (const user of users) {
      await col('users').updateOne({ _id: user._id }, {
        status: user.credentialVersion === 2 && !user.legacyCredentialDisabledAt ? 'active' : 'credential-reset-required', deletedAt: null, deletedBy: null,
      });
    }
  }
  res.json(restored);
});

export default router;
