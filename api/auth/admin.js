const { json, setCors, readBody, setCookie, signToken } = require('../_util');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return json(res, 204, { ok:true });
  if (req.method !== 'POST') return json(res, 405, { error:'Method not allowed' });

  const env = process.env;
  const missing = ['SESSION_SECRET','ADMIN_USER','ADMIN_PASS'].filter(k => !env[k]);
  if (missing.length) return json(res, 500, { error:'Missing env vars', missing });

  const body = await readBody(req);
  const username = String(body.username||'').trim();
  const password = String(body.password||'').trim();

  if (username !== env.ADMIN_USER || password !== env.ADMIN_PASS) {
    return json(res, 403, { error:'Invalid admin credentials' });
  }

  const token = signToken({ email: 'admin', role:'admin' }, env.SESSION_SECRET, 60*60*12);
  setCookie(res, 'tw_session', token, { maxAge: 60*60*12 });
  return json(res, 200, { email:'admin', role:'admin' });
};
