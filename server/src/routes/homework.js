import { Router } from 'express';
import { col } from '../db/index.js';
import { authRequired, allowRoles, STAFF, STAFF_TEACHER } from '../middleware/auth.js';
import { resolveEmailRecipients } from '../utils/emailRecipients.js';
import { enqueueEmailEvent } from '../utils/emailOutbox.js';
import { canAccessClass, teacherClassIds } from '../utils/accessScope.js';
import { sendInternalError } from '../utils/httpErrors.js';

const router = Router();
router.use(authRequired);

// Helper to trigger email notifications to class parents
async function notifyClassParents(task) {
  try {
    const result = await resolveEmailRecipients({ audience: 'class', classIds: [task.classId] });
    if (result.recipients.length > 0) {
      const klass = await col('classes').findOne({ _id: task.classId });
      const subject = await col('subjects').findOne({ _id: task.subjectId, _deleted: { $ne: true } });
      const classNameStr = klass ? `${klass.name} ${klass.section}` : 'N/A';
      const subjectNameStr = subject ? subject.name : 'N/A';
      const queued = await enqueueEmailEvent({
        eventType: 'homework', entityType: 'homework', entityId: task._id,
        version: task.updatedAt || task.createdAt, recipients: result.recipients,
        payload: { task, className: classNameStr, subjectName: subjectNameStr }, createdBy: task.createdBy,
      });
      await col('homework').updateOne({ _id: task._id }, { emailStatus: 'queued', emailRecipientCount: queued.queuedCount, emailSkipped: result.skipped });
    } else {
      await col('homework').updateOne({ _id: task._id }, { emailStatus: 'no-recipients', emailRecipientCount: 0, emailSkipped: result.skipped });
    }
  } catch (err) {
    console.error('[Homework Email Trigger Error]', err);
  }
}

// 1. Get Homework tasks (filtered by user role/permissions)
router.get('/', async (req, res) => {
  try {
    const role = req.user.role;
    let query = { _deleted: { $ne: true } };

    if (role === 'student') {
      const student = await col('students').findOne({ _id: req.user.refId });
      if (!student) return res.status(404).json({ error: 'Student profile not found' });
      query.classId = student.classId;
      query.status = 'active';
    } else if (role === 'parent') {
      // Find linked students
      const allStudents = await col('students').find({ status: 'active' });
      const students = allStudents.filter(s => (s.parentIds || []).includes(req.user.refId));
      const requestedStudent = req.query.studentId
        ? students.find((student) => student._id === req.query.studentId)
        : null;
      if (req.query.studentId && !requestedStudent) return res.status(403).json({ error: 'This student is not linked to your account' });
      const classIds = students.map(s => s.classId).filter(Boolean);
      query.classId = requestedStudent ? requestedStudent.classId : { $in: classIds };
      query.status = 'active';
    } else {
      // Teachers & Staff can filter by classId or subjectId if provided
      if (req.query.classId) query.classId = req.query.classId;
      if (req.query.subjectId) query.subjectId = req.query.subjectId;
      if (req.query.status) query.status = req.query.status;
      if (role === 'teacher') {
        const classIds = await teacherClassIds(req.user.id);
        if (req.query.classId && !classIds.includes(req.query.classId)) {
          return res.status(403).json({ error: 'You are not assigned to this class' });
        }
        query.classId = req.query.classId || { $in: classIds };
      }
    }

    const list = await col('homework').find(query, { sort: { dueDate: 1 } });
    res.json(list);
  } catch (e) {
    sendInternalError(res, e, 'Homework list');
  }
});

// 2. Create Homework task (Teachers & Staff)
router.post('/', allowRoles(...STAFF_TEACHER), async (req, res) => {
  try {
    const b = req.body;
    if (!b.title || !b.classId || !b.subjectId || !b.dueDate) {
      return res.status(400).json({ error: 'Title, Class, Subject, and Due Date are required.' });
    }
    if (!(await canAccessClass(req.user, b.classId))) return res.status(403).json({ error: 'You are not assigned to this class' });

    const payload = {
      classId: b.classId,
      subjectId: b.subjectId,
      title: b.title,
      description: b.description || '',
      type: b.type || 'Homework',
      assignedDate: b.assignedDate || new Date().toISOString().slice(0, 10),
      dueDate: b.dueDate,
      status: b.status || 'active',
      attachment: b.attachment || null,
      createdBy: req.user.name || req.user.username || 'Teacher',
      createdAt: new Date().toISOString()
    };

    const doc = await col('homework').insertOne(payload);
    res.status(201).json(doc);

    // Trigger parent email alert if task is active
    if (payload.status === 'active') {
      notifyClassParents(doc);
    }
  } catch (e) {
    sendInternalError(res, e, 'Homework create');
  }
});

// 3. Edit Homework task (Teachers & Staff)
router.put('/:id', allowRoles(...STAFF_TEACHER), async (req, res) => {
  try {
    const b = { ...req.body };
    for (const key of ['_id', '_deleted', 'deletedAt', 'deletedBy', 'createdBy', 'createdAt']) delete b[key];

    const existing = await col('homework').findOne({ _id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (!(await canAccessClass(req.user, existing.classId)) || (b.classId && !(await canAccessClass(req.user, b.classId)))) {
      return res.status(403).json({ error: 'You are not assigned to this class' });
    }

    const updated = await col('homework').updateOne({ _id: req.params.id }, b);
    res.json(updated);

    // Trigger emails if task status is changed from draft to active
    if (b.status === 'active' && existing.status !== 'active') {
      notifyClassParents({ ...existing, ...b });
    }
  } catch (e) {
    sendInternalError(res, e, 'Homework update');
  }
});

// 4. Delete Homework task (Teachers & Staff)
router.delete('/:id', allowRoles(...STAFF_TEACHER), async (req, res) => {
  try {
    const existing = await col('homework').findOne({ _id: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (!(await canAccessClass(req.user, existing.classId))) return res.status(403).json({ error: 'You are not assigned to this class' });

    await col('homework').updateOne({ _id: req.params.id }, {
      _deleted: true, deletedAt: new Date().toISOString(), deletedBy: req.user.name,
    });
    res.json({ ok: true });
  } catch (e) {
    sendInternalError(res, e, 'Homework delete');
  }
});

export default router;
