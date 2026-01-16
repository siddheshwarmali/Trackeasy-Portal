const { clearCookie } = require('../../lib/auth');
const { sendJson } = require('../../lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  clearCookie(res);
  return sendJson(res, 200, { ok: true });
};
