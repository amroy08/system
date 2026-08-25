import test from 'node:test';
import assert from 'node:assert/strict';
import { toWhatsAppNumber } from './whatsapp.js';

test('normalizes Indian local and country-code mobile numbers', () => {
  assert.equal(toWhatsAppNumber('98765 43210'), '919876543210');
  assert.equal(toWhatsAppNumber('+91-98765-43210'), '919876543210');
});

test('rejects missing and unsupported-length numbers', () => {
  assert.equal(toWhatsAppNumber('N/A'), '');
  assert.equal(toWhatsAppNumber('12345'), '');
});
