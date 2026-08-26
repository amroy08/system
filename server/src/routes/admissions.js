import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { generateTemporaryPassword, isStrongPassword } from '../utils/credentials.js';
import { col, nextSeq } from '../db/index.js';
import { authRequired, allowRoles, STAFF } from '../middleware/auth.js';
import { ADMISSION_CATEGORY, resolveFeeAssignment } from '../utils/feeStructure.js';
import { ensureParentUser, findParentByMobile } from '../utils/parentAccounts.js';
import { acquireKeyedLock } from '../utils/keyedLock.js';

const router = Router();
router.use(authRequired);
const ACTIVE_CLASS_QUERY = { _deleted: { $ne: true }, status: { $ne: 'archived' } };

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

function primaryParentFromApplication(app) {
  if (app.parentName) {
    return {
      name: app.parentName,
      relation: app.parentRelation || 'Guardian',
      mobile: app.parentMobile || '',
      email: app.parentEmail || '',
      occupation: app.parentOccupation || '',
    };
  }
  if (app.parentRelation === 'Mother' && app.motherName) {
    return {
      name: app.motherName,
      relation: 'Mother',
      mobile: app.motherMobile || '',
      email: app.motherEmail || '',
      occupation: app.motherOccupation || '',
    };
  }
  if (app.fatherName) {
    return {
      name: app.fatherName,
      relation: 'Father',
      mobile: app.fatherMobile || '',
      email: app.fatherEmail || '',
      occupation: app.fatherOccupation || '',
    };
  }
  if (app.motherName) {
    return {
      name: app.motherName,
      relation: 'Mother',
      mobile: app.motherMobile || '',
      email: app.motherEmail || '',
      occupation: app.motherOccupation || '',
    };
  }
  return {
    name: 'Guardian',
    relation: 'Guardian',
    mobile: app.parentMobile || '',
    email: app.parentEmail || '',
    occupation: app.parentOccupation || '',
  };
}

router.get('/', allowRoles(...STAFF), async (req, res) => {
  const query = { _deleted: { $ne: true } };
  if (req.query.status) query.status = req.query.status;
  res.json(await col('admissions').find(query, { sort: { createdAt: -1 } }));
});

// New registration
router.post('/', allowRoles(...STAFF), async (req, res) => {
  const b = { ...req.body };
  for (const key of ['_id', '_deleted', 'deletedAt', 'deletedBy', 'regNo', 'status', 'studentId', 'admissionNo', 'enrolledClassId']) delete b[key];
  if (!b.firstName || !b.classAppliedFor || !b.academicYear) {
    return res.status(400).json({ error: 'Applicant name, class applied for and academic year are required' });
  }
  const seq = await nextSeq('registration');
  const doc = await col('admissions').insertOne({
    ...b,
    regNo: `REG-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`,
    status: 'registered',
  });
  res.status(201).json(doc);
});

router.put('/:id', allowRoles(...STAFF), async (req, res) => {
  const b = { ...req.body };
  for (const key of ['_id', '_deleted', 'deletedAt', 'deletedBy', 'regNo', 'status', 'studentId', 'admissionNo', 'enrolledClassId']) delete b[key];
  const doc = await col('admissions').updateOne({ _id: req.params.id, _deleted: { $ne: true } }, b);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json(doc);
});

router.post('/:id/reject', allowRoles(...STAFF), async (req, res) => {
  const doc = await col('admissions').updateOne(
    { _id: req.params.id, _deleted: { $ne: true } },
    { status: 'rejected', rejectReason: req.body.reason || 'Not specified' }
  );
  res.json(doc);
});

// Enroll applicant into a class -> creates Student + Parent + login accounts
router.post('/:id/enroll', allowRoles(...STAFF), async (req, res) => {
  const release = await acquireKeyedLock(`admission-enroll:${req.params.id}`);
  try {
    const app = await col('admissions').findOne({ _id: req.params.id, _deleted: { $ne: true } });
    if (!app) return res.status(404).json({ error: 'Application not found' });
    if (app.status === 'admitted') return res.status(409).json({ error: 'Applicant is already admitted' });
    const partialStudent = await col('students').findOne({ sourceAdmissionId: app._id });
    if (partialStudent) {
      return res.status(409).json({ error: 'This enrollment was already started. An administrator must review the existing student record.' });
    }

  const { classId, rollNo, admissionDate, transportRequired, transportRoute, studentPassword, parentPassword } = req.body;
  if (studentPassword !== undefined && !isStrongPassword(studentPassword)) {
    return res.status(400).json({ error: 'Student password must include 6–128 characters, uppercase, lowercase, number and symbol' });
  }
  if (parentPassword !== undefined && !isStrongPassword(parentPassword)) {
    return res.status(400).json({ error: 'Parent password must include 6–128 characters, uppercase, lowercase, number and symbol' });
  }
  const klass = await col('classes').findOne({ _id: classId, ...ACTIVE_CLASS_QUERY });
  if (!klass) return res.status(400).json({ error: 'Please select a valid class' });

  const structures = await col('feeStructures').find({ status: 'active' });
  const resolvedFee = resolveFeeAssignment(structures, klass, ADMISSION_CATEGORY.NEW);
  if (!resolvedFee.components.length) {
    return res.status(400).json({ error: `No active fee structure is assigned to ${klass.name} ${klass.section} for ${klass.academicYear}` });
  }
  const feeAssignment = {
    ...resolvedFee,
    source: 'admission-application',
    assignedAt: new Date().toISOString(),
    assignedBy: req.user.name,
  };

  const year = new Date().getFullYear();
  const seq = await nextSeq('admissionNo');
  const admNo = `${year}-${String(seq).padStart(8, '0')}`;
  const credentials = {};

  const fullAddress = app.address || compactAddress(app);
  const primaryParent = primaryParentFromApplication(app);

  // 1) Parent (reuse by mobile if the same parent already exists)
  let parent = await findParentByMobile(primaryParent.mobile);
  const isNewParent = !parent;
  if (!parent) {
    parent = await col('parents').insertOne({
      name: primaryParent.name,
      relation: primaryParent.relation,
      mobile: primaryParent.mobile,
      email: primaryParent.email,
      occupation: primaryParent.occupation,
      address: fullAddress,
      fatherName: app.fatherName || '',
      fatherMobile: app.fatherMobile || '',
      fatherEmail: app.fatherEmail || '',
      fatherOccupation: app.fatherOccupation || '',
      motherName: app.motherName || '',
      motherMobile: app.motherMobile || '',
      motherEmail: app.motherEmail || '',
      motherOccupation: app.motherOccupation || '',
      addressLine1: app.addressLine1 || '',
      addressLine2: app.addressLine2 || '',
      city: app.city || '',
      state: app.state || '',
      pinCode: app.pinCode || '',
      country: app.country || '',
      status: 'active',
    });
  }
  const pPassword = parentPassword || generateTemporaryPassword();
  const parentUser = await ensureParentUser(parent, pPassword);
  credentials.parentUsername = parentUser.user.username;
  if (isNewParent) credentials.parentPassword = pPassword;

  // 2) Student record
  const student = await col('students').insertOne({
    sourceAdmissionId: app._id,
    admissionNo: admNo,
    firstName: app.firstName,
    lastName: app.lastName || '',
    gender: app.gender || '',
    dob: app.dob || '',
    nationality: app.nationality || '',
    curriculum: app.curriculum || '',
    englishLevel: app.englishLevel || '',
    house: app.house || '',
    allergies: app.allergies || '',
    medicalNotes: app.medicalNotes || '',
    languages: app.languages || '',
    address: fullAddress,
    addressLine1: app.addressLine1 || '',
    addressLine2: app.addressLine2 || '',
    city: app.city || '',
    state: app.state || '',
    pinCode: app.pinCode || '',
    country: app.country || '',
    fatherName: app.fatherName || '',
    fatherMobile: app.fatherMobile || '',
    fatherEmail: app.fatherEmail || '',
    fatherOccupation: app.fatherOccupation || '',
    motherName: app.motherName || '',
    motherMobile: app.motherMobile || '',
    motherEmail: app.motherEmail || '',
    motherOccupation: app.motherOccupation || '',
    parentName: primaryParent.name,
    parentRelation: primaryParent.relation,
    parentMobile: primaryParent.mobile,
    parentEmail: primaryParent.email,
    parentOccupation: primaryParent.occupation,
    classId,
    rollNo: rollNo || '',
    admissionDate: admissionDate || new Date().toISOString().slice(0, 10),
    transportRequired: !!transportRequired,
    transportRoute: transportRoute || '',
    parentIds: [parent._id],
    academicYear: app.academicYear || klass.academicYear,
    admissionCategory: ADMISSION_CATEGORY.NEW,
    status: 'active',
    totalDemand: feeAssignment.annualFee,
    feeAssignments: [feeAssignment],
  });

  // 3) Student login
  const sUsername = `student${await nextSeq('studentUser')}`;
  const sPassword = studentPassword || generateTemporaryPassword();
  await col('users').insertOne({
    username: sUsername, fullName: `${app.firstName} ${app.lastName || ''}`.trim(),
    role: 'student', status: 'active', refId: student._id,
    passwordHash: bcrypt.hashSync(sPassword, 12),
    passwordChangeRequired: true,
    credentialVersion: 2,
  });
  credentials.studentUsername = sUsername;
  credentials.studentPassword = sPassword;

  const doc = await col('admissions').updateOne(
    { _id: req.params.id },
    { status: 'admitted', studentId: student._id, admissionNo: admNo, enrolledClassId: classId }
  );
  res.json({ admission: doc, student, credentials });
  } finally {
    release();
  }
});

router.delete('/:id', allowRoles('admin'), async (req, res) => {
  const admission = await col('admissions').findOne({ _id: req.params.id, _deleted: { $ne: true } });
  if (!admission) return res.status(404).json({ error: 'Admission not found' });
  await col('admissions').updateOne({ _id: req.params.id }, { _deleted: true, deletedAt: new Date().toISOString(), deletedBy: req.user.name });
  res.json({ ok: true });
});

export default router;
