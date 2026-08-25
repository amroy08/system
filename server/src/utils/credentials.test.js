import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTemporaryPassword, isStrongPassword } from './credentials.js';

test('generates unique strong one-time passwords', () => {
  const first = generateTemporaryPassword();
  const second = generateTemporaryPassword();
  assert.equal(isStrongPassword(first), true);
  assert.equal(isStrongPassword(second), true);
  assert.notEqual(first, second);
});

test('enforces length and character diversity', () => {
  assert.equal(isStrongPassword(), false);
  assert.equal(isStrongPassword('short'), false);
  assert.equal(isStrongPassword('long-enough-12'), false);
  assert.equal(isStrongPassword('Aa1!aa'), true);
  assert.equal(isStrongPassword('Strong-enough-12!'), true);
});
