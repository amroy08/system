import { col } from '../db/index.js';
import { STAFF } from '../middleware/auth.js';

export async function teacherClassIds(userId) {
  const [assignments, classTeacherRows] = await Promise.all([
    col('assignments').find({ teacherId: userId, _deleted: { $ne: true } }),
    col('classes').find({ classTeacherId: userId, status: { $ne: 'archived' } }),
  ]);
  return [...new Set([
    ...assignments.map((assignment) => assignment.classId),
    ...classTeacherRows.map((klass) => klass._id),
  ].filter(Boolean))];
}

export async function permittedClassIds(user) {
  if (STAFF.includes(user.role)) return null;
  if (user.role === 'teacher') return teacherClassIds(user.id);
  if (user.role === 'student') {
    const student = await col('students').findOne({ _id: user.refId, status: 'active' });
    return student?.classId ? [student.classId] : [];
  }
  if (user.role === 'parent') {
    const students = await col('students').find({ status: 'active' });
    return [...new Set(students
      .filter((student) => (student.parentIds || []).includes(user.refId))
      .map((student) => student.classId)
      .filter(Boolean))];
  }
  return [];
}

export async function canAccessClass(user, classId) {
  const classIds = await permittedClassIds(user);
  return classIds === null || classIds.includes(classId);
}
