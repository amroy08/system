import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireKeyedLock } from './keyedLock.js';

test('serializes operations for the same business key', async () => {
  const releaseFirst = await acquireKeyedLock('student-1');
  let secondEntered = false;
  const second = acquireKeyedLock('student-1').then((release) => {
    secondEntered = true;
    release();
  });
  await Promise.resolve();
  assert.equal(secondEntered, false);
  releaseFirst();
  await second;
  assert.equal(secondEntered, true);
});

test('allows unrelated business keys to proceed independently', async () => {
  const releaseFirst = await acquireKeyedLock('student-2');
  const releaseSecond = await acquireKeyedLock('student-3');
  releaseSecond();
  releaseFirst();
});
