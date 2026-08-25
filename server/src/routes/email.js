import { Router } from 'express';
import { col } from '../db/index.js';
import { authRequired, allowRoles, STAFF, STAFF_TEACHER } from '../middleware/auth.js';
import { getEmailHealth } from '../utils/emailService.js';
import { classifyEmail, resolveEmailRecipients, resolveMixedAudience } from '../utils/emailRecipients.js';
import { enqueueEmailEvent, processEmailOutbox } from '../utils/emailOutbox.js';

const router = Router();
router.use(authRequired);

router.post('/recipient-preview', allowRoles(...STAFF_TEACHER), async (req, res) => {
  const { audience, classIds = [], studentIds = [] } = req.body;
  const result = audience === 'all' || audience === 'teachers' || audience === 'staff' || audience === 'parents'
    ? await resolveMixedAudience(audience)
    : await resolveEmailRecipients({ audience: classIds.length ? 'class' : 'students', classIds, studentIds });
  res.json({ eligibleCount: result.eligibleCount, candidateCount: result.candidateCount, skipped: result.skipped, studentCount: result.studentCount || 0 });
});

router.get('/health', allowRoles('admin'), async (req, res) => {
  const health = await getEmailHealth();
  const deliveries = await col('emailDeliveries').find({});
  const counts = {};
  for (const delivery of deliveries) counts[delivery.status] = (counts[delivery.status] || 0) + 1;
  res.json({ ...health, counts });
});

router.get('/deliveries', allowRoles('admin'), async (req, res) => {
  const query = req.query.status ? { status: req.query.status } : {};
  const rows = await col('emailDeliveries').find(query, { sort: { createdAt: -1 }, limit: 100 });
  res.json(rows.map(({ payload, ...row }) => row));
});

router.post('/test', allowRoles('admin'), async (req, res) => {
  const classified = classifyEmail(req.body.email);
  if (classified.reason) return res.status(400).json({ error: 'Enter a valid, non-dummy test email address' });
  const version = new Date().toISOString();
  const result = await enqueueEmailEvent({
    eventType: 'test', entityType: 'email-test', entityId: req.user.id, version,
    recipients: [{ email: classified.email, recipientId: req.user.id, recipientType: 'user' }],
    payload: { requestedBy: req.user.name }, createdBy: req.user.name,
  });
  await processEmailOutbox();
  res.json(result);
});

router.post('/deliveries/:id/retry', allowRoles('admin'), async (req, res) => {
  const delivery = await col('emailDeliveries').findOne({ _id: req.params.id });
  if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
  if (!['failed', 'retry'].includes(delivery.status)) return res.status(400).json({ error: 'Only failed deliveries can be retried' });
  await col('emailDeliveries').updateOne({ _id: delivery._id }, { status: 'pending', attemptCount: 0, nextAttemptAt: new Date().toISOString(), retriedBy: req.user.name });
  await processEmailOutbox();
  res.json({ ok: true });
});

export default router;
