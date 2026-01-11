// api/_lib/auth.js
function parseCookies(cookieHeader = '') {
  const out = {};
  cookieHeader.split(';').forEach(part => {
    const [k, ...v] = part.trim().split('=');
    if (!k) return;
    out[k] = decodeURIComponent(v.join('=') || '');
  });
  return out;
}

function b64jsonDecode(s) {
  try { return JSON.parse(Buffer.from(String(s||''), 'base64').toString('utf8')); } catch { return null; }
}
function b64jsonEncode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

function getAuth(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const tok = cookies.dash_auth;
  const auth = b64jsonDecode(tok);
  if (!auth || !auth.role || !auth.userId) return null;
  if (auth.expiresAt) {
    const t = Date.parse(auth.expiresAt);
    if (!isNaN(t) && Date.now() > t) return null;
  }
  return auth;
}

function hasRole(auth, roles) {
  return !!(auth && auth.role && roles.includes(auth.role));
}

function setAuthCookie(res, auth, maxAgeSeconds = 60 * 60 * 24 * 7) {
  const value = b64jsonEncode(auth);
  const cookie = [
    `dash_auth=${encodeURIComponent(value)}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAgeSeconds}`,
    `Secure`,
  ].join('; ');
  res.setHeader('Set-Cookie', cookie);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', 'dash_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure');
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => (buf += c));
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = { parseCookies, getAuth, hasRole, setAuthCookie, clearAuthCookie, json, readJsonBody };
