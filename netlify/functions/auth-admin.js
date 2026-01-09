const { json, readBody, signToken } = require('./_util');

exports.handler = async (event) => {
  const env = process.env;
  const missing = ['SESSION_SECRET','ADMIN_USER','ADMIN_PASS'].filter(k => !env[k]);
  if (missing.length) return json(500, { error:'Missing env vars', missing });

  const body = await readBody(event.body);
  const username = String(body.username||'').trim();
  const password = String(body.password||'').trim();
  if (username !== env.ADMIN_USER || password !== env.ADMIN_PASS) return json(403, { error:'Invalid admin credentials' });

  const token = signToken({ email:'admin', role:'admin' }, env.SESSION_SECRET, 60*60*12);
  return json(200, { email:'admin', role:'admin' }, { 'Set-Cookie': `tw_session=${encodeURIComponent(token)}; Path=/; Max-Age=${60*60*12}; SameSite=Lax; HttpOnly; Secure` });
};
