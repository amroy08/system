import { Router } from 'express';
import { col, nextSeq } from '../db/index.js';
import { authRequired, allowRoles, STAFF } from '../middleware/auth.js';
import { acquireKeyedLock } from '../utils/keyedLock.js';

const router = Router();
router.use(authRequired);

// ---------- Assets ----------
router.get('/', allowRoles(...STAFF), async (req, res) => {
  const query = { _deleted: { $ne: true } };
  if (req.query.status) query.status = req.query.status;
  if (req.query.category) query.category = req.query.category;
  res.json(await col('assets').find(query, { sort: { createdAt: -1 } }));
});

router.post('/', allowRoles(...STAFF), async (req, res) => {
  const b = { ...req.body };
  for (const key of ['_id', '_deleted', 'deletedAt', 'deletedBy', 'tag', 'maintenance']) delete b[key];
  if (!b.name) return res.status(400).json({ error: 'Asset name is required' });
  const seq = await nextSeq('assetTag');
  const doc = await col('assets').insertOne({
    ...b,
    tag: `AST-${String(seq).padStart(5, '0')}`,
    status: 'in-use',
    maintenance: [],
  });
  res.status(201).json(doc);
});

router.put('/:id', allowRoles(...STAFF), async (req, res) => {
  const b = { ...req.body };
  for (const key of ['_id', '_deleted', 'deletedAt', 'deletedBy', 'createdAt', 'tag', 'maintenance']) delete b[key];
  const doc = await col('assets').updateOne({ _id: req.params.id, _deleted: { $ne: true } }, b);
  if (!doc) return res.status(404).json({ error: 'Asset not found' });
  res.json(doc);
});

// Log maintenance with expense
router.post('/:id/maintenance', allowRoles(...STAFF), async (req, res) => {
  const release = await acquireKeyedLock(`asset-maintenance:${req.params.id}`);
  try {
    const asset = await col('assets').findOne({ _id: req.params.id, _deleted: { $ne: true } });
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    const cost = Number(req.body.cost ?? 0);
    const date = req.body.date || new Date().toISOString().slice(0, 10);
    if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ error: 'Maintenance cost must be zero or greater' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ error: 'Select a valid maintenance date' });
    const entry = {
      date,
      description: String(req.body.description || '').trim(),
      cost,
      by: req.user.name,
    };
    const maintenance = [...(asset.maintenance || []), entry];
    const doc = await col('assets').updateOne({ _id: asset._id }, { maintenance });
    if (entry.cost > 0) {
      await col('dailyAccounts').insertOne({
        ledgerKey: `asset-maintenance:${asset._id}:${doc.updatedAt}`,
        assetId: asset._id,
        date: entry.date, type: 'expense', category: 'Maintenance',
        description: `${asset.name} (${asset.tag}): ${entry.description}`,
        amount: entry.cost, mode: 'cash', recordedBy: req.user.name,
      });
    }
    res.json(doc);
  } finally {
    release();
  }
});

router.delete('/:id', allowRoles('admin'), async (req, res) => {
  const asset = await col('assets').findOne({ _id: req.params.id, _deleted: { $ne: true } });
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  await col('assets').updateOne({ _id: req.params.id }, {
    _deleted: true, deletedAt: new Date().toISOString(), deletedBy: req.user.name,
  });
  res.json({ ok: true });
});

export default router;
