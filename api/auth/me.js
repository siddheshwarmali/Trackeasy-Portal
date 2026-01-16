const { parseCookies, verifyToken } = require('../../lib/auth');
const { sendJson } = require('../../lib/http');

module.exports = async (req, res) => {
  try {
    const cookies = parseCookies(req);
    const token = cookies.tw_session;
    const payload = verifyToken(token);
    if (!payload) return sendJson(res, 200, { authenticated: false });
    return sendJson(res, 200, { authenticated: true, userId: payload.userId, role: payload.role });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
