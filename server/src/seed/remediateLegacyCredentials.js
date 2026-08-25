import bcrypt from 'bcryptjs';
import { initDb, col, closeDb, flushDb } from '../db/index.js';

const execute = process.argv.includes('--execute');
const BATCH_SIZE = 8;

function legacyCandidate(user) {
  if (user.role === 'parent') return 'parent123';
  if (user.role === 'student') return 'student123';
  if (user.username === 'admin') return 'admin123';
  return null;
}

try {
  await initDb();
  const users = await col('users').find({ status: { $ne: 'deleted' }, credentialVersion: { $ne: 2 } });
  const results = [];
  for (let index = 0; index < users.length; index += BATCH_SIZE) {
    const batch = users.slice(index, index + BATCH_SIZE);
    results.push(...await Promise.all(batch.map(async (user) => {
      const candidate = legacyCandidate(user);
      const usesLegacyPassword = Boolean(candidate && user.passwordHash && await bcrypt.compare(candidate, user.passwordHash));
      return { user, usesLegacyPassword };
    })));
  }

  const shared = results.filter((result) => result.usesLegacyPassword);
  const legacyAdmin = shared.find((result) => result.user.role === 'admin');
  const accountsToDisable = shared.filter((result) => result.user.role !== 'admin');
  console.log(JSON.stringify({
    checked: results.length,
    sharedCredentials: shared.length,
    accountsToDisable: accountsToDisable.length,
    administratorRotationRequired: Boolean(legacyAdmin),
    mode: execute ? 'execute' : 'dry-run',
  }, null, 2));

  if (!execute) {
    if (shared.length) process.exitCode = 2;
  } else {
    const now = new Date().toISOString();
    for (const { user, usesLegacyPassword } of results) {
      if (usesLegacyPassword && user.role === 'admin') continue;
      await col('users').updateOne({ _id: user._id }, {
        credentialVersion: 2,
        ...(usesLegacyPassword ? {
          status: 'credential-reset-required',
          passwordChangeRequired: true,
          tokenVersion: (user.tokenVersion || 0) + 1,
          legacyCredentialDisabledAt: now,
        } : { credentialVerifiedAt: now }),
      });
    }
    await col('auditLogs').insertOne({
      action: 'SECURITY REMEDIATE LEGACY CREDENTIALS',
      actorName: 'Credential Remediation CLI',
      actorRole: 'system',
      targetId: null,
      disabledAccountCount: accountsToDisable.length,
      occurredAt: now,
    });
    await flushDb();
    if (legacyAdmin) {
      console.error('The administrator still uses the default password. Rotate it, then run this command again.');
      process.exitCode = 2;
    } else {
      console.log('Credential remediation completed. Disabled accounts require an administrator password reset before activation.');
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
