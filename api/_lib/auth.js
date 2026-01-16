const crypto = require('crypto');

const COOKIE_NAME = 'tw_session';

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function unbase64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function sign(data) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('Missing AUTH_SECRET');
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function makeToken(payload, ttlSeconds = 60 * 60 * 12) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
  const sig = sign(`${header}.${body}`);
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const good = sign(`${h}.${b}`);
  if (good !== s) return null;
  try {
    const payload = JSON.parse(unbase64url(b).toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return raw
    .split(';')
    .map(v => v.trim())
    .filter(Boolean)
    .reduce((acc, c) => {
      const idx = c.indexOf('=');
      if (idx > -1) acc[c.slice(0, idx)] = decodeURIComponent(c.slice(idx + 1));
      return acc;
    }, {});
}

function setCookie(res, value, maxAgeSeconds = 60 * 60 * 12) {
  const secure = process.env.NODE_ENV === 'production';
  const cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    secure ? 'Secure' : null,
  ].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie', cookie);
}

function clearCookie(res) {
  const secure = process.env.NODE_ENV === 'production';
  const cookie = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    secure ? 'Secure' : null,
  ].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie', cookie);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const key = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${key}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, key] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(check, 'hex'));
}

module.exports = {
  COOKIE_NAME,
  parseCookies,
  setCookie,
  clearCookie,
  makeToken,
  verifyToken,
  hashPassword,
  verifyPassword,
};
