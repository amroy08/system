import crypto from 'node:crypto';

export function generateTemporaryPassword() {
  return `${crypto.randomBytes(12).toString('base64url')}Aa1!`;
}

export function isStrongPassword(password) {
  return typeof password === 'string'
    && password.length >= 6
    && password.length <= 128
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}
