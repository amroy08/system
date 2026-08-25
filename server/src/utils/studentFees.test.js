import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeStudentFees } from './studentFees.js';

test('summarizes demand, payments, discounts, late fees, and ignores refunds', () => {
  const summary = summarizeStudentFees(
    { totalDemand: 1000 },
    [
      { amountPaid: 400, discount: 50, lateFee: 20, status: 'partial' },
      { amountPaid: 100, discount: 10, lateFee: 5, status: 'refunded' },
    ],
  );

  assert.deepEqual(summary, {
    totalDemand: 1000,
    totalPaid: 400,
    totalDiscount: 50,
    totalLateFee: 20,
    balance: 570,
  });
});

test('never reports a negative balance', () => {
  assert.equal(summarizeStudentFees({ totalDemand: 500 }, [{ amountPaid: 600 }]).balance, 0);
});
