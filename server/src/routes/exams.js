import { Router } from 'express';
import { col, nextSeq } from '../db/index.js';
import { authRequired, allowRoles, STAFF_TEACHER, STAFF } from '../middleware/auth.js';
import { resolveEmailRecipients } from '../utils/emailRecipients.js';
import { enqueueEmailEvent } from '../utils/emailOutbox.js';
import { examTypeOrder, validateExamDetails } from '../utils/examTypes.js';
import { canAccessClass, teacherClassIds } from '../utils/accessScope.js';
import { acquireKeyedLock } from '../utils/keyedLock.js';

const router = Router();
router.use(authRequired);
const ACTIVE_CLASS_QUERY = { _deleted: { $ne: true }, status: { $ne: 'archived' } };

// ---------- Exams ----------
router.get('/', async (req, res) => {
  const query = { _deleted: { $ne: true } };
  if (req.query.status) query.status = req.query.status;
  if (req.query.type) query.type = req.query.type;
  let exams = await col('exams').find(query, { sort: { startDate: -1 } });
  if (req.user.role === 'student') {
    const student = await col('students').findOne({ _id: req.user.refId, status: 'active' });
    exams = student ? exams.filter((exam) => !(exam.classIds || []).length || exam.classIds.includes(student.classId)) : [];
  } else if (req.user.role === 'parent') {
    const students = await col('students').find({ status: 'active' });
    const classIds = new Set(students.filter((student) => (student.parentIds || []).includes(req.user.refId)).map((student) => student.classId));
    exams = exams.filter((exam) => !(exam.classIds || []).length || exam.classIds.some((classId) => classIds.has(classId)));
  } else if (req.user.role === 'teacher') {
    const classIds = new Set(await teacherClassIds(req.user.id));
    exams = exams.filter((exam) => !(exam.classIds || []).length
      || exam.classIds.some((classId) => classIds.has(classId)));
  }
  res.json(exams);
});

router.post('/', allowRoles(...STAFF), async (req, res) => {
  try {
    const b = { status: 'scheduled', ...req.body, classIds: Array.isArray(req.body.classIds) ? [...new Set(req.body.classIds.filter(Boolean))] : [] };
    validateExamDetails(b);
    const doc = await col('exams').insertOne({ ...b, sequenceOrder: examTypeOrder(b.type) });
    res.status(201).json(doc);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', allowRoles(...STAFF), async (req, res) => {
  try {
    const existing = await col('exams').findOne({ _id: req.params.id, _deleted: { $ne: true } });
    if (!existing) return res.status(404).json({ error: 'Exam not found' });
    const b = { ...req.body };
    delete b._id;
    if (b.classIds !== undefined) b.classIds = Array.isArray(b.classIds) ? [...new Set(b.classIds.filter(Boolean))] : [];
    const merged = { ...existing, ...b };
    validateExamDetails(merged);
    res.json(await col('exams').updateOne({ _id: req.params.id }, { ...b, sequenceOrder: examTypeOrder(merged.type) }));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', allowRoles('admin'), async (req, res) => {
  const exam = await col('exams').findOne({ _id: req.params.id, _deleted: { $ne: true } });
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  await col('exams').updateOne({ _id: req.params.id }, { _deleted: true, deletedAt: new Date().toISOString(), deletedBy: req.user.name });
  res.json({ ok: true });
});

router.post('/:id/publish-schedule', allowRoles('admin'), async (req, res) => {
  const exam = await col('exams').findOne({ _id: req.params.id, _deleted: { $ne: true } });
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  if (!exam.startDate || !exam.endDate) return res.status(400).json({ error: 'Add both start and end dates before publishing the exam schedule' });
  const classIds = exam.classIds || [];
  const result = classIds.length
    ? await resolveEmailRecipients({ audience: 'class', classIds })
    : await resolveEmailRecipients({ audience: 'parents' });
  const classes = classIds.length ? await col('classes').find({ _id: { $in: classIds }, ...ACTIVE_CLASS_QUERY }) : [];
  const className = classes.length ? classes.map((item) => `${item.name} ${item.section}`).join(', ') : 'All Grades / Classes';
  const publishedAt = new Date().toISOString();
  const queued = await enqueueEmailEvent({
    eventType: 'exam-schedule', entityType: 'exam', entityId: exam._id, version: publishedAt,
    recipients: result.recipients,
    payload: { exam: { ...exam, className, term: exam.type }, scheduleList: exam.scheduleList || [] },
    createdBy: req.user.name,
  });
  const updated = await col('exams').updateOne({ _id: exam._id }, {
    schedulePublishedAt: publishedAt,
    schedulePublishedBy: req.user.name,
    emailStatus: queued.queuedCount ? 'queued' : 'no-recipients',
    emailRecipientCount: queued.queuedCount,
    emailSkipped: result.skipped,
  });
  res.json({ exam: updated, queuedCount: queued.queuedCount, skipped: result.skipped });
});

// ---------- Grade helper ----------
function computeGrade(marks, maxMarks, passingMarks) {
  if (marks == null || marks === '') return { grade: '-', pass: false };
  const pct = (Number(marks) / Number(maxMarks || 100)) * 100;
  const pass = Number(marks) >= Number(passingMarks || 33);
  let grade = 'F';
  if (pct >= 90) grade = 'A+';
  else if (pct >= 80) grade = 'A';
  else if (pct >= 70) grade = 'B+';
  else if (pct >= 60) grade = 'B';
  else if (pct >= 50) grade = 'C';
  else if (pass) grade = 'D';
  return { grade, pass, pct: Math.round(pct * 10) / 10 };
}

async function validateMarksContext(examId, classId, subjectId) {
  if (!classId || !subjectId) throw new Error('Class and subject are required');
  const [exam, klass, subject] = await Promise.all([
    col('exams').findOne({ _id: examId, _deleted: { $ne: true } }),
    col('classes').findOne({ _id: classId, ...ACTIVE_CLASS_QUERY }),
    col('subjects').findOne({ _id: subjectId, _deleted: { $ne: true } }),
  ]);
  if (!exam) throw new Error('Exam not found');
  if (!klass) throw new Error('Class not found');
  if (!subject) throw new Error('Invalid subject');
  if ((exam.classIds || []).length && !exam.classIds.includes(classId)) throw new Error('This exam is not assigned to the selected class');
  if ((subject.classIds || []).length && !subject.classIds.includes(classId)) throw new Error('This subject is not assigned to the selected class');
  return { exam, subject };
}

async function cleanMarksEntries(classId, entries, subject) {
  if (!Array.isArray(entries)) throw new Error('Marks entries are required');
  const roster = await col('students').find({ classId, status: 'active' });
  const rosterIds = new Set(roster.map((student) => student._id));
  const seen = new Set();
  return entries.map((entry) => {
    if (!entry?.studentId || !rosterIds.has(entry.studentId)) throw new Error('Marks contain a student outside this class');
    if (seen.has(entry.studentId)) throw new Error('Marks contain a duplicate student');
    seen.add(entry.studentId);
    const empty = entry.marks === '' || entry.marks === null || entry.marks === undefined;
    const marks = empty ? null : Number(entry.marks);
    if (!empty && (!Number.isFinite(marks) || marks < 0 || marks > Number(subject.maxMarks || 100))) {
      throw new Error(`Marks must be between 0 and ${Number(subject.maxMarks || 100)}`);
    }
    const grade = computeGrade(marks, subject.maxMarks, subject.passingMarks);
    return { studentId: entry.studentId, marks, grade: grade.grade, pass: grade.pass };
  });
}

// ---------- Marks entry ----------
// Get marks sheet for exam + class + subject (pre-filled with roster)
router.get('/:examId/marks', allowRoles(...STAFF_TEACHER), async (req, res) => {
  const { classId, subjectId } = req.query;
  if (!classId || !subjectId) return res.status(400).json({ error: 'classId and subjectId are required' });
  if (!(await canAccessClass(req.user, classId))) return res.status(403).json({ error: 'You are not assigned to this class' });
  let subject;
  try {
    ({ subject } = await validateMarksContext(req.params.examId, classId, subjectId));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const students = await col('students').find({ classId, status: 'active' }, { sort: { rollNo: 1 } });
  const saved = await col('marks').findOne({ examId: req.params.examId, classId, subjectId });
  const entries = students.map((s) => {
    const e = saved?.entries?.find((x) => x.studentId === s._id);
    return {
      studentId: s._id, name: `${s.firstName} ${s.lastName || ''}`.trim(),
      rollNo: s.rollNo, admissionNo: s.admissionNo,
      marks: e?.marks ?? '', grade: e?.grade || '-',
    };
  });
  res.json({ status: saved?.status || 'draft', subject, entries });
});

// Save marks: action = draft | submitted | locked  (teacher & staff)
router.post('/:examId/marks', allowRoles(...STAFF_TEACHER), async (req, res) => {
  const { classId, subjectId, entries, action } = req.body;
  if (!(await canAccessClass(req.user, classId))) return res.status(403).json({ error: 'You are not assigned to this class' });
  const release = await acquireKeyedLock(`marks:${req.params.examId}:${classId}:${subjectId}`);
  try {
    const { subject } = await validateMarksContext(req.params.examId, classId, subjectId);
    const existing = await col('marks').findOne({ examId: req.params.examId, classId, subjectId });
    if (existing && ['locked', 'published'].includes(existing.status) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Marks are locked. Contact administrator to make changes.' });
    }
    const graded = await cleanMarksEntries(classId, entries, subject);
    const status = ['draft', 'submitted', 'locked'].includes(action) ? action : 'draft';
    const payload = { examId: req.params.examId, classId, subjectId, entries: graded, status, enteredBy: req.user.name };
    const doc = existing
      ? await col('marks').updateOne({ _id: existing._id }, payload)
      : await col('marks').insertOne(payload);
    res.json(doc);
  } catch (error) {
    res.status(400).json({ error: error.message });
  } finally {
    release();
  }
});

// Publish — ADMIN ONLY (makes results visible to students/parents)
router.post('/:examId/publish', allowRoles('admin'), async (req, res) => {
  const exam = await col('exams').findOne({ _id: req.params.examId, _deleted: { $ne: true } });
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const n = await col('marks').updateMany(
    { examId: req.params.examId, status: { $in: ['submitted', 'locked'] } },
    { status: 'published', publishedBy: req.user.name, publishedAt: new Date().toISOString() }
  );
  await col('exams').updateOne({ _id: req.params.examId }, { status: 'published' });
  res.json({ ok: true, publishedSheets: n });
});

// Results overview: toppers + grade distribution for an exam/class
router.get('/:examId/results', allowRoles(...STAFF_TEACHER), async (req, res) => {
  const { classId } = req.query;
  if (req.user.role === 'teacher' && (!classId || !(await canAccessClass(req.user, classId)))) {
    return res.status(403).json({ error: 'Select one of your assigned classes' });
  }
  const query = { examId: req.params.examId };
  if (classId) query.classId = classId;
  const sheets = await col('marks').find(query);
  const subjects = await col('subjects').find({ _deleted: { $ne: true } });
  const students = await col('students').find(classId
    ? { classId, status: { $ne: 'deleted' } }
    : { status: { $ne: 'deleted' } });

  const perStudent = {};
  const gradeDist = {};
  for (const sheet of sheets) {
    const subj = subjects.find((s) => s._id === sheet.subjectId);
    for (const e of sheet.entries || []) {
      if (e.marks == null) continue;
      if (!perStudent[e.studentId]) perStudent[e.studentId] = { total: 0, max: 0, subjects: [] };
      perStudent[e.studentId].total += e.marks;
      perStudent[e.studentId].max += subj?.maxMarks || 100;
      perStudent[e.studentId].subjects.push({ subject: subj?.name, marks: e.marks, grade: e.grade, maxMarks: subj?.maxMarks });
      gradeDist[e.grade] = (gradeDist[e.grade] || 0) + 1;
    }
  }
  const ranked = Object.entries(perStudent)
    .map(([studentId, v]) => {
      const s = students.find((x) => x._id === studentId);
      return {
        studentId, name: s ? `${s.firstName} ${s.lastName || ''}`.trim() : '?',
        admissionNo: s?.admissionNo, rollNo: s?.rollNo,
        total: v.total, max: v.max, pct: v.max ? Math.round((v.total / v.max) * 1000) / 10 : 0,
        subjects: v.subjects,
      };
    })
    .sort((a, b) => b.pct - a.pct)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  res.json({ ranked, gradeDist, sheets: sheets.map(({ entries, ...s }) => ({ ...s, entriesCount: entries?.length || 0 })) });
});

// ---------- Hall tickets ----------
router.get('/:examId/hall-tickets', async (req, res) => {
  const exam = await col('exams').findOne({ _id: req.params.examId, _deleted: { $ne: true } });
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  let students;
  if (req.user.role === 'student') {
    students = await col('students').find({ _id: req.user.refId, status: 'active' });
  } else if (req.user.role === 'parent') {
    students = await col('students').find({ parentIds: { $in: [req.user.refId] }, status: 'active' });
    students = students.filter((s) => (s.parentIds || []).includes(req.user.refId));
  } else if (req.user.role === 'teacher') {
    const classIds = await teacherClassIds(req.user.id);
    if (req.query.classId && !classIds.includes(req.query.classId)) {
      return res.status(403).json({ error: 'You are not assigned to this class' });
    }
    const allowed = req.query.classId ? [req.query.classId] : classIds;
    students = await col('students').find({ classId: { $in: allowed }, status: 'active' }, { sort: { rollNo: 1 } });
  } else {
    const q = { status: 'active' };
    if (req.query.classId) q.classId = req.query.classId;
    students = await col('students').find(q, { sort: { rollNo: 1 } });
  }
  if ((exam.classIds || []).length) students = students.filter((student) => exam.classIds.includes(student.classId));
  const classes = await col('classes').find(ACTIVE_CLASS_QUERY);
  const subjects = await col('subjects').find({ _deleted: { $ne: true } });
  const settings = await col('settings').findOne({ key: 'school' });
  const tickets = students.map((s) => {
    const klass = classes.find((c) => c._id === s.classId);
    const classSubjects = subjects.filter((x) => (x.classIds || []).includes(s.classId));
    return {
      student: { name: `${s.firstName} ${s.lastName || ''}`.trim(), admissionNo: s.admissionNo, rollNo: s.rollNo },
      className: klass ? `${klass.name} ${klass.section} (${klass.academicYear})` : '?',
      exam: { name: exam.name, startDate: exam.startDate, endDate: exam.endDate },
      subjects: classSubjects.map((x) => x.name),
      school: settings?.value?.schoolName || 'School',
    };
  });
  res.json(tickets);
});

export default router;
