const { json } = require('./_util');

exports.handler = async () => {
  return json(200, { ok:true }, { 'Set-Cookie': 'tw_session=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly; Secure' });
};
