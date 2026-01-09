const { json, setCors, readBody, parseCookies, verifyToken } = require('./_util');
const { getFile, putFile, deleteFile, fromBase64 } = require('./_github');

const MANIFEST_PATH = 'data/manifest.json';
const DASH_DIR = 'data/dashboards';
const PERM_DIR = 'data/permissions';

function auth(req) {
  const secret = process.env.SESSION_SECRET || '';
  const cookies = parseCookies(req);
  return verifyToken(cookies.tw_session, secret);
}

function canView(user, perm) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!perm) return false;
  if (perm.ownerEmail && perm.ownerEmail === user.email) return true;
  if (Array.isArray(perm.editors) && perm.editors.includes(user.email)) return true;
  if (Array.isArray(perm.viewers) && perm.viewers.includes(user.email)) return true;
  return false;
}

function canEdit(user, perm) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!perm) return user.role === 'creator';
  if (perm.ownerEmail === user.email) return user.role === 'creator';
  if (Array.isArray(perm.editors) && perm.editors.includes(user.email)) return user.role === 'creator';
  return false;
}

function canDelete(user, perm) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  // Creator can delete only if not published
  if (user.role === 'creator') {
    return perm && perm.ownerEmail === user.email && perm.published !== true;
  }
  return false;
}

async function loadJson(env, path) {
  const file = await getFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path, branch: env.GITHUB_BRANCH||'main' });
  if (file.error) return { error: file.error };
  if (!file.exists) return { exists:false, sha:null, data:null };
  try { return { exists:true, sha:file.sha, data: JSON.parse(fromBase64(file.contentB64)) }; }
  catch { return { exists:true, sha:file.sha, data:null };
  }
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return json(res, 204, { ok:true });

  const env = process.env;
  const missing = ['GITHUB_TOKEN','GITHUB_OWNER','GITHUB_REPO','SESSION_SECRET'].filter(k => !env[k]);
  if (missing.length) return json(res, 500, { error:'Missing env vars', missing });

  const user = auth(req);
  if (!user) return json(res, 401, { error:'Not authenticated' });

  const dashId = String((req.query && req.query.dash) || '').trim();
  const listFlag = req.query && req.query.list;

  // LIST dashboards user can see
  if (req.method === 'GET' && listFlag) {
    const man = await loadJson(env, MANIFEST_PATH);
    const list = Array.isArray(man.data) ? man.data : [];

    // filter by permissions
    const visible = [];
    for (const d of list) {
      const id = d && d.id;
      if (!id) continue;
      if (user.role === 'admin') { visible.push(d); continue; }
      const permFile = await loadJson(env, `${PERM_DIR}/${id}.json`);
      const perm = permFile.data;
      if (perm && canView(user, perm)) visible.push(d);
      // If no permission file yet, allow creator to see their own drafts by ownership in manifest? keep hidden.
    }

    return json(res, 200, { dashboards: visible });
  }

  if (!dashId) return json(res, 400, { error:'dash id required' });

  const permFile = await loadJson(env, `${PERM_DIR}/${dashId}.json`);
  const perm = permFile.data;

  // GET state
  if (req.method === 'GET') {
    if (!canView(user, perm) && user.role !== 'admin') return json(res, 403, { error:'No access' });
    const st = await loadJson(env, `${DASH_DIR}/${dashId}.json`);
    if (st.error) return json(res, 502, { error:'GitHub read state failed', details: st.error });
    if (!st.exists) return json(res, 200, { state: null, exists: false, perm: perm || null });
    return json(res, 200, { state: st.data, exists: true, perm: perm || null });
  }

  // SAVE state
  if (req.method === 'POST') {
    if (!canEdit(user, perm) && user.role !== 'admin') return json(res, 403, { error:'Edit not allowed' });
    const body = await readBody(req);
    if (body.__raw) return json(res, 400, { error:'Invalid JSON body' });
    const state = Object.prototype.hasOwnProperty.call(body, 'state') ? body.state : null;

    // Ensure permission file exists for creator drafts
    let permObj = perm || { dashId, ownerEmail: user.role==='admin' ? 'admin' : user.email, published: false, viewers: [], editors: [user.email] };
    if (!permObj.ownerEmail) permObj.ownerEmail = user.email;

    // Write dashboard file
    const existing = await getFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: `${DASH_DIR}/${dashId}.json`, branch: env.GITHUB_BRANCH||'main' });
    if (existing.error) return json(res, 502, { error:'GitHub read state failed', details: existing.error });

    const saved = await putFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: `${DASH_DIR}/${dashId}.json`, branch: env.GITHUB_BRANCH||'main', message: `Save ${dashId} (${new Date().toISOString()})`, contentStr: JSON.stringify(state, null, 2), sha: existing.sha });
    if (saved.error) return json(res, 502, { error:'GitHub save state failed', details: saved.error });

    // Upsert permissions file
    const permExisting = await getFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: `${PERM_DIR}/${dashId}.json`, branch: env.GITHUB_BRANCH||'main' });
    if (!permExisting.error) {
      await putFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: `${PERM_DIR}/${dashId}.json`, branch: env.GITHUB_BRANCH||'main', message: `Perm upsert ${dashId} (${new Date().toISOString()})`, contentStr: JSON.stringify(permObj, null, 2), sha: permExisting.sha });
    }

    // Update manifest (id, name, updatedAt)
    const man = await loadJson(env, MANIFEST_PATH);
    const list = Array.isArray(man.data) ? man.data : [];
    const name = state && state.__meta && state.__meta.name ? String(state.__meta.name) : dashId;
    const now = new Date().toISOString();
    const idx = list.findIndex(x => x && x.id === dashId);
    const entry = { id: dashId, name, updatedAt: now };
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], entry);
    else list.push(entry);

    const manSaved = await putFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: MANIFEST_PATH, branch: env.GITHUB_BRANCH||'main', message: `Manifest ${now}`, contentStr: JSON.stringify(list, null, 2), sha: man.sha });
    if (manSaved.error) return json(res, 502, { error:'GitHub save manifest failed', details: manSaved.error });

    return json(res, 200, { ok:true, commitUrl: saved.commitUrl });
  }

  // DELETE dashboard
  if (req.method === 'DELETE') {
    if (!canDelete(user, perm)) return json(res, 403, { error:'Delete not allowed' });

    // delete state file
    const stateFile = await getFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: `${DASH_DIR}/${dashId}.json`, branch: env.GITHUB_BRANCH||'main' });
    if (stateFile.error) return json(res, 502, { error:'GitHub read for delete failed', details: stateFile.error });
    if (stateFile.exists) {
      const del = await deleteFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: `${DASH_DIR}/${dashId}.json`, branch: env.GITHUB_BRANCH||'main', sha: stateFile.sha });
      if (del.error) return json(res, 502, { error:'GitHub delete state failed', details: del.error });
    }

    // remove manifest entry
    const man = await loadJson(env, MANIFEST_PATH);
    const list = (Array.isArray(man.data)?man.data:[]).filter(x => x && x.id !== dashId);
    await putFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: MANIFEST_PATH, branch: env.GITHUB_BRANCH||'main', message: `Manifest remove ${dashId} (${new Date().toISOString()})`, contentStr: JSON.stringify(list, null, 2), sha: man.sha });

    return json(res, 200, { ok:true });
  }

  return json(res, 405, { error:'Method not allowed' });
};
