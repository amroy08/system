import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { col } from '../db/index.js';

export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = req.cookies?.[config.sessionCookieName]
    || (header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await col('users').findOne({ _id: payload.id });
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'Session is no longer active' });
    }
    if ((payload.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ error: 'Session has expired' });
    }
    req.user = {
      id: user._id,
      username: user.username,
      role: user.role,
      name: user.fullName,
      refId: user.refId || null,
      passwordChangeRequired: Boolean(user.passwordChangeRequired),
    };
    if (user.passwordChangeRequired && ![
      '/api/auth/me', '/api/auth/change-password', '/api/auth/logout',
      '/api/settings', '/api/public/settings',
    ].includes(req.originalUrl.split('?')[0])) {
      return res.status(403).json({ error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function csrfProtect(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (!req.cookies?.[config.sessionCookieName]) return next();
  const cookieToken = req.cookies?.[config.csrfCookieName];
  const headerToken = req.get('x-csrf-token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Invalid request verification token' });
  }
  next();
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission for this action' });
    }
    next();
  };
}

export const STAFF = ['admin', 'clerk', 'supervisor'];
export const STAFF_TEACHER = ['admin', 'clerk', 'supervisor', 'teacher'];
export const ALL_ROLES = ['admin', 'clerk', 'supervisor', 'teacher', 'student', 'parent'];
