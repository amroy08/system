import { Router } from 'express';
import { col, nextSeq } from '../db/index.js';
import { authRequired, allowRoles, STAFF, STAFF_TEACHER } from '../middleware/auth.js';
import { acquireKeyedLock } from '../utils/keyedLock.js';

const router = Router();
router.use(authRequired);

const FINE_PER_DAY = 5;

async function ensureLibraryFineLedger(issue, recordedBy) {
  if (!(issue.fine > 0)) return null;
  const ledgerKey = `library-fine:${issue._id}`;
  const existing = await col('dailyAccounts').findOne({ ledgerKey });
  if (existing) return existing;
  try {
    return await col('dailyAccounts').insertOne({
      ledgerKey,
      date: issue.returnDate,
      type: 'income',
      category: 'Library Fine',
      description: `Late return fine — ${issue.bookTitle} (${issue.memberName})`,
      amount: issue.fine,
      mode: 'cash',
      recordedBy,
      bookIssueId: issue._id,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return col('dailyAccounts').findOne({ ledgerKey });
  }
}

// ---------- Books ----------
router.get('/books', async (req, res) => {
  const query = { _deleted: { $ne: true } };
  if (req.query.category) query.category = req.query.category;
  let books = await col('books').find(query, { sort: { title: 1 } });
  if (req.query.available === 'true') books = books.filter((b) => (b.availableCopies || 0) > 0);
  res.json(books);
});

const COVER_LIMIT = 900 * 1024; // ~900KB base64 ≈ 650KB image

router.post('/books', allowRoles(...STAFF), async (req, res) => {
  const b = req.body;
  if (!b.title) return res.status(400).json({ error: 'Book title is required' });
  if (b.coverImage && b.coverImage.length > COVER_LIMIT) {
    return res.status(400).json({ error: 'Cover image is too large — please use an image under 600KB' });
  }
  const seq = await nextSeq('bookAcc');
  const copies = b.copies === undefined || b.copies === '' ? 1 : Number(b.copies);
  if (!Number.isInteger(copies) || copies < 1) return res.status(400).json({ error: 'Copies must be a positive whole number' });
  const doc = await col('books').insertOne({
    accNo: `LIB-${String(seq).padStart(5, '0')}`,
    title: b.title, author: b.author || '', isbn: b.isbn || '',
    category: b.category || 'General', shelf: b.shelf || '',
    copies, availableCopies: copies,
    coverImage: b.coverImage || '',
    coverColor: b.coverColor || ['#0f2248', '#16a34a', '#7c3aed', '#dc2626', '#0ea5e9', '#d97706'][seq % 6],
  });
  res.status(201).json(doc);
});

router.put('/books/:id', allowRoles(...STAFF), async (req, res) => {
  const b = { ...req.body };
  for (const key of ['_id', 'accNo', 'availableCopies', '_deleted', 'deletedAt', 'deletedBy']) delete b[key];
  if (b.coverImage && b.coverImage.length > COVER_LIMIT) {
    return res.status(400).json({ error: 'Cover image is too large — please use an image under 600KB' });
  }
  const release = await acquireKeyedLock(`library-book:${req.params.id}`);
  try {
    // Keep availableCopies consistent when total copies change
    const book = await col('books').findOne({ _id: req.params.id });
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (b.title !== undefined && !String(b.title).trim()) return res.status(400).json({ error: 'Book title is required' });
    if (b.copies != null) {
      const issued = book.copies - book.availableCopies;
      b.copies = Number(b.copies);
      if (!Number.isInteger(b.copies) || b.copies < 1) return res.status(400).json({ error: 'Copies must be a positive whole number' });
      if (b.copies < issued) return res.status(400).json({ error: `${issued} copies are currently issued — total cannot be less` });
      b.availableCopies = b.copies - issued;
    }
    res.json(await col('books').updateOne({ _id: req.params.id }, b));
  } finally {
    release();
  }
});

router.delete('/books/:id', allowRoles('admin'), async (req, res) => {
  const open = await col('bookIssues').count({ bookId: req.params.id, status: 'issued' });
  if (open) return res.status(400).json({ error: 'Book has open issues — collect returns first' });
  const book = await col('books').findOne({ _id: req.params.id, _deleted: { $ne: true } });
  if (!book) return res.status(404).json({ error: 'Book not found' });
  await col('books').updateOne({ _id: req.params.id }, {
    _deleted: true, deletedAt: new Date().toISOString(), deletedBy: req.user.name,
  });
  res.json({ ok: true });
});

// ---------- Circulation ----------
router.get('/issues', allowRoles(...STAFF_TEACHER), async (req, res) => {
  const query = req.user.role === 'teacher' ? { memberType: 'staff', memberId: req.user.id } : {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.memberId) query.memberId = req.query.memberId;
  const issues = await col('bookIssues').find(query, { sort: { createdAt: -1 } });
  const today = new Date().toISOString().slice(0, 10);
  res.json(issues.map((i) => ({
    ...i,
    overdue: i.status === 'issued' && i.dueDate < today,
    daysLate: i.status === 'issued' && i.dueDate < today
      ? Math.ceil((new Date(today) - new Date(i.dueDate)) / 86400000) : 0,
  })));
});

router.post('/issues', allowRoles(...STAFF), async (req, res) => {
  const { bookId, memberType, memberId, days = 14 } = req.body;
  const loanDays = Number(days);
  if (!['student', 'staff'].includes(memberType)) return res.status(400).json({ error: 'Invalid library member type' });
  if (!Number.isInteger(loanDays) || loanDays < 1 || loanDays > 365) return res.status(400).json({ error: 'Loan duration must be between 1 and 365 days' });
  const release = await acquireKeyedLock(`library-book:${bookId}`);
  try {
    const book = await col('books').findOne({ _id: bookId, _deleted: { $ne: true } });
    if (!book) return res.status(400).json({ error: 'Please select a valid book' });
    if ((book.availableCopies || 0) < 1) return res.status(400).json({ error: `All copies of "${book.title}" are issued out` });

    let memberName = '';
    if (memberType === 'student') {
      const student = await col('students').findOne({ _id: memberId, status: 'active' });
      if (!student) return res.status(400).json({ error: 'Student not found' });
      memberName = `${student.firstName} ${student.lastName || ''}`.trim();
    } else {
      const staff = await col('users').findOne({ _id: memberId, status: 'active' });
      if (!staff || !['admin', 'clerk', 'supervisor', 'teacher'].includes(staff.role)) return res.status(400).json({ error: 'Staff member not found' });
      memberName = staff.fullName;
    }

    const issueDate = new Date().toISOString().slice(0, 10);
    const due = new Date();
    due.setDate(due.getDate() + loanDays);

    const doc = await col('bookIssues').insertOne({
      bookId, bookTitle: book.title, accNo: book.accNo,
      memberType, memberId, memberName,
      issueDate, dueDate: due.toISOString().slice(0, 10),
      returnDate: null, fine: 0, status: 'issued', issuedBy: req.user.name,
    });
    await col('books').updateOne({ _id: bookId }, { availableCopies: book.availableCopies - 1 });
    res.status(201).json(doc);
  } finally {
    release();
  }
});

router.post('/issues/:id/return', allowRoles(...STAFF), async (req, res) => {
  const initial = await col('bookIssues').findOne({ _id: req.params.id });
  if (!initial) return res.status(404).json({ error: 'Issue record not found' });
  const release = await acquireKeyedLock(`library-book:${initial.bookId}`);
  try {
    const issue = await col('bookIssues').findOne({ _id: req.params.id });
    if (!issue) return res.status(404).json({ error: 'Issue record not found' });
    if (issue.status === 'returned') {
      await ensureLibraryFineLedger(issue, issue.receivedBy || req.user.name);
      return res.status(409).json({ error: 'Already returned' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const daysLate = Math.max(0, Math.ceil((new Date(today) - new Date(issue.dueDate)) / 86400000));
    const fine = daysLate * FINE_PER_DAY;

    const doc = await col('bookIssues').updateOne(
      { _id: issue._id },
      { status: 'returned', returnDate: today, fine, receivedBy: req.user.name }
    );
    const book = await col('books').findOne({ _id: issue.bookId });
    if (book) await col('books').updateOne({ _id: book._id }, { availableCopies: Math.min(book.copies, book.availableCopies + 1) });
    await ensureLibraryFineLedger(doc, req.user.name);
    res.json(doc);
  } finally {
    release();
  }
});

// ---------- My books (student sees own, parent sees children's) ----------
router.get('/my', allowRoles('student', 'parent'), async (req, res) => {
  let studentIds = [];
  if (req.user.role === 'student') {
    studentIds = [req.user.refId];
  } else {
    const students = await col('students').find({});
    studentIds = students.filter((s) => (s.parentIds || []).includes(req.user.refId)).map((s) => s._id);
  }
  const issues = await col('bookIssues').find({ memberType: 'student' }, { sort: { createdAt: -1 } });
  const mine = issues.filter((i) => studentIds.includes(i.memberId));
  const today = new Date().toISOString().slice(0, 10);
  res.json({
    finePerDay: FINE_PER_DAY,
    issues: mine.map((i) => {
      const overdue = i.status === 'issued' && i.dueDate < today;
      const daysLate = overdue ? Math.ceil((new Date(today) - new Date(i.dueDate)) / 86400000) : 0;
      const dueInDays = i.status === 'issued'
        ? Math.ceil((new Date(i.dueDate) - new Date(today)) / 86400000) : null;
      return { ...i, overdue, daysLate, fineAccrued: daysLate * FINE_PER_DAY, dueInDays };
    }),
  });
});

// ---------- Stats ----------
router.get('/stats', async (req, res) => {
  const books = await col('books').find({ _deleted: { $ne: true } });
  const issues = await col('bookIssues').find({});
  const today = new Date().toISOString().slice(0, 10);
  const open = issues.filter((i) => i.status === 'issued');
  const overdueList = open.filter((i) => i.dueDate < today);
  const fineAccruing = overdueList.reduce((s, i) =>
    s + Math.ceil((new Date(today) - new Date(i.dueDate)) / 86400000) * FINE_PER_DAY, 0);
  res.json({
    titles: books.length,
    totalCopies: books.reduce((s, b) => s + (b.copies || 0), 0),
    available: books.reduce((s, b) => s + (b.availableCopies || 0), 0),
    issued: open.length,
    overdue: overdueList.length,
    fineAccruing,
    finesCollected: issues.reduce((s, i) => s + (i.fine || 0), 0),
    finePerDay: FINE_PER_DAY,
  });
});

export default router;
