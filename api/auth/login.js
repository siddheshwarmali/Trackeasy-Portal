// api/auth/login.js
// Email login backed by GitHub DB users. Multiple admins supported via users role.
const { setAuthCookie, json, readJsonBody } = require('../_lib/auth');
const { repoInfo, getJson, putJson, listFolder, safeId } = require('../_lib/github');

function parseList(v){
  return String(v || '').split(/[,
\s]+/).map(s=>s.trim().toLowerCase()).filter(Boolean);
}

async function usersEmpty(){
  const { usersPrefix } = repoInfo();
  const files = await listFolder(usersPrefix);
  return !files || files.length === 0;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return json(res, 400, { error: 'Email is required' });

    const { usersPrefix } = repoInfo();
    const id = safeId(email);
    const record = await getJson(usersPrefix, id);

    // Bootstrap: allow initial admins via env BOOTSTRAP_ADMINS when users DB is empty
    const bootstrapAdmins = parseList(process.env.BOOTSTRAP_ADMINS);
    if (!record.exists) {
      const empty = await usersEmpty();
      if (empty && bootstrapAdmins.includes(email)) {
        const u = { email, role: 'admin', active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await putJson(usersPrefix, id, u, `Bootstrap admin ${email}`);
        const auth = { role:'admin', email, expiresAt: new Date(Date.now()+1000*60*60*24*7).toISOString() };
        setAuthCookie(res, auth);
        return json(res, 200, auth);
      }
      return json(res, 403, { error: 'User not found. Ask admin to add you.' });
    }

    const u = record.json || {};
    if (u.active === false) return json(res, 403, { error: 'User inactive' });
    const role = String(u.role || 'viewer').toLowerCase();

    const auth = { role, email, expiresAt: new Date(Date.now()+1000*60*60*24*7).toISOString() };
    setAuthCookie(res, auth);
    return json(res, 200, auth);

  } catch (e){
    return json(res, 500, { error: e.message || String(e), details: e.data || null });
  }
};
