// api/users.js
const { getAuth, hasRole, json, readJsonBody } = require('./_lib/auth');
const { repoInfo, getJson, putJson, deleteJson, listFolder, safeId } = require('./_lib/github');

function ok(res, data){ return json(res, 200, data); }
function bad(res, status, message, details){ return json(res, status, { error: message, details }); }

async function listUsers(){
  const { usersPrefix } = repoInfo();
  const files = await listFolder(usersPrefix);
  const out = [];
  for (const f of files){
    const id = String(f.name).replace(/\.json$/, '');
    try {
      const u = await getJson(usersPrefix, id);
      if (u.exists && u.json && u.json.email) out.push(u.json);
    } catch { /* ignore single file */ }
  }
  out.sort((a,b)=>String(a.email).localeCompare(String(b.email)));
  return out;
}

module.exports = async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return bad(res, 401, 'Login required');

    const method = req.method || 'GET';
    const { usersPrefix } = repoInfo();

    if (method === 'GET'){
      // Creators can read list for publish selector; Admin can manage.
      if (!hasRole(auth, ['admin','creator'])) return bad(res, 403, 'Not allowed');
      const users = await listUsers();
      // Never expose internal fields; keep it simple.
      return ok(res, { users: users.map(u => ({ email: u.email, role: u.role || 'viewer', active: u.active !== false })) });
    }

    if (method === 'POST'){
      if (!hasRole(auth, ['admin'])) return bad(res, 403, 'Admin only');
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const role = String(body.role || 'viewer').toLowerCase();
      const active = body.active !== false;
      if (!email) return bad(res, 400, 'Email required');
      if (!['viewer','creator','admin'].includes(role)) return bad(res, 400, 'Invalid role');

      const id = safeId(email);
      const record = { email, role, active, updatedAt: new Date().toISOString() };
      await putJson(usersPrefix, id, record, `Upsert user ${email}`);
      return ok(res, { ok:true });
    }

    if (method === 'DELETE'){
      if (!hasRole(auth, ['admin'])) return bad(res, 403, 'Admin only');
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) return bad(res, 400, 'Email required');
      const id = safeId(email);
      await deleteJson(usersPrefix, id, `Delete user ${email}`);
      return ok(res, { ok:true });
    }

    return bad(res, 405, 'Method not allowed');

  } catch (e){
    return json(res, 500, { error: e.message || String(e), details: e.data || null });
  }
};
