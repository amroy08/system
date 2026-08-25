import bcrypt from 'bcryptjs';
import { initDb, col, closeDb, flushDb } from '../db/index.js';
import { isStrongPassword } from '../utils/credentials.js';

const username = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
const password = process.env.ADMIN_NEW_PASSWORD;

if (!isStrongPassword(password)) {
  console.error('ADMIN_NEW_PASSWORD must include 6–128 characters, uppercase, lowercase, number and symbol');
  process.exitCode = 1;
} else {
  try {
    await initDb();
    const user = await col('users').findOne({ username, role: 'admin' });
    if (!user) throw new Error(`Admin account "${username}" was not found`);
    await col('users').updateOne({ _id: user._id }, {
      passwordHash: await bcrypt.hash(password, 12),
      passwordChangeRequired: false,
      loginAttempts: 0,
      lockedUntil: null,
      tokenVersion: (user.tokenVersion || 0) + 1,
      credentialRotatedAt: new Date().toISOString(),
      credentialVersion: 2,
    });
    await col('auditLogs').insertOne({
      action: 'SECURITY ROTATE ADMIN PASSWORD',
      actorId: user._id,
      actorName: user.fullName,
      actorRole: user.role,
      targetId: user._id,
      occurredAt: new Date().toISOString(),
    });
    await flushDb();
    console.log(`Password rotated and sessions revoked for ${username}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
