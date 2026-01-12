
const { sign, setCookie, json, readJson } = require('../_lib/auth');
const isProd = process.env.NODE_ENV === 'production';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const secret = process.env.AUTH_SECRET || 'dev-secret-change-me';
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin';

  let body = {};
  try { body = await readJson(req); } catch (e) { return json(res, 400, { error: e.message }); }

  const username = String(body.username || '').trim();
  const password = String(body.password || '').trim();
  if (!username || !password) return json(res, 400, { error: 'Username and password required' });
  if (username !== adminUser || password !== adminPass) return json(res, 401, { error: 'Invalid credentials' });

  const role = 'admin';
  const token = sign({ role, userId: username }, secret);
  setCookie(res, 'tw_session', token, { httpOnly: true, sameSite: 'Lax', secure: isProd, maxAge: 60*60*12 });
  return json(res, 200, { authenticated: true, role, userId: username });
};
