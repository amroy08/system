import bcrypt from 'bcryptjs';
import { col, nextSeq } from '../db/index.js';
import { generateTemporaryPassword, isStrongPassword } from './credentials.js';

export function normalizeMobile(value) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

export async function findParentByMobile(value) {
  const mobile = normalizeMobile(value);
  if (!mobile) return null;
  const parents = await col('parents').find({});
  return parents.find((parent) => normalizeMobile(parent.mobile) === mobile) || null;
}

export async function ensureParentUser(parent, password) {
  const existing = await col('users').findOne({ role: 'parent', refId: parent._id });
  const profile = {
    fullName: parent.name,
    email: parent.email || '',
    mobile: parent.mobile || '',
    status: parent.status || 'active',
  };
  if (existing) return { user: await col('users').updateOne({ _id: existing._id }, profile), temporaryPassword: null };
  if (password !== undefined && !isStrongPassword(password)) {
    throw new Error('Parent password must include 6–128 characters, uppercase, lowercase, number and symbol');
  }
  const temporaryPassword = password || generateTemporaryPassword();
  const user = await col('users').insertOne({
    username: `parent${await nextSeq('parentUser')}`,
    role: 'parent',
    refId: parent._id,
    passwordHash: bcrypt.hashSync(temporaryPassword, 12),
    passwordChangeRequired: true,
    credentialVersion: 2,
    ...profile,
  });
  return { user, temporaryPassword };
}

export async function syncParentUser(parent) {
  const existing = await col('users').findOne({ role: 'parent', refId: parent._id });
  if (!existing) return (await ensureParentUser(parent)).user;
  return col('users').updateOne({ _id: existing._id }, {
    fullName: parent.name,
    email: parent.email || '',
    mobile: parent.mobile || '',
    status: parent.status || 'active',
  });
}
