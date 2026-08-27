import { Router } from 'express';
import { col } from '../db/index.js';
import { crudRouter } from './crudFactory.js';
import { authRequired, allowRoles, STAFF, STAFF_TEACHER, ALL_ROLES } from '../middleware/auth.js';
import { resolveEmailRecipients } from '../utils/emailRecipients.js';
import { enqueueEmailEvent } from '../utils/emailOutbox.js';
import { FEE_APPLIES_TO, FEE_FREQUENCY_MULTIPLIER } from '../utils/feeStructure.js';
import { canAccessClass, teacherClassIds } from '../utils/accessScope.js';

const router = Router();

async function userClassIds(req) {
  if (req.user.role === 'teacher') return teacherClassIds(req.user.id);
  if (req.user.role === 'student') {
    const student = await col('students').findOne({ _id: req.user.refId, status: 'active' });
    return student?.classId ? [student.classId] : [];
  }
  if (req.user.role === 'parent') {
    const students = await col('students').find({ status: 'active' });
    return [...new Set(students.filter((student) => (student.parentIds || []).includes(req.user.refId)).map((student) => student.classId).filter(Boolean))];
  }
  return null;
}

async function filterCommunicationRows(rows, req) {
  const classIds = await userClassIds(req);
  if (classIds === null) return rows;
  return rows.filter((row) => {
    const targets = Array.isArray(row.classIds) ? row.classIds.filter(Boolean) : [];
    if (targets.length) return targets.some((classId) => classIds.includes(classId));
    if (row.classId) return row.classId === 'all' || classIds.includes(row.classId);
    if (['teachers', 'staff'].includes(row.audience)) return false;
    if (row.audience && !['all', 'students', 'parents'].includes(row.audience)) return classIds.includes(row.audience);
    return true;
  });
}

// ---------- Classes (unique: name + section + academicYear) ----------
async function assertUniqueClass(body, req, ignoreId = null) {
  const dup = await col('classes').findOne({
    name: body.name, section: body.section, academicYear: body.academicYear, _deleted: { $ne: true },
  });
  if (dup && dup._id !== ignoreId) {
    throw new Error(`Class "${body.name} ${body.section} (${body.academicYear})" already exists`);
  }
  return body;
}

async function filterClassRows(rows, req) {
  if (['admin', 'clerk', 'supervisor', 'teacher'].includes(req.user.role)) return rows;
  const classIds = await userClassIds(req);
  if (classIds === null) return rows;
  return rows.filter((row) => classIds.includes(row._id));
}

// 5-minute in-memory cache for classes list (changes rarely)
const CLASSES_CACHE_MS = 5 * 60 * 1000;
let classesCache = null;
let classesCacheAt = 0;
function invalidateClassesCache() { classesCache = null; classesCacheAt = 0; }

const classesRouter = crudRouter('classes', {
  writeRoles: STAFF,
  beforeCreate: (b, req) => assertUniqueClass({ status: 'active', ...b }, req),
  beforeUpdate: (b, req) => (b.name && b.section && b.academicYear ? assertUniqueClass(b, req, req.params.id) : b),
  filterRead: async (rows, req) => {
    const filtered = await filterClassRows(rows, req);
    // Only cache for staff (not student/parent scoped views)
    if (['admin', 'clerk', 'supervisor', 'teacher'].includes(req.user.role)) {
      classesCache = filtered;
      classesCacheAt = Date.now();
    }
    return filtered;
  },
  afterCreate: async () => invalidateClassesCache(),
  afterUpdate: async () => invalidateClassesCache(),
  defaultSort: { name: 1 },
});

// Serve from cache for full unfiltered staff requests before hitting DB via crudRouter
const classesRouterWithCache = Router();
classesRouterWithCache.use(authRequired);
classesRouterWithCache.get('/', async (req, res, next) => {
  const staffRoles = ['admin', 'clerk', 'supervisor'];
  if (staffRoles.includes(req.user.role) && classesCache && Date.now() - classesCacheAt < CLASSES_CACHE_MS) {
    return res.json(classesCache);
  }
  return next();
});
classesRouterWithCache.use(classesRouter);
router.use('/classes', classesRouterWithCache);

// ---------- Simple CRUD modules ----------
router.use('/subjects', crudRouter('subjects', { writeRoles: STAFF, defaultSort: { name: 1 } }));
const feeStructures = Router();
feeStructures.use(authRequired);

const FEE_CATEGORIES = ['tuition', 'exam', 'activity', 'transport', 'one-time', 'lab', 'other'];

function cleanFeeStructure(body, existing = {}) {
  const next = { ...existing, ...body };
  const classIds = [...new Set(Array.isArray(next.classIds) ? next.classIds.filter(Boolean) : [])];
  const amount = Number(next.amount);
  const appliesTo = next.appliesTo || (next.category === 'one-time' ? FEE_APPLIES_TO.NEW : FEE_APPLIES_TO.ALL);
  if (!String(next.name || '').trim()) throw new Error('Fee component name is required');
  if (!classIds.length) throw new Error('Assign the fee component to at least one grade or section');
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Amount must be zero or greater');
  if (!FEE_CATEGORIES.includes(next.category)) throw new Error('Select a valid fee category');
  if (!Object.hasOwn(FEE_FREQUENCY_MULTIPLIER, next.frequency)) throw new Error('Select a valid frequency');
  if (!Object.values(FEE_APPLIES_TO).includes(appliesTo)) throw new Error('Select who this fee applies to');
  if (!['active', 'archived'].includes(next.status)) throw new Error('Select a valid status');
  return {
    name: String(next.name).trim(),
    category: next.category,
    frequency: next.frequency,
    amount,
    classIds,
    academicYear: String(next.academicYear || '').trim(),
    appliesTo,
    status: next.status,
  };
}

async function assertNoFeeConflict(candidate, ignoreId = null) {
  if (candidate.status !== 'active') return;
  const assignedClasses = await col('classes').find({ _id: { $in: candidate.classIds }, _deleted: { $ne: true }, status: { $ne: 'archived' } });
  if (assignedClasses.length !== candidate.classIds.length) throw new Error('One or more selected classes no longer exist');
  if (candidate.academicYear && assignedClasses.some((item) => item.academicYear !== candidate.academicYear)) {
    throw new Error('Every selected class must belong to the selected academic year');
  }
  const active = await col('feeStructures').find({ status: 'active' });
  const normalizedName = candidate.name.toLowerCase();
  const duplicate = active.find((item) => item._id !== ignoreId
    && String(item.name || '').trim().toLowerCase() === normalizedName
    && (!item.academicYear || !candidate.academicYear || String(item.academicYear) === candidate.academicYear)
    && (item.appliesTo || (item.category === 'one-time' ? FEE_APPLIES_TO.NEW : FEE_APPLIES_TO.ALL)) === candidate.appliesTo
    && (item.classIds || []).some((classId) => candidate.classIds.includes(classId)));
  if (duplicate) throw new Error('An active fee component with the same name, audience and academic year already covers one of the selected classes');
}

feeStructures.get('/', async (req, res) => {
  res.json(await col('feeStructures').find({}, { sort: { academicYear: -1, name: 1 } }));
});
feeStructures.post('/', allowRoles('admin'), async (req, res) => {
  try {
    const body = cleanFeeStructure({ status: 'active', appliesTo: FEE_APPLIES_TO.ALL, ...req.body });
    await assertNoFeeConflict(body);
    const now = new Date().toISOString();
    const doc = await col('feeStructures').insertOne({ ...body, createdBy: req.user.name, createdAt: now, updatedBy: req.user.name, updatedAt: now });
    res.status(201).json(doc);
  } catch (error) { res.status(400).json({ error: error.message }); }
});
feeStructures.put('/:id', allowRoles('admin'), async (req, res) => {
  try {
    const existing = await col('feeStructures').findOne({ _id: req.params.id, status: { $ne: 'archived' } });
    if (!existing) return res.status(404).json({ error: 'Fee component not found' });
    const body = cleanFeeStructure(req.body, existing);
    await assertNoFeeConflict(body, existing._id);
    const doc = await col('feeStructures').updateOne({ _id: existing._id }, {
      ...body,
      updatedBy: req.user.name,
      updatedAt: new Date().toISOString(),
      ...(body.status === 'archived' ? { archivedAt: new Date().toISOString() } : {}),
    });
    res.json(doc);
  } catch (error) { res.status(400).json({ error: error.message }); }
});
feeStructures.delete('/:id', allowRoles('admin'), async (req, res) => {
  const existing = await col('feeStructures').findOne({ _id: req.params.id, status: { $ne: 'archived' } });
  if (!existing) return res.status(404).json({ error: 'Fee component not found' });
  const doc = await col('feeStructures').updateOne({ _id: existing._id }, {
    status: 'archived', archivedAt: new Date().toISOString(), updatedBy: req.user.name, updatedAt: new Date().toISOString(),
  });
  res.json(doc);
});
router.use('/fee-structures', feeStructures);

const GENERATED_LEDGER_FIELDS = ['ledgerKey', 'receiptId', 'salarySlipId', 'bookIssueId'];

function isGeneratedLedger(record) {
  return GENERATED_LEDGER_FIELDS.some((field) => Boolean(record?.[field]));
}

function cleanManualAccount(body, req, existing = {}) {
  const next = { ...existing, ...body };
  for (const field of ['_id', '_deleted', 'deletedAt', 'deletedBy', 'createdAt', 'updatedAt', ...GENERATED_LEDGER_FIELDS]) {
    delete next[field];
  }
  const amount = Number(next.amount);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(next.date || ''))) throw new Error('Select a valid transaction date');
  if (!['income', 'expense'].includes(next.type)) throw new Error('Select a valid transaction type');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than zero');
  if (!String(next.category || '').trim()) throw new Error('Category is required');
  return {
    ...next,
    category: String(next.category).trim(),
    description: String(next.description || '').trim(),
    mode: String(next.mode || 'cash').trim(),
    amount,
    recordedBy: existing.recordedBy || req.user.name,
  };
}

router.use('/daily-accounts', crudRouter('dailyAccounts', {
  readRoles: STAFF,
  writeRoles: STAFF,
  deleteRoles: ['admin'],
  beforeCreate: (body, req) => cleanManualAccount(body, req),
  beforeUpdate: (body, req, existing) => cleanManualAccount(body, req, existing),
  authorizeUpdate: (existing) => !isGeneratedLedger(existing),
  authorizeDelete: (existing) => !isGeneratedLedger(existing),
  defaultSort: { date: -1 },
}));
async function notifyNoticeAudience(doc) {
  if (doc.status !== 'published') return;
  try {
    const targetClassIds = Array.isArray(doc.classIds) ? doc.classIds.filter(Boolean) : [];
    const result = targetClassIds.length
      ? await resolveEmailRecipients({ audience: 'class', classIds: targetClassIds })
      : await resolveEmailRecipients({ audience: 'parents' });
    const queued = await enqueueEmailEvent({
      eventType: 'notice', entityType: 'notice', entityId: doc._id,
      version: doc.updatedAt || doc.createdAt, recipients: result.recipients,
      payload: { ...doc, content: doc.body }, createdBy: doc.postedBy || 'System',
    });
    await col('notices').updateOne({ _id: doc._id }, { emailStatus: queued.queuedCount ? 'queued' : 'no-recipients', emailRecipientCount: queued.queuedCount, emailSkipped: result.skipped });
  } catch (err) {
    console.error('[Notice Email Error]', err);
  }
}

router.use('/notices', crudRouter('notices', {
  writeRoles: STAFF,
  defaultSort: { date: -1 },
  beforeCreate: async (body, req) => {
    const now = new Date().toISOString();
    return { ...body, audience: 'students', classIds: Array.isArray(body.classIds) ? body.classIds.filter(Boolean) : [], emailStatus: 'pending', postedBy: body.postedBy || req.user.name, createdAt: now, updatedAt: now };
  },
  beforeUpdate: async (body) => ({ ...body, audience: 'students', classIds: Array.isArray(body.classIds) ? body.classIds.filter(Boolean) : [], updatedAt: new Date().toISOString() }),
  filterRead: filterCommunicationRows,
  afterCreate: async (doc, req) => notifyNoticeAudience(doc),
  afterUpdate: async (doc, req) => notifyNoticeAudience(doc)
}));
async function notifyCalendarParents(doc) {
  const targetClassIds = Array.isArray(doc.classIds) ? doc.classIds.filter(Boolean) : [];
  const result = targetClassIds.length
    ? await resolveEmailRecipients({ audience: 'class', classIds: targetClassIds })
    : await resolveEmailRecipients({ audience: 'parents' });
  let gradeLabel = 'All Grades';
  if (targetClassIds.length) {
    const classes = await col('classes').find({ _id: { $in: targetClassIds } }).toArray();
    if (classes.length) gradeLabel = classes.map((klass) => `${klass.name} ${klass.section} (${klass.academicYear})`).join(', ');
  }
  const eventType = Number(doc.emailNotificationCount || 0) > 0 ? 'calendar-rescheduled' : 'calendar-scheduled';
  const queued = await enqueueEmailEvent({
    eventType,
    entityType: 'calendar',
    entityId: doc._id,
    version: doc.updatedAt || doc.createdAt,
    recipients: result.recipients,
    payload: { event: doc, gradeLabel },
    createdBy: doc.createdBy || 'System',
  });
  await col('calendarEvents').updateOne({ _id: doc._id }, {
    emailStatus: queued.queuedCount ? 'queued' : 'no-recipients',
    emailRecipientCount: queued.queuedCount,
    emailSkipped: result.skipped,
    emailNotificationCount: Number(doc.emailNotificationCount || 0) + 1,
  });
}

router.use('/calendar', crudRouter('calendarEvents', {
  writeRoles: STAFF,
  defaultSort: { date: 1 },
  beforeCreate: async (body, req) => {
    const now = new Date().toISOString();
    return { ...body, classIds: Array.isArray(body.classIds) ? body.classIds.filter(Boolean) : [], emailStatus: 'pending', createdBy: req.user.name, createdAt: now, updatedAt: now };
  },
  beforeUpdate: async (body) => ({ ...body, classIds: Array.isArray(body.classIds) ? body.classIds.filter(Boolean) : [], updatedAt: new Date().toISOString() }),
  filterRead: filterCommunicationRows,
  afterCreate: async (doc) => notifyCalendarParents(doc),
  afterUpdate: async (doc) => notifyCalendarParents(doc),
}));
const filterTeacherClassRows = async (rows, req) => {
  if (req.user.role !== 'teacher') return rows;
  const classIds = await teacherClassIds(req.user.id);
  return rows.filter((row) => classIds.includes(row.classId));
};
const manageTeachingRecord = async (record, nextOrReq, maybeReq) => {
  const req = maybeReq || nextOrReq;
  if (req.user.role !== 'teacher') return true;
  const ownsRecord = record.creatorId === req.user.id
    || (!record.creatorId && record.teacherName === req.user.name);
  if (!ownsRecord) return false;
  return !maybeReq || !nextOrReq.classId || canAccessClass(req.user, nextOrReq.classId);
};
const createTeachingRecord = async (body, req) => canAccessClass(req.user, body.classId);
const stampTeacher = (body, req) => ({
  ...body,
  ...(req.user.role === 'teacher' ? { teacherName: req.user.name, creatorId: req.user.id } : {}),
});

router.use('/lesson-plans', crudRouter('lessonPlans', {
  readRoles: STAFF_TEACHER, writeRoles: STAFF_TEACHER, defaultSort: { date: -1 },
  filterRead: filterTeacherClassRows, authorizeCreate: createTeachingRecord,
  authorizeUpdate: manageTeachingRecord, authorizeDelete: manageTeachingRecord,
  beforeCreate: stampTeacher, beforeUpdate: stampTeacher,
}));
router.use('/logbook', crudRouter('logbook', {
  readRoles: STAFF_TEACHER, writeRoles: STAFF_TEACHER, defaultSort: { date: -1 },
  filterRead: filterTeacherClassRows, authorizeCreate: createTeachingRecord,
  authorizeUpdate: manageTeachingRecord, authorizeDelete: manageTeachingRecord,
  beforeCreate: stampTeacher, beforeUpdate: stampTeacher,
}));

async function filterTeacherStudentRows(rows, req) {
  if (req.user.role !== 'teacher') return rows;
  const classIds = await teacherClassIds(req.user.id);
  const students = await col('students').find({ classId: { $in: classIds }, status: { $ne: 'deleted' } });
  const studentIds = new Set(students.map((student) => student._id));
  return rows.filter((row) => studentIds.has(row.studentId));
}
async function mayManageStudentRecord(record, nextOrReq, maybeReq) {
  const req = maybeReq || nextOrReq;
  if (req.user.role !== 'teacher') return true;
  const studentId = maybeReq ? (nextOrReq.studentId || record.studentId) : record.studentId;
  const student = await col('students').findOne({ _id: studentId, status: { $ne: 'deleted' } });
  return Boolean(student && await canAccessClass(req.user, student.classId));
}
async function stampStudentRecord(body, req, actorField, stampActor = true) {
  const student = await col('students').findOne({ _id: body.studentId, status: { $ne: 'deleted' } });
  if (!student || !(await canAccessClass(req.user, student.classId))) throw new Error('Select a student from one of your assigned classes');
  return {
    ...body,
    studentName: `${student.firstName} ${student.lastName || ''}`.trim(),
    ...(stampActor || req.user.role === 'teacher' ? { [actorField]: req.user.name } : {}),
  };
}

router.use('/discipline', crudRouter('discipline', {
  readRoles: STAFF_TEACHER, writeRoles: STAFF_TEACHER, defaultSort: { date: -1 },
  filterRead: filterTeacherStudentRows, authorizeCreate: mayManageStudentRecord,
  authorizeUpdate: mayManageStudentRecord, authorizeDelete: mayManageStudentRecord,
  beforeCreate: (body, req) => stampStudentRecord(body, req, 'reportedBy'),
  beforeUpdate: (body, req, existing) => stampStudentRecord({ ...body, studentId: body.studentId || existing.studentId }, req, 'reportedBy', false),
}));
router.use('/conduct', crudRouter('conduct', {
  readRoles: STAFF_TEACHER, writeRoles: STAFF_TEACHER, defaultSort: { date: -1 },
  filterRead: filterTeacherStudentRows, authorizeCreate: mayManageStudentRecord,
  authorizeUpdate: mayManageStudentRecord, authorizeDelete: mayManageStudentRecord,
  beforeCreate: (body, req) => stampStudentRecord(body, req, 'by'),
  beforeUpdate: (body, req, existing) => stampStudentRecord({ ...body, studentId: body.studentId || existing.studentId }, req, 'by', false),
}));
async function notifyActivityParents(doc) {
  if (!['scheduled', 'cancelled'].includes(doc.status)) return;

  const targetClassIds = Array.isArray(doc.classIds) ? doc.classIds.filter(Boolean) : [];
  const result = targetClassIds.length
    ? await resolveEmailRecipients({ audience: 'class', classIds: targetClassIds })
    : await resolveEmailRecipients({ audience: 'parents' });
  let gradeLabel = 'All Grades';
  if (targetClassIds.length) {
    const classes = await col('classes').find({ _id: { $in: targetClassIds } });
    if (classes.length) gradeLabel = classes.map((klass) => `${klass.name} ${klass.section} (${klass.academicYear})`).join(', ');
  }
  const eventType = doc.status === 'cancelled'
    ? 'activity-cancelled'
    : Number(doc.emailNotificationCount || 0) > 0 ? 'activity-rescheduled' : 'activity-scheduled';
  const queued = await enqueueEmailEvent({
    eventType,
    entityType: 'activity',
    entityId: doc._id,
    version: doc.updatedAt || doc.createdAt,
    recipients: result.recipients,
    payload: { activity: doc, gradeLabel },
    createdBy: doc.createdBy || 'System',
  });
  await col('activities').updateOne({ _id: doc._id }, {
    emailStatus: queued.queuedCount ? 'queued' : 'no-recipients',
    emailRecipientCount: queued.queuedCount,
    emailSkipped: result.skipped,
    emailNotificationCount: Number(doc.emailNotificationCount || 0) + 1,
  });
}

async function mayManageTargetedCommunication(record, nextOrReq, maybeReq) {
  const req = maybeReq || nextOrReq;
  if (req.user.role !== 'teacher') return true;
  const next = maybeReq ? { ...record, ...nextOrReq } : record;
  const targetClassIds = Array.isArray(next.classIds) && next.classIds.length
    ? next.classIds.filter(Boolean)
    : next.classId && next.classId !== 'all' ? [next.classId] : [];
  if (!targetClassIds.length) return false;
  const allowedClassIds = await teacherClassIds(req.user.id);
  return targetClassIds.every((classId) => allowedClassIds.includes(classId));
}

router.use('/activities', crudRouter('activities', {
  writeRoles: STAFF_TEACHER,
  defaultSort: { date: -1 },
  beforeCreate: async (body, req) => {
    const now = new Date().toISOString();
    return { ...body, classIds: Array.isArray(body.classIds) ? body.classIds.filter(Boolean) : [], emailStatus: 'pending', createdBy: req.user.name, createdAt: now, updatedAt: now };
  },
  beforeUpdate: async (body) => ({ ...body, classIds: Array.isArray(body.classIds) ? body.classIds.filter(Boolean) : [], updatedAt: new Date().toISOString() }),
  filterRead: filterCommunicationRows,
  authorizeCreate: mayManageTargetedCommunication,
  authorizeUpdate: mayManageTargetedCommunication,
  authorizeDelete: mayManageTargetedCommunication,
  afterCreate: async (doc) => notifyActivityParents(doc),
  afterUpdate: async (doc) => notifyActivityParents(doc),
}));
const filterOwnSubmissions = (rows, req) => STAFF.includes(req.user.role)
  ? rows
  : rows.filter((row) => row.raisedBy === req.user.username);
const stampSubmissionOwner = (body, req) => {
  const next = { ...body };
  if (!STAFF.includes(req.user.role)) {
    delete next.assignedTo;
    delete next.resolution;
  }
  return {
    ...next,
    raisedBy: req.user.username,
    role: req.user.role,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
};

router.use('/helpdesk', crudRouter('helpdesk', {
  createRoles: ALL_ROLES,
  updateRoles: STAFF,
  deleteRoles: ['admin'],
  beforeCreate: stampSubmissionOwner,
  filterRead: filterOwnSubmissions,
  defaultSort: { createdAt: -1 },
}));
router.use('/complaints', crudRouter('complaints', {
  createRoles: ALL_ROLES,
  updateRoles: STAFF,
  deleteRoles: ['admin'],
  beforeCreate: stampSubmissionOwner,
  filterRead: filterOwnSubmissions,
  defaultSort: { createdAt: -1 },
}));
async function notifyDocumentAudience(doc) {
  try {
    const targetClassIds = Array.isArray(doc.classIds) ? doc.classIds.filter(Boolean) : [];
    const classes = targetClassIds.length ? await col('classes').find({ _id: { $in: targetClassIds } }) : [];
    const audienceLabel = classes.length ? classes.map((klass) => `${klass.name} ${klass.section} (${klass.academicYear})`).join(', ') : 'All Grades';
    const result = targetClassIds.length
      ? await resolveEmailRecipients({ audience: 'class', classIds: targetClassIds })
      : await resolveEmailRecipients({ audience: 'parents' });
    const queued = await enqueueEmailEvent({
      eventType: 'document', entityType: 'document', entityId: doc._id,
      version: doc.updatedAt || doc.createdAt, recipients: result.recipients,
      payload: { ...doc, className: audienceLabel }, createdBy: doc.uploadedBy || 'System',
    });
    await col('documents').updateOne({ _id: doc._id }, { emailStatus: queued.queuedCount ? 'queued' : 'no-recipients', emailRecipientCount: queued.queuedCount, emailSkipped: result.skipped });
  } catch (err) {
    await col('documents').updateOne({ _id: doc._id }, { emailStatus: 'failed' });
    console.error('[Document Email Error]', err);
  }
}

router.use('/documents', crudRouter('documents', {
  writeRoles: STAFF,
  defaultSort: { createdAt: -1 },
  beforeCreate: async (body) => ({ ...body, audience: 'students', classIds: Array.isArray(body.classIds) ? body.classIds.filter(Boolean) : [], emailStatus: 'pending' }),
  filterRead: filterCommunicationRows,
  afterCreate: async (doc) => notifyDocumentAudience(doc),
}));
async function notifyPTMParents(doc) {
  if (!['scheduled', 'cancelled'].includes(doc.status)) return;

  const targetClassId = doc.classId || 'all';
  const targetClassIds = (doc.classIds || []).length ? doc.classIds : targetClassId === 'all' ? [] : [targetClassId];
  let gradeLabel = 'All Grades';
  const result = !targetClassIds.length
    ? await resolveEmailRecipients({ audience: 'parents' })
    : await resolveEmailRecipients({ audience: 'class', classIds: targetClassIds });
  if (targetClassIds.length) {
    const classes = await col('classes').find({ _id: { $in: targetClassIds } });
    if (classes.length) gradeLabel = classes.map((klass) => `${klass.name} ${klass.section} (${klass.academicYear})`).join(', ');
  }
  const eventType = doc.status === 'cancelled' ? 'ptm-cancelled' : Number(doc.emailNotificationCount || 0) > 0 ? 'ptm-rescheduled' : 'ptm-scheduled';
  const queued = await enqueueEmailEvent({
    eventType, entityType: 'ptm', entityId: doc._id, version: doc.updatedAt || doc.createdAt,
    recipients: result.recipients, payload: { meeting: doc, gradeLabel }, createdBy: doc.createdBy || 'System',
  });
  await col('ptm').updateOne({ _id: doc._id }, {
    emailStatus: queued.queuedCount ? 'queued' : 'no-recipients',
    emailRecipientCount: queued.queuedCount,
    emailSkipped: result.skipped,
    emailNotificationCount: Number(doc.emailNotificationCount || 0) + 1,
  });
}

router.use('/ptm', crudRouter('ptm', {
  writeRoles: STAFF_TEACHER,
  defaultSort: { date: -1 },
  beforeCreate: async (body, req) => ({ ...body, createdBy: req.user.name }),
  filterRead: filterCommunicationRows,
  authorizeCreate: mayManageTargetedCommunication,
  authorizeUpdate: mayManageTargetedCommunication,
  authorizeDelete: mayManageTargetedCommunication,
  afterCreate: async (doc) => notifyPTMParents(doc),
  afterUpdate: async (doc) => notifyPTMParents(doc),
}));

// ---------- Timetable (one doc per class) ----------
const tt = Router();
tt.use(authRequired);
tt.get('/:classId', async (req, res) => {
  if (['admin', 'clerk', 'supervisor', 'teacher'].includes(req.user.role)) {
    const doc = await col('timetables').findOne({ classId: req.params.classId });
    return res.json(doc || { classId: req.params.classId, periods: [] });
  }
  const classIds = await userClassIds(req);
  if (classIds !== null && !classIds.includes(req.params.classId)) {
    return res.status(404).json({ error: 'Timetable not found' });
  }
  const doc = await col('timetables').findOne({ classId: req.params.classId });
  res.json(doc || { classId: req.params.classId, periods: [] });
});
tt.post('/:classId', allowRoles(...STAFF), async (req, res) => {
  const existing = await col('timetables').findOne({ classId: req.params.classId });
  const payload = { classId: req.params.classId, periods: req.body.periods || [] };
  const doc = existing
    ? await col('timetables').updateOne({ _id: existing._id }, payload)
    : await col('timetables').insertOne(payload);
  res.json(doc);
});
router.use('/timetables', tt);

// ---------- Settings (single document, includes theme colors) ----------
const settings = Router();
settings.use(authRequired);
settings.get('/', async (req, res) => {
  const doc = await col('settings').findOne({ key: 'school' });
  res.json(doc?.value || {});
});
settings.put('/', allowRoles('admin'), async (req, res) => {
  const existing = await col('settings').findOne({ key: 'school' });
  const value = { ...(existing?.value || {}), ...req.body };
  const doc = existing
    ? await col('settings').updateOne({ _id: existing._id }, { value })
    : await col('settings').insertOne({ key: 'school', value });
  res.json(doc.value);
});
router.use('/settings', settings);

export default router;
