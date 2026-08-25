import { col } from '../db/index.js';
import { sendEmailByType } from './emailService.js';

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 300_000, 1_200_000];
let processing = false;

const ENTITY_COLLECTIONS = {
  feeReceipt: 'feeReceipts', notice: 'notices', document: 'documents', exam: 'exams', ptm: 'ptm', activity: 'activities', homework: 'homework',
};

async function syncEntityEmailStatus(job) {
  const collectionName = ENTITY_COLLECTIONS[job.entityType];
  if (!collectionName) return;
  const deliveries = await col('emailDeliveries').find({ entityType: job.entityType, entityId: job.entityId, version: job.version });
  const statuses = deliveries.map((delivery) => delivery.status);
  let emailStatus = 'queued';
  if (statuses.length && statuses.every((status) => ['sent', 'simulated'].includes(status))) emailStatus = statuses.includes('simulated') ? 'simulated' : 'sent';
  else if (statuses.length && statuses.every((status) => status === 'failed')) emailStatus = 'failed';
  else if (statuses.some((status) => ['sent', 'simulated'].includes(status)) && statuses.some((status) => status === 'failed')) emailStatus = 'partial';
  await col(collectionName).updateOne({ _id: job.entityId }, { emailStatus });
}

export async function enqueueEmailEvent({ eventType, entityType, entityId, version, recipients, payload, createdBy }) {
  const created = [];
  let duplicateCount = 0;
  for (const recipient of recipients) {
    const uniqueKey = [eventType, entityType, entityId, version, recipient.email].join(':');
    const existing = await col('emailDeliveries').findOne({ uniqueKey });
    if (existing) {
      duplicateCount += 1;
      continue;
    }
    try {
      created.push(await col('emailDeliveries').insertOne({
        uniqueKey,
        eventType,
        entityType,
        entityId,
        version,
        recipient: recipient.email,
        recipientId: recipient.recipientId,
        recipientType: recipient.recipientType,
        payload,
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: new Date().toISOString(),
        createdBy,
      }));
    } catch (error) {
      if (error?.code !== 11000) throw error;
      duplicateCount += 1;
    }
  }
  if (created.length) queueMicrotask(() => processEmailOutbox().catch((error) => console.error('[Email Outbox]', error)));
  return { queuedCount: created.length, duplicateCount };
}

export async function processEmailOutbox(limit = 20) {
  if (processing) return;
  processing = true;
  try {
    const now = new Date().toISOString();
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await col('emailDeliveries').updateMany(
      { status: 'sending', lastAttemptAt: { $lte: staleBefore } },
      { status: 'retry', nextAttemptAt: now, failureReason: 'Delivery worker was interrupted; retrying safely' }
    );
    const jobs = await col('emailDeliveries').find({
      status: { $in: ['pending', 'retry'] },
      nextAttemptAt: { $lte: now },
    }, { sort: { createdAt: 1 }, limit });

    for (const job of jobs) {
      const attemptCount = Number(job.attemptCount || 0) + 1;
      const claimed = await col('emailDeliveries').updateOne(
        { _id: job._id, status: { $in: ['pending', 'retry'] } },
        { status: 'sending', attemptCount, lastAttemptAt: new Date().toISOString() }
      );
      if (!claimed) continue;
      try {
        const result = await sendEmailByType(claimed.eventType, claimed.recipient, claimed.payload);
        await col('emailDeliveries').updateOne({ _id: job._id }, {
          status: String(result?.messageId || '').startsWith('mock-') ? 'simulated' : 'sent',
          messageId: result?.messageId || '',
          sentAt: new Date().toISOString(),
          failureReason: '',
        });
        await syncEntityEmailStatus(job);
      } catch (error) {
        const exhausted = attemptCount >= MAX_ATTEMPTS;
        await col('emailDeliveries').updateOne({ _id: job._id }, {
          status: exhausted ? 'failed' : 'retry',
          failureReason: error.message,
          nextAttemptAt: new Date(Date.now() + RETRY_DELAYS_MS[Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)]).toISOString(),
        });
        await syncEntityEmailStatus(job);
      }
    }
  } finally {
    processing = false;
  }
}

export async function deliverySummary(entityType, entityId) {
  const deliveries = await col('emailDeliveries').find({ entityType, entityId });
  const counts = {};
  for (const delivery of deliveries) counts[delivery.status] = (counts[delivery.status] || 0) + 1;
  return { total: deliveries.length, counts };
}
