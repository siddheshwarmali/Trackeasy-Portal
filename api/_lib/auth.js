
const crypto = require('crypto');

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function b64urlDecode(str) {
  str = str.replace(/-/g,'+').replace(/_/g,'/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function sign(payload, secret, ttlSeconds = 60*60*12) { // 12h
  const now = Math.floor(Date.now()/1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const bodyB64 = b64urlEncode(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(bodyB64).digest();
  return bodyB64 + '.' + b64urlEncode(sig);
}

function verify(token, secret) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const [bodyB64, sigB64] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(bodyB64).digest();
  const given = b64urlDecode(sigB64);
  // timing-safe compare
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const body = JSON.parse(b64urlDecode(bodyB64).toString('utf8'));
    const now = Math.floor(Date.now()/1000);
    if (body.exp && now > body.exp) return null;
    return body;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').map(s => s.trim()).filter(Boolean).forEach(kv => {
    const idx = kv.indexOf('=');
    if (idx === -1) return;
    const k = kv.slice(0, idx).trim();
    const v = kv.slice(idx+1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`); else parts.push('SameSite=Lax');
  if (opts.secure !== false) parts.push('Secure');
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  const existing = res.getHeader('Set-Cookie');
  const next = existing ? (Array.isArray(existing) ? existing.concat(parts.join('; ')) : [existing, parts.join('; ')]) : parts.join('; ');
  res.setHeader('Set-Cookie', next);
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function envList(name) {
  const raw = process.env[name] || '';
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

module.exports = {
  sign, verify, parseCookies, setCookie, json, readJson, envList,
};
