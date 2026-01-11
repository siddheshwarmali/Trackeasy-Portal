// api/users.js
const { getAuth, hasRole, json, readJsonBody } = require('./_lib/auth');
const { repoInfo, getJson, putJson, deleteJson, listFolder, safeId } = require('./_lib/github');
const { hashPassword } = require('./_lib/password');

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
      if (u.exists && u.json && u.json.userId) out.push(u.json);
    } catch {}
  }
  out.sort((a,b)=>String(a.userId).localeCompare(String(b.userId)));
  return out;
}

module.exports = async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth) return bad(res, 401, 'Login required');

    const method = req.method || 'GET';

    if (method === 'GET'){
      // creators/admin can read user list for publish selector
      if (!hasRole(auth, ['admin','creator'])) return bad(res, 403, 'Not allowed');
      const users = await listUsers();
      return ok(res, { users: users.map(u => ({ userId: u.userId, role: u.role || 'viewer', active: u.active !== false })) });
    }

    if (method === 'POST'){
      if (!hasRole(auth, ['admin'])) return bad(res, 403, 'Admin only');
      const body = await readJsonBody(req);
      const userId = String(body.userId || '').trim();
      const role = String(body.role || 'viewer').toLowerCase();
      const active = body.active !== false;
      const password = String(body.password || '').trim();
      if (!userId) return bad(res, 400, 'User ID required');
      if (!['viewer','creator','admin'].includes(role)) return bad(res, 400, 'Invalid role');

      const { usersPrefix } = repoInfo();
      const id = safeId(userId);
      const existing = await getJson(usersPrefix, id);

      const now = new Date().toISOString();
      const record = existing.exists && existing.json ? existing.json : { createdAt: now };
      record.userId = userId;
      record.role = role;
      record.active = active;
      record.updatedAt = now;

      if (!existing.exists && !password) return bad(res, 400, 'Password required for new user');
      if (password) record.password = hashPassword(password);

      await putJson(usersPrefix, id, record, `Upsert user ${userId}`);
      return ok(res, { ok:true });
    }

    if (method === 'DELETE'){
      if (!hasRole(auth, ['admin'])) return bad(res, 403, 'Admin only');
      const body = await readJsonBody(req);
      const userId = String(body.userId || '').trim();
      if (!userId) return bad(res, 400, 'User ID required');
      const { usersPrefix } = repoInfo();
      const id = safeId(userId);
      await deleteJson(usersPrefix, id, `Delete user ${userId}`);
      return ok(res, { ok:true });
    }

    return bad(res, 405, 'Method not allowed');

  } catch (e){
    return json(res, 500, { error: e.message || String(e), details: e.data || null });
  }
};
