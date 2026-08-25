import { col } from '../db/index.js';
import { STAFF } from '../middleware/auth.js';

export function classifyEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return { email, reason: 'missing' };
  if (email.endsWith('@mvhs.edu.in')) return { email, reason: 'dummy' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { email, reason: 'invalid' };
  return { email, reason: null };
}

function summarize(records) {
  const recipients = [];
  const seen = new Set();
  const skipped = { missing: 0, dummy: 0, invalid: 0, duplicate: 0 };
  for (const record of records) {
    const result = classifyEmail(record.email);
    if (result.reason) {
      skipped[result.reason]++;
    } else if (seen.has(result.email)) {
      skipped.duplicate++;
    } else {
      seen.add(result.email);
      recipients.push({ email: result.email, recipientId: record.recipientId || record._id, recipientType: record.recipientType || 'parent' });
    }
  }
  return { recipients, eligibleCount: recipients.length, candidateCount: records.length, skipped };
}

export async function resolveEmailRecipients({ audience = 'parents', classIds = [], studentIds = [], parentIds = [] } = {}) {
  if (audience === 'teachers' || audience === 'staff') {
    const roles = audience === 'teachers' ? ['teacher'] : STAFF;
    const users = await col('users').find({ role: { $in: roles }, status: 'active' });
    return summarize(users.map((user) => ({ ...user, recipientType: 'user' })));
  }

  if (parentIds.length) {
    const parents = await col('parents').find({ _id: { $in: [...new Set(parentIds)] }, status: 'active' });
    return summarize(parents);
  }

  let students = [];
  if (studentIds.length) {
    students = await col('students').find({ _id: { $in: studentIds }, status: 'active' });
  } else if (classIds.length) {
    students = await col('students').find({ classId: { $in: classIds }, status: 'active' });
  } else if (audience === 'students') {
    students = await col('students').find({ status: 'active' });
  } else if (audience === 'class') {
    students = [];
  }

  if (students.length || studentIds.length || classIds.length || audience === 'students' || audience === 'class') {
    const parentIds = [...new Set(students.flatMap((student) => student.parentIds || []))];
    const parents = parentIds.length ? await col('parents').find({ _id: { $in: parentIds }, status: 'active' }) : [];
    return { ...summarize(parents), studentCount: students.length };
  }

  const parents = await col('parents').find({ status: 'active' });
  return summarize(parents);
}

export async function resolveMixedAudience(audience) {
  if (audience === 'teachers' || audience === 'staff') return resolveEmailRecipients({ audience });
  if (audience && !['all', 'parents', 'students'].includes(audience)) {
    return resolveEmailRecipients({ audience: 'class', classIds: [audience] });
  }
  if (audience === 'students') return resolveEmailRecipients({ audience: 'students' });
  if (audience === 'parents') return resolveEmailRecipients({ audience: 'parents' });
  const parents = await col('parents').find({ status: 'active' });
  const users = await col('users').find({ status: 'active' });
  return summarize([
    ...parents.map((record) => ({ ...record, recipientType: 'parent' })),
    ...users.map((record) => ({ ...record, recipientType: 'user' })),
  ]);
}
