import { Router } from 'express';
import { col } from '../db/index.js';
import { authRequired, allowRoles, STAFF } from '../middleware/auth.js';
import { acquireKeyedLock } from '../utils/keyedLock.js';

const router = Router();
router.use(authRequired);

router.get('/', allowRoles(...STAFF), async (req, res) => {
  let items = await col('inventory').find({ _deleted: { $ne: true } }, { sort: { name: 1 } });
  if (req.query.low === 'true') items = items.filter((i) => (i.quantity || 0) <= (i.reorderLevel || 0));
  res.json(items);
});

router.post('/', allowRoles(...STAFF), async (req, res) => {
  const b = { ...req.body };
  for (const key of ['_id', '_deleted', 'deletedAt', 'deletedBy', 'quantity', 'status']) delete b[key];
  const openingStock = Number(b.openingStock ?? 0);
  const reorderLevel = Number(b.reorderLevel ?? 0);
  if (!String(b.name || '').trim()) return res.status(400).json({ error: 'Item name is required' });
  if (!Number.isInteger(openingStock) || openingStock < 0 || !Number.isInteger(reorderLevel) || reorderLevel < 0) {
    return res.status(400).json({ error: 'Opening stock and reorder level must be non-negative whole numbers' });
  }
  const doc = await col('inventory').insertOne({
    ...b,
    name: String(b.name).trim(),
    openingStock,
    quantity: openingStock,
    unit: b.unit || 'pieces',
    reorderLevel,
    status: 'active',
  });
  res.status(201).json(doc);
});

router.put('/:id', allowRoles(...STAFF), async (req, res) => {
  const b = { ...req.body };
  for (const key of ['_id', '_deleted', 'deletedAt', 'deletedBy', 'createdAt', 'quantity', 'openingStock']) delete b[key];
  if (Object.hasOwn(b, 'reorderLevel')) {
    b.reorderLevel = Number(b.reorderLevel);
    if (!Number.isInteger(b.reorderLevel) || b.reorderLevel < 0) return res.status(400).json({ error: 'Reorder level must be a non-negative whole number' });
  }
  if (Object.hasOwn(b, 'name') && !String(b.name || '').trim()) return res.status(400).json({ error: 'Item name is required' });
  const doc = await col('inventory').updateOne({ _id: req.params.id, _deleted: { $ne: true } }, b);
  if (!doc) return res.status(404).json({ error: 'Item not found' });
  res.json(doc);
});

// Stock movement: type = in | issue | adjust
router.post('/:id/move', allowRoles(...STAFF), async (req, res) => {
  const release = await acquireKeyedLock(`inventory:${req.params.id}`);
  try {
    const item = await col('inventory').findOne({ _id: req.params.id, _deleted: { $ne: true } });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const { type, quantity, note, issuedTo } = req.body;
    const qty = Number(quantity);
    if (!['in', 'issue', 'adjust'].includes(type) || !Number.isInteger(qty) || qty < 0 || (type !== 'adjust' && qty === 0)) {
      return res.status(400).json({ error: 'Movement quantity must be a valid non-negative whole number' });
    }
    let newQty = Number(item.quantity) || 0;
    if (type === 'in') newQty += qty;
    else if (type === 'issue') {
      if (qty > newQty) return res.status(400).json({ error: `Only ${newQty} ${item.unit} in stock` });
      newQty -= qty;
    } else newQty = qty;

    const movement = await col('stockMovements').insertOne({
      itemId: item._id, itemName: item.name, type, quantity: qty,
      balanceAfter: newQty, note: String(note || '').trim(), issuedTo: String(issuedTo || '').trim(),
      date: new Date().toISOString().slice(0, 10), by: req.user.name,
    });
    const doc = await col('inventory').updateOne({ _id: item._id }, { quantity: newQty, lastMovementId: movement._id });
    res.json(doc);
  } finally {
    release();
  }
});

router.get('/:id/movements', allowRoles(...STAFF), async (req, res) => {
  res.json(await col('stockMovements').find({ itemId: req.params.id }, { sort: { createdAt: -1 } }));
});

router.delete('/:id', allowRoles('admin'), async (req, res) => {
  const item = await col('inventory').findOne({ _id: req.params.id, _deleted: { $ne: true } });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  await col('inventory').updateOne({ _id: req.params.id }, {
    _deleted: true, deletedAt: new Date().toISOString(), deletedBy: req.user.name,
  });
  res.json({ ok: true });
});

export default router;
