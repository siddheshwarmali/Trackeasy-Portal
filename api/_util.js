// api/_util.js (Vercel utility - ignored as function due to leading underscore)
const crypto = require('crypto');

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw='';
  await new Promise(resolve => {
    req.on('data', c => raw += c);
    req.on('end', resolve);
  });
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { __raw: raw }; }
}

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function signToken(payload, secret, ttlSec=60*60*12) {
  const header = b64url(JSON.stringify({ alg:'HS256', typ:'JWT' }));
  const exp = Math.floor(Date.now()/1000) + ttlSec;
  const body = b64url(JSON.stringify(Object.assign({}, payload, { exp })));
  const data = header + '.' + body;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return data + '.' + sig;
}

function verifyToken(token, secret) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h,b,s] = parts;
  const data = h + '.' + b;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  if (sig !== s) return null;
  const payload = JSON.parse(Buffer.from(b.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8'));
  if (payload.exp && Math.floor(Date.now()/1000) > payload.exp) return null;
  return payload;
}

function parseCookies(req) {
  const header = req.headers && (req.headers.cookie || req.headers.Cookie);
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0,idx).trim()] = decodeURIComponent(part.slice(idx+1).trim());
  });
  return out;
}

function setCookie(res, name, value, opts={}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push('Path=/');
  parts.push('SameSite=Lax');
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure !== false) parts.push('Secure');
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearCookie(res, name) {
  res.setHeader('Set-Cookie', `${name}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly; Secure`);
}

module.exports = { json, setCors, readBody, signToken, verifyToken, parseCookies, setCookie, clearCookie };
