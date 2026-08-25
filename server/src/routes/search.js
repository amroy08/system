import { Router } from 'express';
import { col } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { teacherClassIds } from '../utils/accessScope.js';

const router = Router();
router.use(authRequired);

// Global search across modules — powers the Ctrl+K command palette
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (q.length < 2) return res.json([]);
  const staffRoles = ['admin', 'clerk', 'supervisor'];
  const isStaff = staffRoles.includes(req.user.role);
  const isTeacher = req.user.role === 'teacher';
  if (!isStaff && !isTeacher) return res.json([]);

  const match = (...fields) => fields.some((f) => String(f || '').toLowerCase().includes(q));
  const out = [];

  const studentQuery = isTeacher ? { classId: { $in: await teacherClassIds(req.user.id) } } : {};
  const students = await col('students').find(studentQuery);
  for (const s of students) {
    if (match(s.firstName, s.lastName, s.admissionNo, s.rollNo)) {
      out.push({ type: 'Student', title: `${s.firstName} ${s.lastName || ''}`.trim(), subtitle: `${s.admissionNo} · ${s.status}`, route: '/students' });
    }
  }

  if (isStaff) {
    const users = await col('users').find({});
    for (const u of users) {
      if (match(u.fullName, u.username, u.email)) {
        out.push({ type: u.role === 'teacher' ? 'Teacher' : 'User', title: u.fullName, subtitle: `@${u.username} · ${u.role}`, route: u.role === 'teacher' ? '/teachers' : '/users' });
      }
    }
    const parents = await col('parents').find({});
    for (const p of parents) {
      if (match(p.name, p.mobile, p.email)) {
        out.push({ type: 'Parent', title: p.name, subtitle: p.mobile, route: '/parents' });
      }
    }
    const receipts = await col('feeReceipts').find({});
    for (const r of receipts) {
      if (match(r.receiptNo, r.studentName)) {
        out.push({ type: 'Receipt', title: r.receiptNo, subtitle: `${r.studentName} · ${r.status}`, route: '/fees' });
      }
    }
    const assets = await col('assets').find({});
    for (const a of assets) {
      if (match(a.name, a.tag)) {
        out.push({ type: 'Asset', title: a.name, subtitle: a.tag, route: '/assets' });
      }
    }
    const slips = await col('salarySlips').find({});
    for (const s of slips) {
      if (match(s.slipNo, s.staffName)) {
        out.push({ type: 'Salary Slip', title: s.slipNo, subtitle: `${s.staffName} · ${s.month}`, route: '/payroll' });
      }
    }
  }

  const books = await col('books').find({});
  for (const b of books) {
    if (match(b.title, b.author, b.isbn, b.accNo)) {
      out.push({ type: 'Book', title: b.title, subtitle: `${b.author} · ${b.accNo}`, route: '/library' });
    }
  }

  const exams = await col('exams').find({});
  for (const e of exams) {
    if (match(e.name, e.type)) {
      out.push({ type: 'Exam', title: e.name, subtitle: `${e.type} · ${e.status}`, route: '/exams' });
    }
  }

  res.json(out.slice(0, 20));
});

export default router;
