import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { col } from '../db/index.js';
import { config } from '../config.js';
import { authRequired } from '../middleware/auth.js';
import { acquireKeyedLock } from '../utils/keyedLock.js';
import { isStrongPassword } from '../utils/credentials.js';

const router = Router();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function publicUser(u) {
  const { passwordHash, loginAttempts, lockedUntil, tokenVersion, credentialVersion, legacyCredentialDisabledAt, ...rest } = u;
  return rest;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: config.sessionMaxAgeMs,
  };
}

function csrfCookieOptions() {
  return {
    httpOnly: false,
    secure: config.isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: config.sessionMaxAgeMs,
  };
}

async function recordAuthEvent(event) {
  try {
    await col('authEvents').insertOne({ ...event, occurredAt: new Date().toISOString() });
  } catch (error) {
    console.error('[Auth Audit]', error.message);
  }
}

router.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const { password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  if (username.length > 64 || typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }
  const release = await acquireKeyedLock(`login:${username}`);
  try {
    const user = await col('users').findOne({ username });
    if (!user) {
      await bcrypt.compare(password, '$2a$12$C6UzMDM.H6dfI/f/IKcEe.2Hc7f6Au1X9VYx7VuqYl9szoRZ0zQmS');
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (user.status !== 'active') return res.status(403).json({ error: 'Account is not active. Contact administrator.' });
    const now = Date.now();
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now) {
      return res.status(429).json({ error: 'Account temporarily locked. Try again later.' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) {
      const attempts = (user.loginAttempts || 0) + 1;
      const lockedUntil = attempts >= MAX_LOGIN_ATTEMPTS ? new Date(now + LOCKOUT_MS).toISOString() : null;
      await col('users').updateOne({ _id: user._id }, {
        loginAttempts: lockedUntil ? 0 : attempts,
        lockedUntil,
      });
      await recordAuthEvent({ type: 'login_failed', userId: user._id, username, ip: req.ip, locked: Boolean(lockedUntil) });
      return res.status(401).json({ error: lockedUntil ? 'Account temporarily locked. Try again later.' : 'Invalid username or password' });
    }

    await col('users').updateOne({ _id: user._id }, { lastLogin: new Date().toISOString(), loginAttempts: 0, lockedUntil: null });
    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        role: user.role,
        name: user.fullName,
        refId: user.refId || null,
        tokenVersion: user.tokenVersion || 0,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
    const csrfToken = crypto.randomBytes(32).toString('hex');
    res.cookie(config.sessionCookieName, token, sessionCookieOptions());
    res.cookie(config.csrfCookieName, csrfToken, csrfCookieOptions());
    await recordAuthEvent({ type: 'login_succeeded', userId: user._id, username, ip: req.ip });
    res.json({ user: publicUser(user) });
  } finally {
    release();
  }
});

router.post('/logout', authRequired, async (req, res) => {
  res.clearCookie(config.sessionCookieName, sessionCookieOptions());
  res.clearCookie(config.csrfCookieName, csrfCookieOptions());
  await recordAuthEvent({ type: 'logout', userId: req.user.id, username: req.user.username, ip: req.ip });
  res.json({ ok: true });
});

router.get('/me', authRequired, async (req, res) => {
  const user = await col('users').findOne({ _id: req.user.id });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(publicUser(user));
});

router.put('/me', authRequired, async (req, res) => {
  const { fullName, email, mobile, gender, address, avatarColor } = req.body;
  const doc = await col('users').updateOne(
    { _id: req.user.id },
    { fullName, email, mobile, gender, address, avatarColor }
  );
  res.json(publicUser(doc));
});

router.post('/change-password', authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== 'string' || currentPassword.length > 128) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  const user = await col('users').findOne({ _id: req.user.id });
  if (!(await bcrypt.compare(currentPassword || '', user.passwordHash))) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ error: 'New password must be 6–128 characters and include uppercase, lowercase, number and symbol' });
  }
  await col('users').updateOne({ _id: user._id }, {
    passwordHash: await bcrypt.hash(newPassword, 12),
    tokenVersion: (user.tokenVersion || 0) + 1,
    passwordChangeRequired: false,
    credentialVersion: 2,
  });
  res.clearCookie(config.sessionCookieName, sessionCookieOptions());
  res.clearCookie(config.csrfCookieName, csrfCookieOptions());
  await recordAuthEvent({ type: 'password_changed', userId: user._id, username: user.username, ip: req.ip });
  res.json({ ok: true, reauthenticate: true });
});

export default router;
