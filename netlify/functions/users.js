const { json, readBody, parseCookies, verifyToken } = require('./_util');
const { getFile, putFile, fromBase64 } = require('./_github');

const USERS_PATH = 'data/users.json';

exports.handler = async (event) => {
  const env = process.env;
  const missing = ['GITHUB_TOKEN','GITHUB_OWNER','GITHUB_REPO','SESSION_SECRET'].filter(k => !env[k]);
  if (missing.length) return json(500, { error:'Missing env vars', missing });

  const cookies = parseCookies(event.headers.cookie || '');
  const user = verifyToken(cookies.tw_session, env.SESSION_SECRET);
  if (!user || user.role !== 'admin') return json(403, { error:'Admin only' });

  const file = await getFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: USERS_PATH, branch: env.GITHUB_BRANCH||'main' });
  const sha = file.exists ? file.sha : null;
  const users = file.exists ? (JSON.parse(fromBase64(file.contentB64)) || []) : [];

  if (event.httpMethod === 'GET') return json(200, { users });

  if (event.httpMethod === 'POST') {
    const body = await readBody(event.body);
    const email = String(body.email||'').trim();
    const role = String(body.role||'viewer').trim();
    if (!email) return json(400, { error:'email required' });
    const next = Array.isArray(users)?users:[];
    const idx = next.findIndex(x => (x.email||'').toLowerCase() === email.toLowerCase());
    const rec = { email, role, active: body.active !== false };
    if (idx>=0) next[idx] = Object.assign({}, next[idx], rec);
    else next.push(rec);

    const saved = await putFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: USERS_PATH, branch: env.GITHUB_BRANCH||'main', message:`Update users (${new Date().toISOString()})`, contentStr: JSON.stringify(next,null,2), sha });
    if (saved.error) return json(502, { error:'GitHub save users failed', details: saved.error });
    return json(200, { ok:true, commitUrl: saved.commitUrl });
  }

  if (event.httpMethod === 'DELETE') {
    const email = String((event.queryStringParameters||{}).email||'').trim();
    if (!email) return json(400, { error:'email query required' });
    const next = (Array.isArray(users)?users:[]).filter(x => (x.email||'').toLowerCase() !== email.toLowerCase());
    const saved = await putFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: USERS_PATH, branch: env.GITHUB_BRANCH||'main', message:`Delete user ${email}`, contentStr: JSON.stringify(next,null,2), sha });
    if (saved.error) return json(502, { error:'GitHub delete user failed', details: saved.error });
    return json(200, { ok:true, commitUrl: saved.commitUrl });
  }

  return json(405, { error:'Method not allowed' });
};
