import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { col, nextSeq } from '../db/index.js';
import { authRequired, allowRoles, STAFF, STAFF_TEACHER } from '../middleware/auth.js';
import { ADMISSION_CATEGORY, normalizeAdmissionCategory, resolveFeeAssignment } from '../utils/feeStructure.js';
import { ensureParentUser, findParentByMobile } from '../utils/parentAccounts.js';
import { generateTemporaryPassword, isStrongPassword } from '../utils/credentials.js';
import { teacherClassIds } from '../utils/accessScope.js';
import { formatClass } from '../utils/classNames.js';

const router = Router();
router.use(authRequired);

// 30-second cache for full student list (unfiltered, staff-only)
const STUDENTS_CACHE_MS = 30_000;
let studentsCache = null;       // { lean: [...], full: [...] }
let studentsCacheAt = 0;
export function invalidateStudentsCache() { studentsCacheAt = 0; }

const STUDENT_DOCUMENT_TYPES = new Set([
  'studentAadhaar', 'studentIdCard', 'birthCertificate', 'leavingCertificate',
  'transferCertificate', 'previousMarksheet', 'other',
]);
const VISIBLE_STUDENT_STATUSES = ['active', 'inactive', 'transferred', 'passed-out', 'suspended'];
const ACTIVE_CLASS_QUERY = { _deleted: { $ne: true }, status: { $ne: 'archived' } };
const STUDENT_LIST_PROJECTION = {
  _id: 1,
  firstName: 1,
  lastName: 1,
  gender: 1,
  dob: 1,
  nationality: 1,
  curriculum: 1,
  englishLevel: 1,
  house: 1,
  classId: 1,
  rollNo: 1,
  admissionNo: 1,
  admissionDate: 1,
  admissionCategory: 1,
  status: 1,
  totalDemand: 1,
  parentIds: 1,
  allergies: 1,
  medicalNotes: 1,
  parentName: 1,
  parentRelation: 1,
  parentMobile: 1,
  parentEmail: 1,
  fatherName: 1,
  motherName: 1,
  address: 1,
  city: 1,
  state: 1,
  pinCode: 1,
};

function compactAddress(source) {
  return [
    source.addressLine1,
    source.addressLine2,
    source.city,
    source.state,
    source.pinCode,
    source.country,
  ].map((part) => String(part || '').trim()).filter(Boolean).join(', ');
}

function publicStudent(doc, role) {
  if (STAFF.includes(role)) return doc;
  const { profilePhoto, documents, ...safe } = doc;
  return safe;
}

async function validateStudentAttachments(studentId, profilePhoto, documents) {
  const entries = [];
  if (profilePhoto?._id) entries.push(['profilePhoto', profilePhoto]);
  for (const [key, attachment] of Object.entries(documents || {})) {
    if (!attachment?._id) continue;
    const type = key.startsWith('parentAadhaar_') ? 'parentAadhaar' : key;
    if (!STUDENT_DOCUMENT_TYPES.has(type) && type !== 'parentAadhaar') throw new Error('Invalid student document category');
    entries.push([type, attachment]);
  }
  for (const [type, attachment] of entries) {
    const stored = await col('attachments').findOne({ _id: attachment._id });
    if (!stored || stored.scope !== 'studentDocument' || stored.hostId !== studentId || stored.documentType !== type) {
      throw new Error('One or more student documents are invalid');
    }
  }
}

router.get('/', allowRoles(...STAFF_TEACHER), async (req, res) => {
  const query = { status: { $in: VISIBLE_STUDENT_STATUSES } };
  for (const k of ['classId', 'status', 'gender', 'curriculum', 'englishLevel', 'house']) {
    if (req.query[k]) query[k] = req.query[k];
  }
  const isFiltered = Object.keys(query).length > 1 || req.query.hasAllergies === 'true' || req.query.search;
  const isTeacher = req.user.role === 'teacher';
  const isLean = req.query.lean === 'true';
  const now = Date.now();

  // Use cache only for unfiltered staff requests
  let docs;
  if (!isFiltered && !isTeacher && studentsCache && now - studentsCacheAt < STUDENTS_CACHE_MS) {
    docs = isLean ? studentsCache.lean : studentsCache.full;
  } else {
    const [leanDocs, fullDocs] = !isFiltered && !isTeacher
      ? await Promise.all([
          col('students').find(query, { sort: { admissionNo: 1 }, projection: STUDENT_LIST_PROJECTION }),
          col('students').find(query, { sort: { admissionNo: 1 } }),
        ])
      : [null, await col('students').find(query, {
          sort: { admissionNo: 1 },
          projection: isLean ? STUDENT_LIST_PROJECTION : undefined,
        })];

    if (!isFiltered && !isTeacher) {
      studentsCache = { lean: leanDocs, full: fullDocs };
      studentsCacheAt = Date.now();
    }
    docs = (!isFiltered && !isTeacher) ? (isLean ? leanDocs : fullDocs) : fullDocs;
  }

  if (isTeacher) {
    const allowedClassIds = await teacherClassIds(req.user.id);
    docs = docs.filter((doc) => allowedClassIds.includes(doc.classId));
  }
  if (req.query.hasAllergies === 'true') docs = docs.filter((d) => d.allergies);
  if (req.query.search) {
    const t = String(req.query.search).toLowerCase();
    docs = docs.filter((d) =>
      `${d.firstName} ${d.lastName} ${d.admissionNo} ${d.rollNo}`.toLowerCase().includes(t)
    );
  }
  res.json(docs.map((doc) => publicStudent(doc, req.user.role)));
});


router.get('/fee-preview', allowRoles(...STAFF), async (req, res) => {
  const klass = await col('classes').findOne({ _id: req.query.classId, ...ACTIVE_CLASS_QUERY });
  if (!klass) return res.status(404).json({ error: 'Class not found' });
  const category = normalizeAdmissionCategory(req.query.admissionCategory);
  const structures = await col('feeStructures').find({ status: 'active' });
  const assignment = resolveFeeAssignment(structures, klass, category);
  res.json({
    className: formatClass(klass, false),
    admissionCategory: category,
    annualFee: assignment.annualFee,
    components: assignment.components,
  });
});

router.get('/:id', async (req, res) => {
  const doc = await col('students').findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!doc) return res.status(404).json({ error: 'Student not found' });
  // Students may only see themselves; parents only their linked children
  if (req.user.role === 'student' && req.user.refId !== doc._id) return res.status(403).json({ error: 'Forbidden' });
  if (req.user.role === 'parent' && !(doc.parentIds || []).includes(req.user.refId)) return res.status(403).json({ error: 'Forbidden' });
  if (req.user.role === 'teacher' && !(await teacherClassIds(req.user.id)).includes(doc.classId)) return res.status(403).json({ error: 'Forbidden' });
  res.json(publicStudent(doc, req.user.role));
});

async function createFeeAssignment(classId, admissionCategory, source, userName) {
  const klass = await col('classes').findOne({ _id: classId, ...ACTIVE_CLASS_QUERY });
  if (!klass) throw new Error('Class not found');
  const structures = await col('feeStructures').find({ status: 'active' });
  const assignment = resolveFeeAssignment(structures, klass, admissionCategory);
  if (!assignment.components.length) throw new Error(`No active fee structure is assigned to ${klass.name} ${klass.section} for ${klass.academicYear}`);
  return { ...assignment, source, assignedAt: new Date().toISOString(), assignedBy: userName };
}

async function validateParentIds(value) {
  const parentIds = [...new Set(Array.isArray(value) ? value.filter(Boolean) : [])];
  if (!parentIds.length) return [];
  const parents = await col('parents').find({ _id: { $in: parentIds }, status: 'active' });
  if (parents.length !== parentIds.length) throw new Error('One or more linked parents do not exist or are inactive');
  return parentIds;
}

async function mayReadStudent(req, student) {
  if (req.user.role === 'student') return req.user.refId === student._id;
  if (req.user.role === 'parent') return (student.parentIds || []).includes(req.user.refId);
  if (req.user.role === 'teacher') return (await teacherClassIds(req.user.id)).includes(student.classId);
  return STAFF.includes(req.user.role);
}

router.post('/', allowRoles(...STAFF), async (req, res) => {
  const { loginPassword, parentPassword, ...b } = req.body;
  delete b.profilePhoto;
  delete b.documents;
  if (!b.firstName || !b.classId) return res.status(400).json({ error: 'Student name and class are required' });
  if (loginPassword !== undefined && !isStrongPassword(loginPassword)) {
    return res.status(400).json({ error: 'Student password must include 6–128 characters, uppercase, lowercase, number and symbol' });
  }
  if (parentPassword !== undefined && !isStrongPassword(parentPassword)) {
    return res.status(400).json({ error: 'Parent password must include 6–128 characters, uppercase, lowercase, number and symbol' });
  }
  const year = new Date().getFullYear();
  const seq = await nextSeq('admissionNo');

  const admissionCategory = normalizeAdmissionCategory(b.admissionCategory, b.medicalNotes);
  let feeAssignment;
  try {
    feeAssignment = await createFeeAssignment(b.classId, admissionCategory, 'student-admission', req.user.name);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  let parentIds;
  try {
    parentIds = await validateParentIds(b.parentIds);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const student = await col('students').insertOne({
    ...b,
    address: b.address || compactAddress(b),
    admissionNo: `${year}-${String(seq).padStart(8, '0')}`,
    status: 'active',
    parentIds,
    admissionCategory,
    totalDemand: feeAssignment.annualFee,
    feeAssignments: [feeAssignment],
  });
  const credentials = {};
  // Auto-create parent from inline parent details (video behavior)
  if (b.parentName && !student.parentIds.length) {
    let parent = await findParentByMobile(b.parentMobile);
    const isNewParent = !parent;
    if (!parent) {
      parent = await col('parents').insertOne({
        name: b.parentName, relation: b.parentRelation || 'Guardian',
        mobile: b.parentMobile || '', email: b.parentEmail || '',
        occupation: b.parentOccupation || '', address: b.address || compactAddress(b),
        fatherName: b.fatherName || '',
        fatherMobile: b.fatherMobile || '',
        fatherEmail: b.fatherEmail || '',
        fatherOccupation: b.fatherOccupation || '',
        motherName: b.motherName || '',
        motherMobile: b.motherMobile || '',
        motherEmail: b.motherEmail || '',
        motherOccupation: b.motherOccupation || '',
        addressLine1: b.addressLine1 || '',
        addressLine2: b.addressLine2 || '',
        city: b.city || '',
        state: b.state || '',
        pinCode: b.pinCode || '',
        country: b.country || '',
        status: 'active',
      });
    }
    const pPassword = parentPassword || generateTemporaryPassword();
    const parentUser = await ensureParentUser(parent, pPassword);
    credentials.parentUsername = parentUser.user.username;
    if (isNewParent) credentials.parentPassword = pPassword;
    await col('students').updateOne({ _id: student._id }, { parentIds: [parent._id] });
    student.parentIds = [parent._id];
  }
  // Student login account
  const sUsername = `student${await nextSeq('studentUser')}`;
  const sPassword = loginPassword || generateTemporaryPassword();
  await col('users').insertOne({
    username: sUsername,
    fullName: `${b.firstName} ${b.lastName || ''}`.trim(),
    role: 'student', status: 'active', refId: student._id,
    passwordHash: bcrypt.hashSync(sPassword, 12),
    passwordChangeRequired: true,
    credentialVersion: 2,
  });
  credentials.studentUsername = sUsername;
  credentials.studentPassword = sPassword;
  invalidateStudentsCache();
  res.status(201).json({ ...student, credentials });
});

router.put('/:id', allowRoles(...STAFF), async (req, res) => {
  const b = { ...req.body };
  delete b._id;
  delete b.loginPassword;
  delete b.parentPassword;
  delete b.credentials;
  if (b.status !== undefined && !['active', 'inactive', 'transferred', 'passed-out', 'suspended'].includes(b.status)) {
    return res.status(400).json({ error: 'Invalid student status' });
  }
  delete b.admissionNo;
  delete b._deleted;
  delete b.deletedAt;
  delete b.deletedBy;

  const doc = await col('students').findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!doc) return res.status(404).json({ error: 'Student not found' });

  if (b.admissionCategory !== undefined) {
    b.admissionCategory = normalizeAdmissionCategory(b.admissionCategory);
  }
  if (b.parentIds !== undefined) {
    try {
      b.parentIds = await validateParentIds(b.parentIds);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
  if (b.profilePhoto !== undefined || b.documents !== undefined) {
    try {
      await validateStudentAttachments(req.params.id, b.profilePhoto, b.documents);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
  // Editing an existing student never rewrites historical fee demand. New fees are
  // snapshotted only during admission or academic-year promotion.
  delete b.totalDemand;
  delete b.feeAssignments;

  const updatedDoc = await col('students').updateOne({ _id: req.params.id }, b);
  invalidateStudentsCache();
  res.json(updatedDoc);
});

// Quick views used by the action icons on the students table
router.get('/:id/fees', async (req, res) => {
  const student = await col('students').findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!student || !(await mayReadStudent(req, student))) return res.status(404).json({ error: 'Student not found' });
  const receipts = await col('feeReceipts').find({ studentId: req.params.id }, { sort: { date: -1 } });
  const structures = await col('feeStructures').find({});
  res.json({ receipts, structures, student: publicStudent(student, req.user.role) });
});

router.get('/:id/attendance', async (req, res) => {
  const student = await col('students').findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!student || !(await mayReadStudent(req, student))) return res.status(404).json({ error: 'Student not found' });
  const { from, to } = req.query;
  const all = await col('attendance').find({});
  const records = [];
  for (const day of all) {
    if (from && day.date < from) continue;
    if (to && day.date > to) continue;
    const rec = (day.records || []).find((r) => r.studentId === req.params.id);
    if (rec) records.push({ date: day.date, status: rec.status, classId: day.classId });
  }
  records.sort((a, b) => (a.date < b.date ? 1 : -1));
  const summary = {};
  for (const r of records) summary[r.status] = (summary[r.status] || 0) + 1;
  res.json({ records, summary });
});

router.get('/:id/results', async (req, res) => {
  const student = await col('students').findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!student || !(await mayReadStudent(req, student))) return res.status(404).json({ error: 'Student not found' });
  const allMarks = await col('marks').find({ classId: student.classId });
  const exams = await col('exams').find({ _deleted: { $ne: true } });
  const subjects = await col('subjects').find({ _deleted: { $ne: true } });
  const visible = req.user.role === 'student' || req.user.role === 'parent';
  const results = [];
  for (const m of allMarks) {
    if (visible && m.status !== 'published') continue;
    const entry = (m.entries || []).find((e) => e.studentId === req.params.id);
    if (!entry) continue;
    const exam = exams.find((e) => e._id === m.examId);
    const subject = subjects.find((s) => s._id === m.subjectId);
    results.push({
      examId: m.examId, examName: exam?.name || '?', subject: subject?.name || '?',
      maxMarks: subject?.maxMarks || 100, marks: entry.marks, grade: entry.grade, status: m.status,
    });
  }
  res.json({ student: publicStudent(student, req.user.role), results });
});

router.get('/:id/parents', async (req, res) => {
  const student = await col('students').findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!student || !(await mayReadStudent(req, student))) return res.status(404).json({ error: 'Student not found' });
  const parents = await col('parents').find({ _id: { $in: student.parentIds || [] }, status: 'active' });
  res.json(parents);
});

router.delete('/:id', allowRoles('admin'), async (req, res) => {
  const student = await col('students').findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const deletedAt = new Date().toISOString();
  await col('students').updateOne({ _id: req.params.id }, {
    status: 'deleted', deletedAt, deletedBy: req.user.name, deletedPreviousStatus: student.status,
  });
  await col('users').updateMany({ role: 'student', refId: req.params.id }, { status: 'deleted', deletedAt, deletedBy: req.user.name });
  res.json({ ok: true });
});

export default router;
