// api/auth/admin.js
const { setAuthCookie, json, readJsonBody } = require('../_lib/auth');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = await readJsonBody(req);
    const user = String(body.username || '').trim();
    const pass = String(body.password || '').trim();

    const expUser = process.env.ADMIN_USER || 'admin';
    const expPass = process.env.ADMIN_PASS || '';

    if (!expPass) {
      return json(res, 500, { error: 'Admin password not configured (set ADMIN_PASS in Vercel env).' });
    }

    if (user !== expUser || pass !== expPass) {
      return json(res, 403, { error: 'Invalid credentials' });
    }

    const auth = { role: 'admin', email: 'admin', expiresAt: new Date(Date.now() + 1000*60*60*12).toISOString() };
    setAuthCookie(res, auth, 60*60*12);
    return json(res, 200, auth);
  } catch (e) {
    return json(res, 500, { error: e.message || String(e) });
  }
};
