import { Router } from 'express';
import { col } from '../db/index.js';
import { authRequired, allowRoles } from '../middleware/auth.js';

/**
 * Generic CRUD router used by most modules.
 * options:
 *  - readRoles / writeRoles: role arrays (default: any authenticated / staff)
 *  - createRoles / updateRoles / deleteRoles: optional per-action role arrays
 *  - beforeCreate(body, req): async transform hook
 *  - beforeUpdate(body, req): async transform hook
 *  - defaultSort: e.g. { createdAt: -1 }
 */
export function crudRouter(collectionName, options = {}) {
  const {
    readRoles = null,
    writeRoles = ['admin', 'clerk', 'supervisor'],
    createRoles = writeRoles,
    updateRoles = writeRoles,
    deleteRoles = writeRoles,
    beforeCreate,
    beforeUpdate,
    afterCreate,
    afterUpdate,
    authorizeCreate,
    authorizeUpdate,
    authorizeDelete,
    filterRead,
    defaultSort = { createdAt: -1 },
  } = options;

  const router = Router();
  router.use(authRequired);
  const readGuard = readRoles ? allowRoles(...readRoles) : (req, res, next) => next();
  const createGuard = allowRoles(...createRoles);
  const updateGuard = allowRoles(...updateRoles);
  const deleteGuard = allowRoles(...deleteRoles);

  router.get('/', readGuard, async (req, res) => {
    const query = { _deleted: { $ne: true } };
    // Allow simple equality filters via query string: ?status=active&classId=xyz
    for (const [k, v] of Object.entries(req.query)) {
      if (['sort', 'limit', 'skip', 'search', 'searchFields'].includes(k)) continue;
      if (k.startsWith('$') || ['__proto__', 'prototype', 'constructor'].includes(k)) continue;
      query[k] = v;
    }
    let docs = await col(collectionName).find(query, { sort: defaultSort });
    if (filterRead) docs = await filterRead(docs, req);
    if (req.query.search && req.query.searchFields) {
      const term = String(req.query.search).toLowerCase();
      const fields = String(req.query.searchFields).split(',');
      docs = docs.filter((d) => fields.some((f) => String(d[f] ?? '').toLowerCase().includes(term)));
    }
    res.json(docs);
  });

  router.get('/:id', readGuard, async (req, res) => {
    const doc = await col(collectionName).findOne({ _id: req.params.id, _deleted: { $ne: true } });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const visible = filterRead ? await filterRead([doc], req) : [doc];
    if (!visible.length) return res.status(404).json({ error: 'Not found' });
    res.json(visible[0]);
  });

  router.post('/', createGuard, async (req, res) => {
    try {
      let body = { ...req.body };
      delete body._id;
      delete body._deleted;
      delete body.deletedAt;
      delete body.deletedBy;
      if (authorizeCreate && !(await authorizeCreate(body, req))) {
        return res.status(403).json({ error: 'You do not have permission for this record' });
      }
      if (beforeCreate) body = await beforeCreate(body, req);
      const doc = await col(collectionName).insertOne(body);
      res.status(201).json(doc);

      if (afterCreate) {
        afterCreate(doc, req).catch((err) => console.error(`[CRUD Hook Error] afterCreate on ${collectionName}:`, err));
      }
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.put('/:id', updateGuard, async (req, res) => {
    try {
      let body = { ...(req.body || {}) };
      const existing = await col(collectionName).findOne({ _id: req.params.id, _deleted: { $ne: true } });
      if (!existing) return res.status(404).json({ error: 'Not found' });
      if (authorizeUpdate && !(await authorizeUpdate(existing, body, req))) {
        return res.status(403).json({ error: 'You do not have permission for this record' });
      }
      if (beforeUpdate) body = await beforeUpdate(body, req, existing);
      delete body._id;
      delete body._deleted;
      delete body.deletedAt;
      delete body.deletedBy;
      const doc = await col(collectionName).updateOne({ _id: req.params.id }, body);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      res.json(doc);

      if (afterUpdate) {
        afterUpdate(doc, req).catch((err) => console.error(`[CRUD Hook Error] afterUpdate on ${collectionName}:`, err));
      }
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.delete('/:id', deleteGuard, async (req, res) => {
    const doc = await col(collectionName).findOne({ _id: req.params.id, _deleted: { $ne: true } });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (authorizeDelete && !(await authorizeDelete(doc, req))) {
      return res.status(403).json({ error: 'You do not have permission for this record' });
    }
    await col(collectionName).updateOne({ _id: req.params.id }, {
      _deleted: true, deletedAt: new Date().toISOString(), deletedBy: req.user.name,
    });
    res.json({ ok: true });
  });

  return router;
}
