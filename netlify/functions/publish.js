const { json, readBody, parseCookies, verifyToken } = require('./_util');
const { getFile, putFile, fromBase64 } = require('./_github');

const PERM_DIR = 'data/permissions';

exports.handler = async (event) => {
  const env = process.env;
  const missing = ['GITHUB_TOKEN','GITHUB_OWNER','GITHUB_REPO','SESSION_SECRET'].filter(k => !env[k]);
  if (missing.length) return json(500, { error:'Missing env vars', missing });

  if (event.httpMethod !== 'POST') return json(405, { error:'Method not allowed' });

  const cookies = parseCookies(event.headers.cookie || '');
  const user = verifyToken(cookies.tw_session, env.SESSION_SECRET);
  if (!user) return json(401, { error:'Not authenticated' });
  if (!(user.role === 'admin' || user.role === 'creator')) return json(403, { error:'Not allowed' });

  const body = await readBody(event.body);
  const dashId = String(body.dashId||'').trim();
  if (!dashId) return json(400, { error:'dashId required' });
  const viewers = Array.isArray(body.viewers) ? body.viewers.map(x=>String(x).trim()).filter(Boolean) : [];

  const path = `${PERM_DIR}/${dashId}.json`;
  const existing = await getFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path, branch: env.GITHUB_BRANCH||'main' });
  let perm = { dashId, ownerEmail: user.email, published:false, viewers:[], editors:[user.email] };
  let sha = null;
  if (existing.exists) {
    sha = existing.sha;
    try { perm = JSON.parse(fromBase64(existing.contentB64)); } catch {}
  }

  if (user.role !== 'admin' && perm.ownerEmail && perm.ownerEmail !== user.email) return json(403, { error:'Only owner can publish' });

  perm.published = true;
  perm.viewers = viewers;

  const saved = await putFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path, branch: env.GITHUB_BRANCH||'main', message:`Publish ${dashId} (${new Date().toISOString()})`, contentStr: JSON.stringify(perm,null,2), sha });
  if (saved.error) return json(502, { error:'GitHub save permissions failed', details: saved.error });

  return json(200, { ok:true, commitUrl: saved.commitUrl, perm });
};
