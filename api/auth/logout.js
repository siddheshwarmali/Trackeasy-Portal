// api/auth/logout.js
const { clearAuthCookie, json } = require('../_lib/auth');

module.exports = async (req, res) => {
  clearAuthCookie(res);
  return json(res, 200, { ok: true });
};
