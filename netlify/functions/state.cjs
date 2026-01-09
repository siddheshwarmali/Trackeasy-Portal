// netlify/functions/state.js
const { getFile, putFile, deleteFile, fromBase64 } = require('./_github');
const { parseCookies, verifyToken, signToken, json, readBody } = require('./_util');

const MANIFEST_PATH = 'data/manifest.json';
const DASH_DIR = 'data/dashboards';
const PERM_DIR = 'data/permissions';

exports.handler = async (event) => {
  const env = process.env;
  const missing = ['GITHUB_TOKEN','GITHUB_OWNER','GITHUB_REPO','SESSION_SECRET'].filter(k => !env[k]);
  if (missing.length) return json(500, { error:'Missing env vars', missing });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  const cookies = parseCookies(event.headers.cookie || '');
  const user = verifyToken(cookies.tw_session, env.SESSION_SECRET);
  if (!user) return json(401, { error:'Not authenticated' });

  const params = event.queryStringParameters || {};
  const dashId = String(params.dash||'').trim();
  const listFlag = params.list;

  // helper: load json
  async function loadJson(path) {
    const file = await getFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path, branch: env.GITHUB_BRANCH||'main' });
    if (file.error) return { error: file.error };
    if (!file.exists) return { exists:false, sha:null, data:null };
    try { return { exists:true, sha:file.sha, data: JSON.parse(fromBase64(file.contentB64)) }; }
    catch { return { exists:true, sha:file.sha, data:null }; }
  }

  function canView(perm) {
    if (user.role === 'admin') return true;
    if (!perm) return false;
    if (perm.ownerEmail === user.email) return true;
    if (Array.isArray(perm.editors) && perm.editors.includes(user.email)) return true;
    if (Array.isArray(perm.viewers) && perm.viewers.includes(user.email)) return true;
    return false;
  }

  function canEdit(perm) {
    if (user.role === 'admin') return true;
    if (user.role !== 'creator') return false;
    if (!perm) return true;
    if (perm.ownerEmail === user.email) return true;
    if (Array.isArray(perm.editors) && perm.editors.includes(user.email)) return true;
    return false;
  }

  function canDelete(perm) {
    if (user.role === 'admin') return true;
    if (user.role === 'creator') return perm && perm.ownerEmail === user.email && perm.published !== true;
    return false;
  }

  if (event.httpMethod === 'GET' && listFlag) {
    const man = await loadJson(MANIFEST_PATH);
    const list = Array.isArray(man.data) ? man.data : [];
    const visible = [];
    for (const d of list) {
      const id = d && d.id;
      if (!id) continue;
      if (user.role === 'admin') { visible.push(d); continue; }
      const pf = await loadJson(`${PERM_DIR}/${id}.json`);
      if (pf.data && canView(pf.data)) visible.push(d);
    }
    return json(200, { dashboards: visible });
  }

  if (!dashId) return json(400, { error:'dash id required' });
  const permFile = await loadJson(`${PERM_DIR}/${dashId}.json`);
  const perm = permFile.data;

  if (event.httpMethod === 'GET') {
    if (!canView(perm)) return json(403, { error:'No access' });
    const st = await loadJson(`${DASH_DIR}/${dashId}.json`);
    if (st.error) return json(502, { error:'GitHub read state failed', details: st.error });
    if (!st.exists) return json(200, { state:null, exists:false, perm: perm||null });
    return json(200, { state: st.data, exists:true, perm: perm||null });
  }

  if (event.httpMethod === 'POST') {
    if (!canEdit(perm)) return json(403, { error:'Edit not allowed' });
    const body = await readBody(event.body);
    const state = body && Object.prototype.hasOwnProperty.call(body,'state') ? body.state : null;

    let permObj = perm || { dashId, ownerEmail: user.role==='admin'?'admin':user.email, published:false, viewers:[], editors:[user.email] };

    const existing = await getFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: `${DASH_DIR}/${dashId}.json`, branch: env.GITHUB_BRANCH||'main' });
    const saved = await putFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: `${DASH_DIR}/${dashId}.json`, branch: env.GITHUB_BRANCH||'main', message: `Save ${dashId} (${new Date().toISOString()})`, contentStr: JSON.stringify(state,null,2), sha: existing.sha });
    if (saved.error) return json(502, { error:'GitHub save failed', details: saved.error });

    // perm upsert
    const permExisting = await getFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: `${PERM_DIR}/${dashId}.json`, branch: env.GITHUB_BRANCH||'main' });
    await putFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: `${PERM_DIR}/${dashId}.json`, branch: env.GITHUB_BRANCH||'main', message: `Perm upsert ${dashId}`, contentStr: JSON.stringify(permObj,null,2), sha: permExisting.sha });

    // manifest
    const man = await loadJson(MANIFEST_PATH);
    const list = Array.isArray(man.data)?man.data:[];
    const name = state && state.__meta && state.__meta.name ? String(state.__meta.name) : dashId;
    const now = new Date().toISOString();
    const idx = list.findIndex(x => x && x.id === dashId);
    const entry = { id: dashId, name, updatedAt: now };
    if (idx>=0) list[idx] = Object.assign({}, list[idx], entry);
    else list.push(entry);
    await putFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: MANIFEST_PATH, branch: env.GITHUB_BRANCH||'main', message:`Manifest ${now}`, contentStr: JSON.stringify(list,null,2), sha: man.sha });

    return json(200, { ok:true, commitUrl: saved.commitUrl });
  }

  if (event.httpMethod === 'DELETE') {
    if (!canDelete(perm)) return json(403, { error:'Delete not allowed' });
    const stateFile = await getFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: `${DASH_DIR}/${dashId}.json`, branch: env.GITHUB_BRANCH||'main' });
    if (stateFile.exists) {
      const del = await deleteFile({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: `${DASH_DIR}/${dashId}.json`, branch: env.GITHUB_BRANCH||'main', sha: stateFile.sha });
      if (del.error) return json(502, { error:'GitHub delete failed', details: del.error });
    }
    return json(200, { ok:true });
  }

  return json(405, { error:'Method not allowed' });
};

function corsHeaders(){
  return {
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'Content-Type, Authorization',
    'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS'
  };
}
