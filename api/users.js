const { json, setCors, readBody, parseCookies, verifyToken } = require('./_util');
const { getFile, putFile, fromBase64 } = require('./_github');

const USERS_PATH = 'data/users.json';

async function requireAdmin(req) {
  const secret = process.env.SESSION_SECRET || '';
  const cookies = parseCookies(req);
  const payload = verifyToken(cookies.tw_session, secret);
  if (!payload || payload.role !== 'admin') return null;
  return payload;
}

async function loadUsers(env) {
  const file = await getFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: USERS_PATH, branch: env.GITHUB_BRANCH||'main' });
  if (file.error) return { error: file.error };
  if (!file.exists) return { users: [], sha: null };
  try { return { users: JSON.parse(fromBase64(file.contentB64)), sha: file.sha }; }
  catch { return { users: [], sha: file.sha }; }
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return json(res, 204, { ok:true });

  const env = process.env;
  const missing = ['GITHUB_TOKEN','GITHUB_OWNER','GITHUB_REPO','SESSION_SECRET'].filter(k => !env[k]);
  if (missing.length) return json(res, 500, { error:'Missing env vars', missing });

  const admin = await requireAdmin(req);
  if (!admin) return json(res, 403, { error:'Admin only' });

  const { users, sha, error } = await loadUsers(env);
  if (error) return json(res, 502, { error:'GitHub read users failed', details: error });

  if (req.method === 'GET') {
    return json(res, 200, { users: Array.isArray(users)?users:[] });
  }

  const body = await readBody(req);

  if (req.method === 'POST') {
    const email = String(body.email||'').trim();
    const role = String(body.role||'viewer').trim();
    if (!email) return json(res, 400, { error:'email required' });
    const next = Array.isArray(users)?users:[];
    const idx = next.findIndex(x => (x.email||'').toLowerCase() === email.toLowerCase());
    const rec = { email, role, active: body.active !== false };
    if (idx>=0) next[idx] = Object.assign({}, next[idx], rec);
    else next.push(rec);

    const saved = await putFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: USERS_PATH, branch: env.GITHUB_BRANCH||'main', message: `Update users (${new Date().toISOString()})`, contentStr: JSON.stringify(next, null, 2), sha });
    if (saved.error) return json(res, 502, { error:'GitHub save users failed', details: saved.error });
    return json(res, 200, { ok:true, commitUrl: saved.commitUrl });
  }

  if (req.method === 'DELETE') {
    const email = String(req.query.email||'').trim();
    if (!email) return json(res, 400, { error:'email query required' });
    const next = (Array.isArray(users)?users:[]).filter(x => (x.email||'').toLowerCase() !== email.toLowerCase());
    const saved = await putFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: USERS_PATH, branch: env.GITHUB_BRANCH||'main', message: `Delete user ${email} (${new Date().toISOString()})`, contentStr: JSON.stringify(next, null, 2), sha });
    if (saved.error) return json(res, 502, { error:'GitHub delete user failed', details: saved.error });
    return json(res, 200, { ok:true, commitUrl: saved.commitUrl });
  }

  return json(res, 405, { error:'Method not allowed' });
};
