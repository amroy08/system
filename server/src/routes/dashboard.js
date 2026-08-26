import { Router } from 'express';
import { col } from '../db/index.js';
import { authRequired, allowRoles, STAFF, STAFF_TEACHER } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

const STATS_CACHE_MS = Number(process.env.DASHBOARD_STATS_CACHE_MS || 15_000);
let statsCache = null;

router.get('/stats', allowRoles(...STAFF), async (req, res) => {
  if (statsCache && Date.now() - statsCache.createdAt < STATS_CACHE_MS) {
    return res.json(statsCache.data);
  }

  const today = new Date().toISOString().slice(0, 10);

  const [students, teachers, classList, subjects, parents, receipts, attendanceToday, exams, incidents, helpdesk, complaints] =
    await Promise.all([
      col('students').find({ status: { $ne: 'deleted' } }),
      col('users').count({ role: 'teacher', status: 'active' }),
      col('classes').find({ status: { $ne: 'archived' } }),
      col('subjects').count({}),
      col('parents').count({ status: 'active' }),
      col('feeReceipts').find({ status: { $ne: 'refunded' } }),
      col('attendance').find({ date: today }),
      col('exams').find({ status: { $in: ['scheduled', 'ongoing'] } }),
      col('discipline').find({}),
      col('helpdesk').count({ status: 'open' }),
      col('complaints').count({ status: 'open' }),
    ]);

  const activeStudents = students.filter((s) => s.status === 'active');
  const todaysCollection = receipts
    .filter((r) => r.date === today)
    .reduce((s, r) => s + (r.amountPaid || 0), 0);
  // Sum of paid amount per student from non-refunded receipts
  const studentPaidMap = {};
  for (const r of receipts) {
    studentPaidMap[r.studentId] = (studentPaidMap[r.studentId] || 0) + (r.amountPaid || 0);
  }

  let outstanding = 0;
  for (const s of activeStudents) {
    const paid = studentPaidMap[s._id] || 0;
    const demand = s.totalDemand || 0;
    outstanding += Math.max(0, demand - paid);
  }

  let presentToday = 0, markedToday = 0;
  for (const a of attendanceToday) {
    for (const r of a.records || []) {
      markedToday++;
      if (r.status === 'present' || r.status === 'late' || r.status === 'halfday') presentToday++;
    }
  }

  const genderMix = {};
  for (const s of activeStudents) {
    const rawGender = String(s.gender || '').trim().toLowerCase();
    const g = ['male', 'female', 'other'].includes(rawGender) ? rawGender : 'not specified';
    genderMix[g] = (genderMix[g] || 0) + 1;
  }

  const severity = {};
  for (const d of incidents) severity[d.severity || 'low'] = (severity[d.severity || 'low'] || 0) + 1;

  // Fee collection last 7 days
  const feeTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const amount = receipts
      .filter((r) => r.date === date)
      .reduce((s, r) => s + (r.amountPaid || 0), 0);
    feeTrend.push({ date, amount });
  }

  // Upcoming birthdays within 7 days (month-day comparison)
  const birthdays = [];
  const now = new Date();
  for (const s of activeStudents) {
    if (!s.dob) continue;
    const dob = new Date(s.dob);
    if (Number.isNaN(dob.getTime())) continue;
    const next = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
    if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1);
    const inDays = Math.round((next - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    if (inDays <= 7) {
      const local = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
      birthdays.push({
        name: `${s.firstName} ${s.lastName || ''}`.trim(),
        date: local,
        inDays,
        turns: next.getFullYear() - dob.getFullYear(),
      });
    }
  }
  birthdays.sort((a, b) => a.inDays - b.inDays);

  const pendingAdmissions = await col('admissions').count({ status: 'registered' });
  const marks = await col('marks').find({ status: 'submitted' });

  const totalFeeCollected = receipts
    .reduce((s, r) => s + (r.amountPaid || 0), 0);

  const classWiseStrength = {};
  const activeStudentCountByClass = {};
  for (const student of activeStudents) {
    activeStudentCountByClass[student.classId] = (activeStudentCountByClass[student.classId] || 0) + 1;
  }
  for (const c of classList) {
    const label = `${c.name} ${c.section}`;
    classWiseStrength[label] = activeStudentCountByClass[c._id] || 0;
  }

  const data = {
    activeStudents: activeStudents.length,
    totalStudents: students.length,
    teachers, classes: classList.length, subjects, parents,
    todaysCollection, outstanding, totalFeeCollected,
    attendanceToday: { present: presentToday, marked: markedToday },
    activeExams: exams.length,
    openIncidents: incidents.filter((incident) => incident.status === 'open').length,
    openTickets: helpdesk,
    openComplaints: complaints,
    genderMix, severity, feeTrend,
    birthdays,
    pendingAdmissions,
    sheetsAwaitingPublish: marks.length,
    receiptsToday: receipts.filter((r) => r.date === today).length,
    classWiseStrength,
  };
  statsCache = { createdAt: Date.now(), data };
  res.json(data);
});

// Teacher-focused dashboard data: my assignments, my classes, today's periods
router.get('/teacher', allowRoles(...STAFF_TEACHER), async (req, res) => {
  const teacherId = req.user.id;
  const [assignments, classes, subjects, timetables, exams, marks, students] = await Promise.all([
    col('assignments').find({ teacherId }),
    col('classes').find({}),
    col('subjects').find({}),
    col('timetables').find({}),
    col('exams').find({}),
    col('marks').find({}),
    col('students').find({ status: 'active' }),
  ]);

  const classLabel = (id) => {
    const c = classes.find((x) => x._id === id);
    return c ? `${c.name} ${c.section} (${c.academicYear})` : '?';
  };

  const myAssignments = assignments.map((a) => ({
    ...a,
    className: classLabel(a.classId),
    subjectName: subjects.find((s) => s._id === a.subjectId)?.name || '?',
    studentCount: students.filter((s) => s.classId === a.classId).length,
  }));

  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const todaysPeriods = [];
  for (const tt of timetables) {
    for (const p of tt.periods || []) {
      if (p.teacherId === teacherId && p.day === dayName) {
        todaysPeriods.push({ ...p, className: classLabel(tt.classId), classId: tt.classId });
      }
    }
  }
  todaysPeriods.sort((a, b) => a.period - b.period);

  const classTeacherOf = classes.find((c) => c.classTeacherId === teacherId);
  const myClassIds = [...new Set(assignments.map((a) => a.classId))];
  const myDraftSheets = marks.filter((m) => m.status === 'draft' && myClassIds.includes(m.classId)).length;

  res.json({
    dayName,
    assignments: myAssignments,
    todaysPeriods,
    classTeacherOf: classTeacherOf ? classLabel(classTeacherOf._id) : null,
    classTeacherClassId: classTeacherOf?._id || null,
    stats: {
      classes: myClassIds.length,
      subjects: [...new Set(assignments.map((a) => a.subjectId))].length,
      students: students.filter((s) => myClassIds.includes(s.classId)).length,
      draftSheets: myDraftSheets,
      activeExams: exams.filter((e) => ['scheduled', 'ongoing'].includes(e.status)
        && (!(e.classIds || []).length || e.classIds.some((classId) => myClassIds.includes(classId)))).length,
    },
  });
});

export default router;
