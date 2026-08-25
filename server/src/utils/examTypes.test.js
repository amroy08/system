import test from 'node:test';
import assert from 'node:assert/strict';
import { examTypeOrder, validateExamDetails } from './examTypes.js';

test('orders the main academic exam stages', () => {
  assert.ok(examTypeOrder('Unit Test 1') < examTypeOrder('First Semester Exam'));
  assert.ok(examTypeOrder('First Semester Exam') < examTypeOrder('Unit Test 2'));
  assert.ok(examTypeOrder('Unit Test 2') < examTypeOrder('Second Semester Exam'));
});

test('accepts new and legacy exam types', () => {
  assert.doesNotThrow(() => validateExamDetails({ name: 'UT 1', type: 'Unit Test 1', startDate: '2026-09-01', endDate: '2026-09-02', status: 'scheduled' }));
  assert.doesNotThrow(() => validateExamDetails({ name: 'Old Annual', type: 'Annual', startDate: '2026-03-01', status: 'published' }));
});

test('rejects an invalid type and reversed dates', () => {
  assert.throws(() => validateExamDetails({ name: 'Test', type: 'Unknown', startDate: '2026-09-01', status: 'scheduled' }), /valid exam type/);
  assert.throws(() => validateExamDetails({ name: 'Test', type: 'Weekly Test', startDate: '2026-09-02', endDate: '2026-09-01', status: 'scheduled' }), /End date/);
});
