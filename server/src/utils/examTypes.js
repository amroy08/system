export const EXAM_TYPES = Object.freeze([
  'Weekly Test',
  'Unit Test 1',
  'First Semester Exam',
  'Unit Test 2',
  'Second Semester Exam',
  'Other / Additional Exam',
]);

export const LEGACY_EXAM_TYPES = Object.freeze([
  'Unit Test',
  'Quarterly',
  'Half Yearly',
  'Annual',
  'Mock Test',
]);

export function examTypeOrder(type) {
  const order = {
    'Weekly Test': 5,
    'Unit Test 1': 10,
    'First Semester Exam': 20,
    'Unit Test 2': 30,
    'Second Semester Exam': 40,
    'Other / Additional Exam': 90,
  };
  return order[type] ?? 99;
}

export function defaultMarksForExamType(type) {
  if (type === 'Weekly Test') return { maxMarks: 20, passingMarks: 7 };
  if (type === 'Unit Test 1' || type === 'Unit Test 2' || type === 'Unit Test') return { maxMarks: 25, passingMarks: 9 };
  if (type === 'First Semester Exam' || type === 'Second Semester Exam' || type === 'Half Yearly' || type === 'Annual') {
    return { maxMarks: 100, passingMarks: 35 };
  }
  return { maxMarks: 100, passingMarks: 35 };
}

export function validateExamDetails(exam) {
  if (!String(exam.name || '').trim()) throw new Error('Exam name is required');
  if (![...EXAM_TYPES, ...LEGACY_EXAM_TYPES].includes(exam.type)) throw new Error('Select a valid exam type');
  if (!exam.startDate) throw new Error('Exam start date is required');
  if (exam.endDate && exam.endDate < exam.startDate) throw new Error('End date cannot be before the start date');
  if (!['scheduled', 'ongoing', 'completed', 'published'].includes(exam.status)) throw new Error('Select a valid exam status');
  if (exam.maxMarks !== undefined) {
    const max = Number(exam.maxMarks);
    if (!Number.isFinite(max) || max <= 0) throw new Error('Exam total marks must be greater than 0');
  }
  if (exam.passingMarks !== undefined) {
    const pass = Number(exam.passingMarks);
    const max = Number(exam.maxMarks || 100);
    if (!Number.isFinite(pass) || pass < 0 || pass > max) throw new Error(`Passing marks must be between 0 and total marks (${max})`);
  }
}
