// api/auth/me.js
const { getAuth, json } = require('../_lib/auth');
module.exports = async (req, res) => {
  const auth = getAuth(req);
  if (!auth) return json(res, 200, { authenticated: false });
  return json(res, 200, { authenticated: true, ...auth });
};
