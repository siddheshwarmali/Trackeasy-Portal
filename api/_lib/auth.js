
import crypto from 'crypto';

export function pbkdf2Hash(password) {
  const iterations = 120000;
  const salt = crypto.randomBytes(16);
  const dk = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return `pbkdf2_sha256$${iterations}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

export function verifyHash(password, encoded) {
  try {
    const [scheme, itStr, saltB64, dkB64] = encoded.split('$');
    if (scheme !== 'pbkdf2_sha256') return false;
    const iterations = parseInt(itStr, 10);
    const salt = Buffer.from(saltB64, 'base64');
    const dk = Buffer.from(dkB64, 'base64');
    const check = crypto.pbkdf2Sync(password, salt, iterations, dk.length, 'sha256');
    return crypto.timingSafeEqual(dk, check);
  } catch {
    return false;
  }
}

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export function signSession(payload, secret, ttlSeconds=60*60*12) {
  const header = base64url(JSON.stringify({ alg:'HS256', typ:'JWT' }));
  const now = Math.floor(Date.now()/1000);
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${base64url(sig)}`;
}

export function verifySession(token, secret) {
  try {
    const [h,b,s] = token.split('.');
    if (!h || !b || !s) return null;
    const data = `${h}.${b}`;
    const expected = base64url(crypto.createHmac('sha256', secret).update(data).digest());
    if (expected.length !== s.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
    const payload = JSON.parse(Buffer.from(b.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8'));
    const now = Math.floor(Date.now()/1000);
    if (payload.exp && now > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0,i).trim()] = decodeURIComponent(p.slice(i+1).trim());
  });
  return out;
}

export function setCookie(req, res, name, value, opts={}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  const proto = (req.headers['x-forwarded-proto'] || '').toString();
  const isHttps = proto === 'https' || opts.secure === true;
  if (isHttps && opts.secure !== false) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
