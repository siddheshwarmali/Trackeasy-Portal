// api/state.js
const { getAuth, hasRole, json, readJsonBody } = require('./_lib/auth');
const { repoInfo, getJson, putJson, deleteJson, listFolder } = require('./_lib/github');

function ok(res, data){ return json(res, 200, data); }
function bad(res, status, message, details){ return json(res, status, { error: message, details }); }
function lower(x){ return String(x||'').trim().toLowerCase(); }

function computePermission(auth, meta){
  if (!auth) return 'none';
  if (auth.role === 'admin') return 'owner';
  const me = lower(auth.userId);
  const owner = lower(meta.ownerId);
  const editors = Array.isArray(meta.editors) ? meta.editors.map(lower) : [];
  const viewers = Array.isArray(meta.viewers) ? meta.viewers.map(lower) : [];
  if (me && owner && me === owner) return 'owner';
  if (editors.includes(me)) return 'editor';
  if (viewers.includes(me)) return 'viewer';
  return 'none';
}

module.exports = async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return bad(res, 401, 'Login required');

    const method = req.method || 'GET';
    const dash = (req.query && (req.query.dash || req.query.id)) || null;
    const isList = req.query && (req.query.list === '1' || req.query.list === 1 || req.query.list === true);

    const { dashPrefix } = repoInfo();

    if (method === 'GET'){
      if (isList){
        const files = await listFolder(dashPrefix);
        const dashboards = [];
        for (const f of files){
          const id = String(f.name).replace(/\.json$/, '');
          try {
            const st = await getJson(dashPrefix, id);
            if (!st.exists || !st.json) continue;
            const meta = st.json.__meta || {};
            const perm = computePermission(auth, meta);
            if (auth.role !== 'admin' && perm === 'none') continue;
            dashboards.push({ id, name: meta.name || id, ownerId: meta.ownerId || null, published: !!meta.published, permission: perm, updatedAt: meta.updatedAt || meta.createdAt || null, createdAt: meta.createdAt || null });
          } catch {}
        }
        dashboards.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
        return ok(res, { dashboards });
      }

      if (!dash) return bad(res, 400, 'Missing query param: dash');
      const f = await getJson(dashPrefix, dash);
      if (!f.exists) return ok(res, { id: dash, state: null, exists: false });
      const meta = (f.json && f.json.__meta) ? f.json.__meta : {};
      const perm = computePermission(auth, meta);
      if (auth.role !== 'admin' && perm === 'none') return bad(res, 403, 'No access');
      return ok(res, { id: dash, state: f.json, exists: true, permission: perm });
    }

    if (method === 'POST'){
      if (!dash) return bad(res, 400, 'Missing query param: dash');
      if (!hasRole(auth, ['admin','creator'])) return bad(res, 403, 'Not allowed');
      const body = await readJsonBody(req);
      const state = body && body.state;
      if (!state || typeof state !== 'object') return bad(res, 400, 'Missing body.state');

      const existing = await getJson(dashPrefix, dash);
      const now = new Date().toISOString();
      state.__meta = state.__meta || {};
      if (existing.exists && existing.json && existing.json.__meta && existing.json.__meta.ownerId) state.__meta.ownerId = existing.json.__meta.ownerId;
      else state.__meta.ownerId = auth.userId;

      state.__meta.editors = Array.isArray(state.__meta.editors) ? state.__meta.editors : (existing.json?.__meta?.editors || []);
      state.__meta.viewers = Array.isArray(state.__meta.viewers) ? state.__meta.viewers : (existing.json?.__meta?.viewers || []);
      state.__meta.published = !!state.__meta.published;
      if (!state.__meta.name) state.__meta.name = dash;

      const perm = computePermission(auth, state.__meta);
      const canWrite = (auth.role === 'admin') || perm === 'owner' || perm === 'editor';
      if (!canWrite) return bad(res, 403, 'No write permission');

      state.__meta.updatedAt = now;
      if (!state.__meta.createdAt) state.__meta.createdAt = now;

      await putJson(dashPrefix, dash, state, `Save dashboard ${dash}`);
      return ok(res, { ok:true, id: dash });
    }

    if (method === 'DELETE'){
      if (!dash) return bad(res, 400, 'Missing query param: dash');

      if (auth.role === 'admin') {
        await deleteJson(dashPrefix, dash, `Delete dashboard ${dash}`);
        return ok(res, { ok:true, id: dash });
      }

      if (auth.role === 'creator') {
        const existing = await getJson(dashPrefix, dash);
        if (!existing.exists || !existing.json) return ok(res, { ok:true, id: dash });
        const meta = existing.json.__meta || {};
        const isOwner = lower(meta.ownerId) === lower(auth.userId);
        const isPublished = !!meta.published;
        if (!isOwner) return bad(res, 403, 'Only owner can delete');
        if (isPublished) return bad(res, 403, 'Creators cannot delete after publishing');
        await deleteJson(dashPrefix, dash, `Delete dashboard ${dash}`);
        return ok(res, { ok:true, id: dash });
      }

      return bad(res, 403, 'Admin only');
    }

    return bad(res, 405, 'Method not allowed');

  } catch (e){
    return json(res, 500, { error: e.message || String(e), details: e.data || null });
  }
};
