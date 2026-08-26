import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { col } from '../db/index.js';
import { authRequired, allowRoles } from '../middleware/auth.js';
import { isStrongPassword } from '../utils/credentials.js';

const router = Router();
router.use(authRequired);
const MANAGED_ROLES = new Set(['admin', 'clerk', 'supervisor', 'teacher']);
const ACCOUNT_STATUSES = new Set(['active', 'inactive', 'suspended']);
const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/;

async function wouldRemoveLastAdmin(current, changes) {
  if (current.role !== 'admin' || current.status !== 'active') return false;
  const remainsActiveAdmin = (changes.role ?? current.role) === 'admin'
    && (changes.status ?? current.status) === 'active';
  if (remainsActiveAdmin) return false;
  return (await col('users').count({ role: 'admin', status: 'active' })) <= 1;
}

function publicUser(u) {
  const { passwordHash, loginAttempts, lockedUntil, tokenVersion, credentialVersion, legacyCredentialDisabledAt, ...rest } = u;
  return rest;
}

router.get('/', allowRoles('admin', 'clerk', 'supervisor'), async (req, res) => {
  const query = { status: { $ne: 'deleted' } };
  if (req.query.role) query.role = req.query.role;
  if (req.query.status) query.status = req.query.status;
  const users = await col('users').find(query, { sort: { createdAt: -1 } });
  res.json(users.map(publicUser));
});

router.post('/', allowRoles('admin'), async (req, res) => {
  const b = req.body;
  if (!b.username || !b.password || !b.fullName || !b.role) {
    return res.status(400).json({ error: 'Username, password, full name and role are required' });
  }
  if (!isStrongPassword(b.password)) return res.status(400).json({ error: 'Password must be 6–128 characters and include uppercase, lowercase, number and symbol' });
  if (!MANAGED_ROLES.has(b.role)) return res.status(400).json({ error: 'Create student and parent accounts through their linked records' });
  if (b.status !== undefined && !ACCOUNT_STATUSES.has(b.status)) return res.status(400).json({ error: 'Invalid account status' });
  const username = String(b.username).toLowerCase().trim();
  if (!USERNAME_PATTERN.test(username)) return res.status(400).json({ error: 'Username must be 3–64 letters, numbers, dots, underscores or hyphens' });
  const exists = await col('users').findOne({ username });
  if (exists) return res.status(400).json({ error: `Username "${username}" is already taken` });
  const doc = await col('users').insertOne({
    username,
    fullName: b.fullName,
    email: b.email || '',
    mobile: b.mobile || '',
    gender: b.gender || '',
    role: b.role,
    status: b.status || 'active',
    dob: b.dob || '',
    qualification: b.qualification || '',
    specialization: b.specialization || '',
    address: b.address || '',
    joined: b.joined || new Date().toISOString().slice(0, 10),
    lastLogin: null,
    passwordHash: bcrypt.hashSync(b.password, 12),
    passwordChangeRequired: true,
    credentialVersion: 2,
  });
  res.status(201).json(publicUser(doc));
});

router.put('/:id', allowRoles('admin'), async (req, res) => {
  const b = { ...req.body };
  const current = await col('users').findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!current) return res.status(404).json({ error: 'User not found' });
  delete b._id;
  delete b.passwordHash;
  for (const key of ['loginAttempts', 'lockedUntil', 'tokenVersion', 'credentialVersion', 'legacyCredentialDisabledAt', 'credentialResetAt', 'passwordChangeRequired', 'deletedAt', 'deletedBy', 'deletedPreviousStatus']) delete b[key];
  if (b.status !== undefined && !ACCOUNT_STATUSES.has(b.status)) {
    return res.status(400).json({ error: 'Invalid account status' });
  }
  if (b.role !== undefined && b.role !== current.role && !MANAGED_ROLES.has(b.role)) {
    return res.status(400).json({ error: 'Student and parent roles are managed through their linked records' });
  }
  if (await wouldRemoveLastAdmin(current, b)) {
    return res.status(409).json({ error: 'Create another active administrator before changing this account' });
  }
  if (b.status === 'active' && current.status === 'credential-reset-required' && !b.password) {
    return res.status(409).json({ error: 'Reset this account password before activating it' });
  }
  if (b.password) {
    if (!isStrongPassword(b.password)) return res.status(400).json({ error: 'Password must be 6–128 characters and include uppercase, lowercase, number and symbol' });
    b.passwordHash = bcrypt.hashSync(b.password, 12);
    b.tokenVersion = (current?.tokenVersion || 0) + 1;
    b.credentialVersion = 2;
    b.passwordChangeRequired = true;
    b.legacyCredentialDisabledAt = null;
    b.credentialResetAt = new Date().toISOString();
    if (current.status === 'credential-reset-required') b.status = 'active';
    delete b.password;
  }
  if (b.username) {
    b.username = String(b.username).toLowerCase().trim();
    if (!USERNAME_PATTERN.test(b.username)) return res.status(400).json({ error: 'Username must be 3–64 letters, numbers, dots, underscores or hyphens' });
    const existing = await col('users').findOne({ username: b.username });
    if (existing && existing._id !== req.params.id) return res.status(400).json({ error: `Username "${b.username}" is already taken` });
  }
  const doc = await col('users').updateOne({ _id: req.params.id }, b);
  res.json(publicUser(doc));
});

// Quick actions used from the users table (reset password, suspend, activate)
router.post('/:id/reset-password', allowRoles('admin'), async (req, res) => {
  const { newPassword } = req.body;
  if (!isStrongPassword(newPassword)) return res.status(400).json({ error: 'New password must be 6–128 characters and include uppercase, lowercase, number and symbol' });
  const user = await col('users').findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (await wouldRemoveLastAdmin(user, { status: req.body.status })) {
    return res.status(409).json({ error: 'Create another active administrator before changing this account' });
  }
  await col('users').updateOne({ _id: req.params.id }, {
    passwordHash: bcrypt.hashSync(newPassword, 12),
    tokenVersion: (user.tokenVersion || 0) + 1,
    passwordChangeRequired: true,
    loginAttempts: 0,
    lockedUntil: null,
    credentialVersion: 2,
    legacyCredentialDisabledAt: null,
    credentialResetAt: new Date().toISOString(),
    ...(user.status === 'credential-reset-required' ? { status: 'active' } : {}),
  });
  await col('authEvents').insertOne({
    type: 'password_reset_by_admin',
    userId: user._id,
    username: user.username,
    actorId: req.user.id,
    occurredAt: new Date().toISOString(),
  });
  res.json({ ok: true });
});

router.post('/:id/status', allowRoles('admin'), async (req, res) => {
  const allowedStatuses = new Set(['active', 'inactive', 'suspended']);
  if (!allowedStatuses.has(req.body.status)) return res.status(400).json({ error: 'Invalid account status' });
  const user = await col('users').findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (await wouldRemoveLastAdmin(user, { status: 'deleted' })) {
    return res.status(409).json({ error: 'Create another active administrator before deleting this account' });
  }
  if (req.body.status === 'active' && (user.credentialVersion !== 2 || user.status === 'credential-reset-required')) {
    return res.status(409).json({ error: 'Reset this account password before activating it' });
  }
  const doc = await col('users').updateOne({ _id: req.params.id }, { status: req.body.status });
  res.json(publicUser(doc));
});

router.delete('/:id', allowRoles('admin'), async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  const user = await col('users').findOne({ _id: req.params.id, status: { $ne: 'deleted' } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  await col('users').updateOne({ _id: req.params.id }, {
    status: 'deleted', deletedAt: new Date().toISOString(), deletedBy: req.user.name, deletedPreviousStatus: user.status,
    tokenVersion: (user.tokenVersion || 0) + 1,
  });
  res.json({ ok: true });
});

export default router;
