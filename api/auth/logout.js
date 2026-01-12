
const { setCookie, json } = require('../_lib/auth');
const isProd = process.env.NODE_ENV === 'production';

module.exports = async (req, res) => {
  // Clear cookie
  setCookie(res, 'tw_session', '', { maxAge: 0, secure: isProd });
  return json(res, 200, { ok: true });
};
