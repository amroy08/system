import { Router } from 'express';
import { col } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { teacherClassIds } from '../utils/accessScope.js';

const router = Router();
router.use(authRequired);

// Escape special regex characters so user input is treated as a literal string
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Global search across modules — powers the Ctrl+K command palette
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (q.length < 2) return res.json([]);
  const staffRoles = ['admin', 'clerk', 'supervisor'];
  const isStaff = staffRoles.includes(req.user.role);
  const isTeacher = req.user.role === 'teacher';
  if (!isStaff && !isTeacher) return res.json([]);

  const safeQ = escapeRegex(q);
  const regexFilter = { $regex: safeQ, $options: 'i' };
  const LIMIT = 10;
  const out = [];

  const studentQuery = {
    status: { $ne: 'deleted' },
    $or: [
      { firstName: regexFilter },
      { lastName: regexFilter },
      { admissionNo: regexFilter },
    ],
  };
  if (isTeacher) studentQuery.classId = { $in: await teacherClassIds(req.user.id) };
  const students = await col('students').find(studentQuery, {
    limit: LIMIT,
    projection: { _id: 1, firstName: 1, lastName: 1, admissionNo: 1, status: 1 },
  });
  for (const s of students) {
    out.push({ type: 'Student', title: `${s.firstName} ${s.lastName || ''}`.trim(), subtitle: `${s.admissionNo} · ${s.status}`, route: '/students' });
  }

  if (isStaff) {
    const users = await col('users').find({
      status: { $ne: 'deleted' },
      $or: [{ fullName: regexFilter }, { username: regexFilter }],
    }, { limit: LIMIT, projection: { _id: 1, fullName: 1, username: 1, role: 1 } });
    for (const u of users) {
      out.push({ type: u.role === 'teacher' ? 'Teacher' : 'User', title: u.fullName, subtitle: `@${u.username} · ${u.role}`, route: u.role === 'teacher' ? '/teachers' : '/users' });
    }
    const parents = await col('parents').find({
      status: { $ne: 'deleted' },
      $or: [{ name: regexFilter }, { mobile: regexFilter }],
    }, { limit: LIMIT, projection: { _id: 1, name: 1, mobile: 1 } });
    for (const p of parents) {
      out.push({ type: 'Parent', title: p.name, subtitle: p.mobile, route: '/parents' });
    }
    const receipts = await col('feeReceipts').find({
      $or: [{ receiptNo: regexFilter }, { studentName: regexFilter }],
    }, { limit: LIMIT, projection: { _id: 1, receiptNo: 1, studentName: 1, status: 1 } });
    for (const r of receipts) {
      out.push({ type: 'Receipt', title: r.receiptNo, subtitle: `${r.studentName} · ${r.status}`, route: '/fees' });
    }
    const assets = await col('assets').find({
      _deleted: { $ne: true },
      $or: [{ name: regexFilter }, { tag: regexFilter }],
    }, { limit: LIMIT, projection: { _id: 1, name: 1, tag: 1 } });
    for (const a of assets) {
      out.push({ type: 'Asset', title: a.name, subtitle: a.tag, route: '/assets' });
    }
    const slips = await col('salarySlips').find({
      _deleted: { $ne: true },
      $or: [{ slipNo: regexFilter }, { staffName: regexFilter }],
    }, { limit: LIMIT, projection: { _id: 1, slipNo: 1, staffName: 1, month: 1 } });
    for (const s of slips) {
      out.push({ type: 'Salary Slip', title: s.slipNo, subtitle: `${s.staffName} · ${s.month}`, route: '/payroll' });
    }
  }

  const books = await col('books').find({
    _deleted: { $ne: true },
    $or: [{ title: regexFilter }, { author: regexFilter }, { isbn: regexFilter }, { accNo: regexFilter }],
  }, { limit: LIMIT, projection: { _id: 1, title: 1, author: 1, accNo: 1 } });
  for (const b of books) {
    out.push({ type: 'Book', title: b.title, subtitle: `${b.author} · ${b.accNo}`, route: '/library' });
  }

  const exams = await col('exams').find({
    _deleted: { $ne: true },
    $or: [{ name: regexFilter }, { type: regexFilter }],
  }, { limit: LIMIT, projection: { _id: 1, name: 1, type: 1, status: 1 } });
  for (const e of exams) {
    out.push({ type: 'Exam', title: e.name, subtitle: `${e.type} · ${e.status}`, route: '/exams' });
  }

  res.json(out.slice(0, 20));
});

export default router;
