const { json, setCors, clearCookie } = require('../_util');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return json(res, 204, { ok:true });
  clearCookie(res, 'tw_session');
  return json(res, 200, { ok:true });
};
