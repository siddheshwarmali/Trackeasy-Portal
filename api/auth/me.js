const { json, setCors, parseCookies, verifyToken } = require('../_util');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return json(res, 204, { ok:true });

  const secret = process.env.SESSION_SECRET || '';
  if (!secret) return json(res, 500, { error:'Missing SESSION_SECRET env var' });

  const cookies = parseCookies(req);
  const payload = verifyToken(cookies.tw_session, secret);
  if (!payload) return json(res, 401, { error:'Not authenticated' });

  return json(res, 200, { email: payload.email, role: payload.role });
};
