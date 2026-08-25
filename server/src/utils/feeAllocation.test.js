import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateFeePayment, summarizeComponentPayments } from './feeAllocation.js';

const secondaryComponents = [
  { name: 'Monthly Fee (Secondary)', frequency: 'monthly', amount: 21600 },
  { name: 'Admission Fee (Secondary)', frequency: 'one-time', amount: 2200 },
  { name: 'MS Fee (Secondary)', frequency: 'annual', amount: 3600 },
  { name: 'Term Fee (Secondary)', frequency: 'bi-annual', amount: 3600 },
];

test('allocates a partial payment in official fee-head order', () => {
  const summaries = summarizeComponentPayments(secondaryComponents, []);
  const allocation = allocateFeePayment(15000, summaries);

  assert.deepEqual(allocation.items, [
    { description: 'Admission Fee (Secondary)', amount: 2200 },
    { description: 'Monthly Fee (Secondary)', amount: 12800 },
  ]);
});

test('continues from already paid fee heads', () => {
  const summaries = summarizeComponentPayments(secondaryComponents, [{
    items: [
      { description: 'Admission Fee (Secondary)', amount: 2200 },
      { description: 'Monthly Fee (Secondary)', amount: 21600 },
    ],
  }]);
  const allocation = allocateFeePayment(5400, summaries);

  assert.deepEqual(allocation.items, [
    { description: 'Term Fee (Secondary)', amount: 3600 },
    { description: 'MS Fee (Secondary)', amount: 1800 },
  ]);
});
