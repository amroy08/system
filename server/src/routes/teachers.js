import { Router } from 'express';
import { col } from '../db/index.js';
import { authRequired, allowRoles, STAFF, STAFF_TEACHER } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);
const ACTIVE_CLASS_QUERY = { _deleted: { $ne: true }, status: { $ne: 'archived' } };

// Teachers overview (teacher users + their assignments)
router.get('/', allowRoles(...STAFF_TEACHER), async (req, res) => {
  const [teachers, assignments, classes] = await Promise.all([
    col('users').find({ role: 'teacher', status: { $ne: 'deleted' } }, { sort: { fullName: 1 } }),
    col('assignments').find({ _deleted: { $ne: true } }),
    col('classes').find(ACTIVE_CLASS_QUERY),
  ]);
  res.json(teachers.map((t) => {
    const mine = assignments.filter((a) => a.teacherId === t._id);
    const classTeacherOf = classes.find((c) => c.classTeacherId === t._id);
    const {
      passwordHash, loginAttempts, lockedUntil, tokenVersion, credentialVersion,
      legacyCredentialDisabledAt, credentialResetAt, passwordChangeRequired,
      ...pub
    } = t;
    return {
      ...pub,
      classCount: new Set(mine.map((a) => a.classId)).size,
      subjectCount: new Set(mine.map((a) => a.subjectId)).size,
      assignmentCount: mine.length,
      classTeacherOf: classTeacherOf ? `${classTeacherOf.name} ${classTeacherOf.section} (${classTeacherOf.academicYear})` : null,
    };
  }));
});

// Assignments (teacher <-> class <-> subject)
router.get('/assignments', allowRoles(...STAFF_TEACHER), async (req, res) => {
  const query = { _deleted: { $ne: true } };
  if (req.user.role === 'teacher') query.teacherId = req.user.id;
  else if (req.query.teacherId) query.teacherId = req.query.teacherId;
  if (req.query.classId) query.classId = req.query.classId;
  res.json(await col('assignments').find(query));
});

router.post('/assignments', allowRoles(...STAFF), async (req, res) => {
  const { teacherId, classId, subjectId } = req.body;
  if (!teacherId || !classId || !subjectId) return res.status(400).json({ error: 'Teacher, class and subject are required' });
  const [teacher, klass, subject] = await Promise.all([
    col('users').findOne({ _id: teacherId, role: 'teacher', status: 'active' }),
    col('classes').findOne({ _id: classId, ...ACTIVE_CLASS_QUERY }),
    col('subjects').findOne({ _id: subjectId, _deleted: { $ne: true } }),
  ]);
  if (!teacher) return res.status(400).json({ error: 'Please select an active teacher' });
  if (!klass) return res.status(400).json({ error: 'Please select an active class' });
  if (!subject) return res.status(400).json({ error: 'Please select an active subject' });
  const dup = await col('assignments').findOne({ teacherId, classId, subjectId, _deleted: { $ne: true } });
  if (dup) return res.status(400).json({ error: 'This assignment already exists' });
  res.status(201).json(await col('assignments').insertOne({ teacherId, classId, subjectId }));
});

router.delete('/assignments/:id', allowRoles(...STAFF), async (req, res) => {
  const assignment = await col('assignments').findOne({ _id: req.params.id, _deleted: { $ne: true } });
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
  await col('assignments').updateOne({ _id: req.params.id }, {
    _deleted: true, deletedAt: new Date().toISOString(), deletedBy: req.user.name,
  });
  res.json({ ok: true });
});

// Substitutes: load an absent teacher's periods for a date, allocate a substitute
router.get('/substitutes', allowRoles(...STAFF_TEACHER), async (req, res) => {
  const query = { _deleted: { $ne: true } };
  if (req.user.role === 'teacher') {
    query.$or = [{ absentTeacherId: req.user.id }, { substituteTeacherId: req.user.id }];
  }
  if (req.query.date) query.date = req.query.date;
  res.json(await col('substitutes').find(query, { sort: { date: -1 } }));
});

router.get('/substitutes/periods', allowRoles(...STAFF), async (req, res) => {
  const { teacherId, day } = req.query;
  const timetables = await col('timetables').find({});
  const periods = [];
  for (const tt of timetables) {
    for (const p of tt.periods || []) {
      if (p.teacherId === teacherId && (!day || p.day === day)) {
        periods.push({ ...p, classId: tt.classId });
      }
    }
  }
  res.json(periods);
});

router.post('/substitutes', allowRoles(...STAFF), async (req, res) => {
  const b = { ...req.body };
  for (const key of ['_id', '_deleted', 'deletedAt', 'deletedBy', 'status']) delete b[key];
  if (!b.absentTeacherId || !b.substituteTeacherId || !b.date) {
    return res.status(400).json({ error: 'Absent teacher, substitute teacher and date are required' });
  }
  res.status(201).json(await col('substitutes').insertOne({ ...b, status: 'allocated' }));
});

router.delete('/substitutes/:id', allowRoles(...STAFF), async (req, res) => {
  const substitute = await col('substitutes').findOne({ _id: req.params.id, _deleted: { $ne: true } });
  if (!substitute) return res.status(404).json({ error: 'Substitute allocation not found' });
  await col('substitutes').updateOne({ _id: req.params.id }, {
    _deleted: true, deletedAt: new Date().toISOString(), deletedBy: req.user.name,
  });
  res.json({ ok: true });
});

export default router;
