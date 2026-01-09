const { json, setCors, readBody, setCookie } = require('../_util');
const { getFile, putFile, fromBase64 } = require('../_github');

const USERS_PATH = 'data/users.json';

async function loadUsers(env) {
  const file = await getFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: USERS_PATH, branch: env.GITHUB_BRANCH||'main' });
  if (file.error) return { error: file.error };
  if (!file.exists) return { users: [], sha: null };
  try {
    const users = JSON.parse(fromBase64(file.contentB64));
    return { users: Array.isArray(users)?users:[], sha: file.sha };
  } catch {
    return { users: [], sha: file.sha };
  }
}

function roleForEmail(users, email) {
  const u = users.find(x => (x.email||'').toLowerCase() === email.toLowerCase() && x.active !== false);
  return u ? (u.role || 'viewer') : null;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return json(res, 204, { ok:true });
  if (req.method !== 'POST') return json(res, 405, { error:'Method not allowed' });

  const env = process.env;
  const required = ['GITHUB_TOKEN','GITHUB_OWNER','GITHUB_REPO','SESSION_SECRET'];
  const missing = required.filter(k => !env[k]);
  if (missing.length) return json(res, 500, { error:'Missing env vars', missing });

  const body = await readBody(req);
  const email = String(body.email || '').trim();
  if (!email) return json(res, 400, { error:'Email is required' });

  const { users, sha, error } = await loadUsers(env);
  if (error) return json(res, 502, { error:'GitHub read users failed', details: error });

  const role = roleForEmail(users, email);
  if (!role) return json(res, 403, { error:'Email not allowed. Ask Admin to add you.' });

  // create session
  const { signToken } = require('../_util');
  const token = signToken({ email, role }, env.SESSION_SECRET, 60*60*12);
  setCookie(res, 'tw_session', token, { maxAge: 60*60*12 });

  return json(res, 200, { email, role });
};
