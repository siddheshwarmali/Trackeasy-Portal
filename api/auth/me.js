const { parseCookies, verifyToken } = require('../../lib/auth');

function json(res, code, data) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.tw_session;
  const payload = verifyToken(token);

  if (!payload) return json(res, 200, { authenticated: false });

  return json(res, 200, {
    authenticated: true,
    userId: payload.userId,
    role: payload.role,
  });
};
