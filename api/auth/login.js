
const { sign, setCookie, json, readJson, envList } = require('../_lib/auth');
const isProd = process.env.NODE_ENV === 'production';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const secret = process.env.AUTH_SECRET || 'dev-secret-change-me';
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin';

  const creators = envList('CREATOR_EMAILS');
  const viewers = envList('VIEWER_EMAILS');

  let body = {};
  try { body = await readJson(req); } catch (e) { return json(res, 400, { error: e.message }); }

  // Email login: Creator & Viewer
  if (body.email) {
    const email = String(body.email).trim().toLowerCase();
    if (!email) return json(res, 400, { error: 'Email required' });
    // If allow-lists are empty, deny by default (safe)
    const inCreators = creators.includes(email);
    const inViewers = viewers.includes(email);
    if (!inCreators && !inViewers) {
      return json(res, 401, { error: 'Email not authorized' });
    }
    const role = inCreators ? 'creator' : 'viewer';
    const token = sign({ role, email }, secret);
    setCookie(res, 'tw_session', token, { httpOnly: true, sameSite: 'Lax', secure: isProd, maxAge: 60*60*12 });
    return json(res, 200, { authenticated: true, role, email });
  }

  // Legacy login.html path: userId + password (treat as admin)
  if (body.userId || body.username) {
    const username = String(body.username || body.userId || '').trim();
    const password = String(body.password || '').trim();
    if (!username || !password) return json(res, 400, { error: 'User ID and password required' });
    if (username !== adminUser || password !== adminPass) return json(res, 401, { error: 'Invalid credentials' });
    const role = 'admin';
    const token = sign({ role, userId: username }, secret);
    setCookie(res, 'tw_session', token, { httpOnly: true, sameSite: 'Lax', secure: isProd, maxAge: 60*60*12 });
    return json(res, 200, { authenticated: true, role, userId: username });
  }

  return json(res, 400, { error: 'Unsupported login payload' });
};
