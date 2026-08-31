import { Router } from 'express';
import { col } from '../db/index.js';
import { authRequired, allowRoles } from '../middleware/auth.js';
import { summarizeStudentFees } from '../utils/studentFees.js';
import { formatClass } from '../utils/classNames.js';

// Student & Parent portal: scoped views of "my" data
const router = Router();
router.use(authRequired);
const ACTIVE_CLASS_QUERY = { _deleted: { $ne: true }, status: { $ne: 'archived' } };

function targetsClass(record, classId) {
  const classIds = Array.isArray(record.classIds) ? record.classIds.filter(Boolean) : [];
  if (classIds.length) return classIds.includes(classId);
  if (record.classId) return record.classId === 'all' || record.classId === classId;
  if (record.audience) {
    if (['teachers', 'staff'].includes(record.audience)) return false;
    if (!['all', 'students', 'parents'].includes(record.audience)) return record.audience === classId;
  }
  return true;
}

function portalStudent(student) {
  const { documents, profilePhoto, ...visible } = student;
  return visible;
}

async function studentSnapshot(studentId) {
  const student = await col('students').findOne({ _id: studentId, status: { $ne: 'deleted' } });
  if (!student) return null;

  // Fire all independent queries concurrently
  const [klass, allAttendance, sheets, exams, subjects, receipts, notices, meetings, activities, documents, homework, lessonPlans] =
    await Promise.all([
      col('classes').findOne({ _id: student.classId, ...ACTIVE_CLASS_QUERY }),
      col('attendance').find({ classId: student.classId }),
      col('marks').find({ classId: student.classId, status: 'published' }),
      col('exams').find({ _deleted: { $ne: true } }),
      col('subjects').find({ _deleted: { $ne: true } }),
      col('feeReceipts').find({ studentId }, { sort: { date: -1 } }),
      col('notices').find({ _deleted: { $ne: true }, status: 'published' }, { sort: { date: -1 } }),
      col('ptm').find({ _deleted: { $ne: true } }, { sort: { date: -1 } }),
      col('activities').find({ _deleted: { $ne: true } }, { sort: { date: -1 } }),
      col('documents').find({ _deleted: { $ne: true } }, { sort: { date: -1 } }),
      col('homework').find({ _deleted: { $ne: true }, status: 'active' }, { sort: { dueDate: 1 } }),
      col('lessonPlans').find({ _deleted: { $ne: true }, shareWithFamilies: true }, { sort: { date: -1 } }),
    ]);

  // Attendance summary
  const summary = { present: 0, absent: 0, late: 0, halfday: 0, leave: 0 };
  const recent = [];
  for (const day of allAttendance) {
    const rec = (day.records || []).find((r) => r.studentId === studentId);
    if (rec) {
      summary[rec.status] = (summary[rec.status] || 0) + 1;
      recent.push({ date: day.date, status: rec.status });
    }
  }
  recent.sort((a, b) => (a.date < b.date ? 1 : -1));

  // Published results only
  const results = [];
  for (const m of sheets) {
    const entry = (m.entries || []).find((e) => e.studentId === studentId);
    if (!entry) continue;
    results.push({
      examId: m.examId,
      examName: exams.find((e) => e._id === m.examId)?.name || '?',
      subject: subjects.find((s) => s._id === m.subjectId)?.name || '?',
      maxMarks: subjects.find((s) => s._id === m.subjectId)?.maxMarks || 100,
      marks: entry.marks, grade: entry.grade,
    });
  }

  // Fees
  const fees = summarizeStudentFees(student, receipts);

  return {
    student: portalStudent(student),
    className: klass ? formatClass(klass) : '',
    attendance: { summary, recent: recent.slice(0, 30) },
    results,
    fees: { receipts, ...fees },
    activeExams: exams.filter((exam) => ['scheduled', 'ongoing'].includes(exam.status)
      && (!(exam.classIds || []).length || exam.classIds.includes(student.classId))),
    notices: notices.filter((notice) => targetsClass(notice, student.classId)),
    ptm: meetings.filter((meeting) => targetsClass(meeting, student.classId)),
    activities: activities.filter((activity) => targetsClass(activity, student.classId)),
    documents: documents.filter((document) => targetsClass(document, student.classId)),
    homework: homework.filter((task) => task.classId === student.classId),
    lessonPlans: lessonPlans.filter((plan) => plan.classId === student.classId),
  };
}

router.get('/student', allowRoles('student'), async (req, res) => {
  const snap = await studentSnapshot(req.user.refId);
  if (!snap) return res.status(404).json({ error: 'Student record not found' });
  res.json(snap);
});

router.get('/parent', allowRoles('parent'), async (req, res) => {
  const parent = await col('parents').findOne({ _id: req.user.refId, status: 'active' });
  if (!parent) return res.status(404).json({ error: 'Parent record not found' });
  const children = await col('students').find({ status: { $ne: 'deleted' } });
  const mine = children.filter((s) => (s.parentIds || []).includes(parent._id));
  const activeMine = mine.filter((student) => student.status === 'active');
  const formerMine = mine.filter((student) => student.status !== 'active');

  // Run all children snapshots in parallel instead of serially
  const [snaps, formerChildren] = await Promise.all([
    Promise.all(activeMine.map((child) => studentSnapshot(child._id))),
    Promise.all(formerMine.map((child) => studentSnapshot(child._id))),
  ]);
  res.json({ parent, children: snaps.filter(Boolean), formerChildren: formerChildren.filter(Boolean) });
});

// Notices visible to my role
router.get('/notices', async (req, res) => {
  const all = await col('notices').find({ _deleted: { $ne: true }, status: 'published' }, { sort: { date: -1 } });
  const audienceMap = { student: 'students', teacher: 'teachers', parent: 'parents' };
  
  let myClassIds = [];
  if (req.user.role === 'student') {
    const student = await col('students').findOne({ _id: req.user.refId, status: 'active' });
    if (student) myClassIds = [student.classId];
  } else if (req.user.role === 'parent') {
    const students = await col('students').find({ status: 'active' });
    const children = students.filter(s => (s.parentIds || []).includes(req.user.refId));
    myClassIds = children.map(c => c.classId).filter(Boolean);
  }

  const mine = all.filter((n) => {
    const aud = n.audience || 'all';
    if (aud === 'all') return true;
    if (['admin', 'clerk', 'supervisor'].includes(req.user.role)) return true;
    if ((n.classIds || []).some((classId) => myClassIds.includes(classId))) return true;
    if ((n.classIds || []).length && ['student', 'parent'].includes(req.user.role)) return false;
    if (aud === 'students' && req.user.role === 'parent') return true;
    if (myClassIds.includes(aud)) return true;
    return aud === audienceMap[req.user.role];
  });
  res.json(mine);
});

export default router;
