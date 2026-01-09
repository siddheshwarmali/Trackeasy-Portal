// netlify/functions/_util.js
const crypto = require('crypto');

function corsHeaders(){
  return {
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'Content-Type, Authorization',
    'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS'
  };
}

function json(statusCode, obj, extraHeaders={}) {
  return { statusCode, headers: Object.assign(corsHeaders(), extraHeaders), body: JSON.stringify(obj) };
}

async function readBody(bodyStr) {
  if (!bodyStr) return {};
  try { return JSON.parse(bodyStr); } catch { return { __raw: bodyStr }; }
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0,idx).trim()] = decodeURIComponent(part.slice(idx+1).trim());
  });
  return out;
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

module.exports = { json, readBody, parseCookies, signToken, verifyToken, corsHeaders };
