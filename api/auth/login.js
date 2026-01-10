// api/auth/login.js
const { setAuthCookie, json, readJsonBody } = require('../_lib/auth');

function parseList(v) {
  return String(v || '')
    .split(/[,\n\s]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return json(res, 400, { error: 'Email is required' });

    const allow = parseList(process.env.AUTH_EMAIL_ALLOWLIST);
    const creators = parseList(process.env.AUTH_CREATOR_EMAILS);

    if (allow.length && !allow.includes(email)) {
      return json(res, 403, { error: 'Email not in allow-list' });
    }

    const role = creators.includes(email) ? 'creator' : 'viewer';
    const auth = { role, email, expiresAt: new Date(Date.now() + 1000*60*60*24*7).toISOString() };
    setAuthCookie(res, auth);
    return json(res, 200, auth);
  } catch (e) {
    return json(res, 500, { error: e.message || String(e) });
  }
};
