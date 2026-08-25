import { Router } from 'express';
import { col } from '../db/index.js';
import { authRequired, allowRoles, STAFF_TEACHER } from '../middleware/auth.js';
import { canAccessClass, teacherClassIds } from '../utils/accessScope.js';
import { acquireKeyedLock } from '../utils/keyedLock.js';

const router = Router();
router.use(authRequired);

const ATTENDANCE_STATUSES = new Set(['present', 'absent', 'late', 'halfday', 'leave']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function validateAttendanceInput(classId, date, records) {
  if (!classId || !ISO_DATE.test(String(date || '')) || !Array.isArray(records)) {
    throw new Error('A valid class, date and attendance records are required');
  }
  const klass = await col('classes').findOne({ _id: classId });
  if (!klass) throw new Error('Class not found');
  const roster = await col('students').find({ classId, status: 'active' });
  const rosterIds = new Set(roster.map((student) => student._id));
  const seen = new Set();
  return records.map((record) => {
    if (!record?.studentId || !rosterIds.has(record.studentId)) throw new Error('Attendance contains a student outside this class');
    if (seen.has(record.studentId)) throw new Error('Attendance contains a duplicate student');
    seen.add(record.studentId);
    const status = record.status || 'present';
    if (!ATTENDANCE_STATUSES.has(status)) throw new Error('Attendance contains an invalid status');
    return { studentId: record.studentId, status };
  });
}

// Get attendance sheet for a class + date (creates default from roster if none saved)
router.get('/', allowRoles(...STAFF_TEACHER), async (req, res) => {
  const { classId, date } = req.query;
  if (!classId || !date) return res.status(400).json({ error: 'classId and date are required' });
  if (!(await canAccessClass(req.user, classId))) return res.status(403).json({ error: 'You are not assigned to this class' });
  const students = await col('students').find({ classId, status: 'active' }, { sort: { rollNo: 1 } });
  const saved = await col('attendance').findOne({ classId, date });
  const records = students.map((s) => {
    const existing = saved?.records?.find((r) => r.studentId === s._id);
    return {
      studentId: s._id,
      name: `${s.firstName} ${s.lastName || ''}`.trim(),
      rollNo: s.rollNo,
      admissionNo: s.admissionNo,
      status: existing?.status || null,
    };
  });
  res.json({ classId, date, saved: !!saved, records });
});

// Save (upsert) attendance for a class + date
router.post('/', allowRoles(...STAFF_TEACHER), async (req, res) => {
  const { classId, date, records } = req.body;
  if (!(await canAccessClass(req.user, classId))) return res.status(403).json({ error: 'You are not assigned to this class' });
  const release = await acquireKeyedLock(`attendance:${classId}:${date}`);
  try {
    const clean = await validateAttendanceInput(classId, date, records);
    const existing = await col('attendance').findOne({ classId, date });
    const doc = existing
      ? await col('attendance').updateOne({ _id: existing._id }, { records: clean, markedBy: req.user.name })
      : await col('attendance').insertOne({ classId, date, records: clean, markedBy: req.user.name });
    res.json(doc);
  } catch (error) {
    res.status(400).json({ error: error.message });
  } finally {
    release();
  }
});

// Copy from a previous date ("Copy from Yesterday")
router.get('/copy', allowRoles(...STAFF_TEACHER), async (req, res) => {
  const { classId, fromDate } = req.query;
  if (!(await canAccessClass(req.user, classId))) return res.status(403).json({ error: 'You are not assigned to this class' });
  const source = await col('attendance').findOne({ classId, date: fromDate });
  if (!source) return res.status(404).json({ error: `No attendance saved on ${fromDate}` });
  res.json(source);
});

// Last-7-days summary for dashboard chart
router.get('/summary/week', allowRoles(...STAFF_TEACHER), async (req, res) => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const query = { date: { $gte: days[0] } };
  if (req.user.role === 'teacher') query.classId = { $in: await teacherClassIds(req.user.id) };
  const all = await col('attendance').find(query);
  const out = days.map((date) => {
    const entries = all.filter((a) => a.date === date);
    const counts = { present: 0, absent: 0, late: 0, halfday: 0, leave: 0 };
    for (const e of entries) for (const r of e.records || []) counts[r.status] = (counts[r.status] || 0) + 1;
    return { date, ...counts };
  });
  res.json(out);
});

export default router;
