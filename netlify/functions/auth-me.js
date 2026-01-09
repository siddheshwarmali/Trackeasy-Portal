const { json, parseCookies, verifyToken } = require('./_util');

exports.handler = async (event) => {
  const secret = process.env.SESSION_SECRET || '';
  if (!secret) return json(500, { error:'Missing SESSION_SECRET' });

  const cookies = parseCookies(event.headers.cookie || '');
  const payload = verifyToken(cookies.tw_session, secret);
  if (!payload) return json(401, { error:'Not authenticated' });
  return json(200, { email: payload.email, role: payload.role }, {});
};
