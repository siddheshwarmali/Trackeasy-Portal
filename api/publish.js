const { json, setCors, readBody, parseCookies, verifyToken } = require('./_util');
const { getFile, putFile, fromBase64 } = require('./_github');

const PERM_DIR = 'data/permissions';

function requireUser(req) {
  const secret = process.env.SESSION_SECRET || '';
  const cookies = parseCookies(req);
  const payload = verifyToken(cookies.tw_session, secret);
  return payload;
}

async function loadPerm(env, dashId) {
  const path = `${PERM_DIR}/${dashId}.json`;
  const file = await getFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path, branch: env.GITHUB_BRANCH||'main' });
  if (file.error) return { error: file.error };
  if (!file.exists) return { exists:false, sha:null, perm:null, path };
  try { return { exists:true, sha:file.sha, perm: JSON.parse(fromBase64(file.contentB64)), path }; }
  catch { return { exists:true, sha:file.sha, perm: null, path }; }
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return json(res, 204, { ok:true });
  if (req.method !== 'POST') return json(res, 405, { error:'Method not allowed' });

  const env = process.env;
  const missing = ['GITHUB_TOKEN','GITHUB_OWNER','GITHUB_REPO','SESSION_SECRET'].filter(k => !env[k]);
  if (missing.length) return json(res, 500, { error:'Missing env vars', missing });

  const user = requireUser(req);
  if (!user) return json(res, 401, { error:'Not authenticated' });
  if (!(user.role === 'admin' || user.role === 'creator')) return json(res, 403, { error:'Not allowed' });

  const body = await readBody(req);
  const dashId = String(body.dashId||'').trim();
  if (!dashId) return json(res, 400, { error:'dashId required' });
  const viewers = Array.isArray(body.viewers) ? body.viewers.map(x=>String(x).trim()).filter(Boolean) : [];

  const existing = await loadPerm(env, dashId);
  if (existing.error) return json(res, 502, { error:'GitHub read permissions failed', details: existing.error });

  const perm = existing.perm || { dashId, ownerEmail: user.email, published: false, viewers: [], editors: [user.email] };

  // Only admin can change owner; creator must be owner
  if (user.role !== 'admin' && perm.ownerEmail && perm.ownerEmail !== user.email) {
    return json(res, 403, { error:'Only owner can publish' });
  }

  perm.published = true;
  perm.viewers = viewers;
  if (!perm.ownerEmail) perm.ownerEmail = user.email;
  if (!Array.isArray(perm.editors)) perm.editors = [perm.ownerEmail];

  const saved = await putFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: existing.path, branch: env.GITHUB_BRANCH||'main', message: `Publish ${dashId} (${new Date().toISOString()})`, contentStr: JSON.stringify(perm, null, 2), sha: existing.sha });
  if (saved.error) return json(res, 502, { error:'GitHub save permissions failed', details: saved.error });

  return json(res, 200, { ok:true, commitUrl: saved.commitUrl, perm });
};
