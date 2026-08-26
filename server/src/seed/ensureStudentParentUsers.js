import bcrypt from 'bcryptjs';
import { initDb, col, closeDb, flushDb } from '../db/index.js';
import { generateTemporaryPassword } from '../utils/credentials.js';

const execute = process.argv.includes('--execute');

function normalizeUsername(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 64);
}

function studentName(student) {
  return `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.admissionNo || 'Student';
}

function nextAvailableUsername(prefix, usedNames) {
  let counter = 1;
  while (usedNames.has(`${prefix}${counter}`)) counter += 1;
  const username = `${prefix}${counter}`;
  usedNames.add(username);
  return username;
}

function studentUsername(student, usedNames) {
  const admissionDigits = String(student.admissionNo || '').replace(/\D/g, '');
  const preferred = normalizeUsername(admissionDigits ? `student${admissionDigits}` : '');
  if (preferred && !usedNames.has(preferred)) {
    usedNames.add(preferred);
    return preferred;
  }
  return nextAvailableUsername('student', usedNames);
}

function parentUsername(parent, usedNames) {
  const mobileDigits = String(parent.mobile || '').replace(/\D/g, '').slice(-10);
  const preferred = normalizeUsername(mobileDigits ? `parent${mobileDigits}` : '');
  if (preferred && !usedNames.has(preferred)) {
    usedNames.add(preferred);
    return preferred;
  }
  return nextAvailableUsername('parent', usedNames);
}

function userProfileForStudent(student) {
  return {
    fullName: studentName(student),
    email: student.email || '',
    mobile: student.mobile || student.parentMobile || '',
    gender: student.gender || '',
    status: student.status === 'suspended' ? 'suspended' : 'active',
  };
}

function userProfileForParent(parent) {
  return {
    fullName: parent.name || 'Parent',
    email: parent.email || '',
    mobile: parent.mobile || '',
    gender: parent.gender || '',
    status: parent.status === 'suspended' ? 'suspended' : 'active',
  };
}

try {
  await initDb();
  const [students, parents, users] = await Promise.all([
    col('students').find({ status: { $in: ['active', 'passed-out'] } }),
    col('parents').find({ status: { $ne: 'deleted' } }),
    col('users').find({ status: { $ne: 'deleted' } }),
  ]);

  const usedNames = new Set(users.map((user) => normalizeUsername(user.username)).filter(Boolean));
  const usersByStudent = new Map(users.filter((user) => user.role === 'student' && user.refId).map((user) => [user.refId, user]));
  const usersByParent = new Map(users.filter((user) => user.role === 'parent' && user.refId).map((user) => [user.refId, user]));

  const missingStudents = students.filter((student) => !usersByStudent.has(student._id));
  const missingParents = parents.filter((parent) => !usersByParent.has(parent._id));
  const linkedStudentsToSync = students.filter((student) => usersByStudent.has(student._id));
  const linkedParentsToSync = parents.filter((parent) => usersByParent.has(parent._id));

  const summary = {
    mode: execute ? 'execute' : 'dry-run',
    studentsChecked: students.length,
    parentsChecked: parents.length,
    existingUsers: users.length,
    missingStudentUsers: missingStudents.length,
    missingParentUsers: missingParents.length,
    existingStudentUsersToSync: linkedStudentsToSync.length,
    existingParentUsersToSync: linkedParentsToSync.length,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (execute) {
    const now = new Date().toISOString();
    let studentUsersCreated = 0;
    let parentUsersCreated = 0;
    let existingUsersSynced = 0;

    for (const student of linkedStudentsToSync) {
      const existing = usersByStudent.get(student._id);
      await col('users').updateOne({ _id: existing._id }, userProfileForStudent(student));
      existingUsersSynced += 1;
    }

    for (const parent of linkedParentsToSync) {
      const existing = usersByParent.get(parent._id);
      await col('users').updateOne({ _id: existing._id }, userProfileForParent(parent));
      existingUsersSynced += 1;
    }

    for (const student of missingStudents) {
      const password = generateTemporaryPassword();
      await col('users').insertOne({
        username: studentUsername(student, usedNames),
        role: 'student',
        refId: student._id,
        passwordHash: bcrypt.hashSync(password, 12),
        passwordChangeRequired: true,
        credentialVersion: 2,
        joined: student.admissionDate || student.createdAt?.slice(0, 10) || now.slice(0, 10),
        lastLogin: null,
        createdAt: now,
        updatedAt: now,
        ...userProfileForStudent(student),
      });
      studentUsersCreated += 1;
    }

    for (const parent of missingParents) {
      const password = generateTemporaryPassword();
      await col('users').insertOne({
        username: parentUsername(parent, usedNames),
        role: 'parent',
        refId: parent._id,
        passwordHash: bcrypt.hashSync(password, 12),
        passwordChangeRequired: true,
        credentialVersion: 2,
        joined: parent.createdAt?.slice(0, 10) || now.slice(0, 10),
        lastLogin: null,
        createdAt: now,
        updatedAt: now,
        ...userProfileForParent(parent),
      });
      parentUsersCreated += 1;
    }

    await col('auditLogs').insertOne({
      action: 'ENSURE STUDENT PARENT LOGIN USERS',
      actorName: 'User Account Repair CLI',
      actorRole: 'system',
      studentUsersCreated,
      parentUsersCreated,
      existingUsersSynced,
      occurredAt: now,
    });
    await flushDb();
    console.log(JSON.stringify({ studentUsersCreated, parentUsersCreated, existingUsersSynced }, null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
