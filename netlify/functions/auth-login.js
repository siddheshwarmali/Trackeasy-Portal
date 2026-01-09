const { json, readBody, signToken } = require('./_util');
const { getFile, fromBase64 } = require('./_github');

const USERS_PATH = 'data/users.json';

exports.handler = async (event) => {
  const env = process.env;
  const missing = ['GITHUB_TOKEN','GITHUB_OWNER','GITHUB_REPO','SESSION_SECRET'].filter(k => !env[k]);
  if (missing.length) return json(500, { error:'Missing env vars', missing });

  const body = await readBody(event.body);
  const email = String(body.email||'').trim();
  if (!email) return json(400, { error:'Email is required' });

  const file = await getFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: USERS_PATH, branch: env.GITHUB_BRANCH||'main' });
  if (file.error) return json(502, { error:'GitHub read users failed', details: file.error });
  const users = file.exists ? (JSON.parse(fromBase64(file.contentB64)) || []) : [];
  const u = (Array.isArray(users)?users:[]).find(x => (x.email||'').toLowerCase() === email.toLowerCase() && x.active !== false);
  if (!u) return json(403, { error:'Email not allowed. Ask Admin to add you.' });

  const role = u.role || 'viewer';
  const token = signToken({ email, role }, env.SESSION_SECRET, 60*60*12);
  return json(200, { email, role }, { 'Set-Cookie': `tw_session=${encodeURIComponent(token)}; Path=/; Max-Age=${60*60*12}; SameSite=Lax; HttpOnly; Secure` });
};
