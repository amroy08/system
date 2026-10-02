import { Router } from 'express';
import { col } from '../db/index.js';
import { authRequired, allowRoles } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);
router.use(allowRoles('admin'));

router.get('/', async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
  const filter = {};

  if (req.query.action) {
    filter.action = { $regex: req.query.action, $options: 'i' };
  }
  if (req.query.actorRole) {
    filter.actorRole = req.query.actorRole;
  }
  if (req.query.dateFrom || req.query.dateTo) {
    filter.occurredAt = {};
    if (req.query.dateFrom) filter.occurredAt.$gte = req.query.dateFrom;
    if (req.query.dateTo) filter.occurredAt.$lte = req.query.dateTo + 'T23:59:59.999Z';
  }

  const [logs, total] = await Promise.all([
    col('auditLogs').find(filter, { sort: { occurredAt: -1 }, limit, skip }),
    col('auditLogs').count(filter),
  ]);

  res.json({ logs, total, limit, skip });
});

export default router;
