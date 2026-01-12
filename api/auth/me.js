
const { verify, parseCookies, json } = require('../_lib/auth');

module.exports = async (req, res) => {
  const secret = process.env.AUTH_SECRET || 'dev-secret-change-me';
  const cookies = parseCookies(req);
  const token = cookies.tw_session;
  const session = verify(token, secret);
  if (!session) {
    return json(res, 200, { authenticated: false });
  }
  // Only return non-sensitive fields
  return json(res, 200, {
    authenticated: true,
    role: session.role,
    userId: session.userId || null,
    email: session.email || null,
    name: session.name || null,
  });
};
