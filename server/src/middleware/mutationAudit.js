import crypto from 'node:crypto';
import { col } from '../db/index.js';

export function requestContext(req, res, next) {
  req.requestId = req.get('x-request-id') || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

export function mutationAudit(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  res.once('finish', () => {
    if (!req.user || res.statusCode >= 500) return;
    col('auditLogs').insertOne({
      requestId: req.requestId,
      action: `${req.method} ${req.baseUrl}${req.route?.path || req.path}`,
      method: req.method,
      resource: `${req.baseUrl}${req.path}`,
      statusCode: res.statusCode,
      actorId: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.role,
      targetId: req.params?.id || null,
      ip: req.ip,
      userAgent: String(req.get('user-agent') || '').slice(0, 300),
      occurredAt: new Date().toISOString(),
    }).catch((error) => console.error('[Mutation Audit]', error.message));
  });
  next();
}
