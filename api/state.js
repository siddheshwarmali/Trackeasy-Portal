// api/state.js
const { getAuth, hasRole, json, readJsonBody } = require('./_lib/auth');
const { listDashboards, getFile, putFile, deleteFile } = require('./_lib/github');

function ok(res, data) { return json(res, 200, data); }
function bad(res, status, message, details) { return json(res, status, { error: message, details }); }

module.exports = async (req, res) => {
  try {
    const auth = getAuth(req);
    const method = req.method || 'GET';
    const dash = (req.query && (req.query.dash || req.query.id)) || null;
    const isList = req.query && (req.query.list === '1' || req.query.list === 1 || req.query.list === true);

    // Read access: anyone who is authenticated OR allow anonymous reads if you want
    // We'll allow anonymous GET for list/get, but writes require creator/admin.

    if (method === 'GET') {
      if (isList) {
        const dashboards = await listDashboards();
        return ok(res, { dashboards });
      }
      if (!dash) return bad(res, 400, 'Missing query param: dash');
      const f = await getFile(dash);
      if (!f.exists) return ok(res, { id: dash, state: null, exists: false });
      return ok(res, { id: dash, state: f.json, exists: true });
    }

    if (method === 'POST') {
      if (!dash) return bad(res, 400, 'Missing query param: dash');
      if (!hasRole(auth, ['admin', 'creator'])) return bad(res, 403, 'Not allowed');
      const body = await readJsonBody(req);
      const state = body && body.state;
      if (!state || typeof state !== 'object') return bad(res, 400, 'Missing body.state');
      // Add/update meta timestamps
      state.__meta = state.__meta || {};
      state.__meta.updatedAt = new Date().toISOString();
      if (!state.__meta.createdAt) state.__meta.createdAt = state.__meta.updatedAt;
      if (!state.__meta.name) state.__meta.name = dash;

      await putFile(dash, state);
      return ok(res, { ok: true, id: dash });
    }

    if (method === 'DELETE') {
      if (!dash) return bad(res, 400, 'Missing query param: dash');
      if (!hasRole(auth, ['admin'])) return bad(res, 403, 'Not allowed');
      await deleteFile(dash);
      return ok(res, { ok: true, id: dash });
    }

    return bad(res, 405, 'Method not allowed');
  } catch (e) {
    return json(res, 500, { error: e.message || String(e), details: e.data || null });
  }
};
