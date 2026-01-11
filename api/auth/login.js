// api/auth/login.js
const { setAuthCookie, json, readJsonBody } = require('../_lib/auth');
const { repoInfo, getJson, putJson, listFolder, safeId } = require('../_lib/github');
const { hashPassword, verifyPassword } = require('../_lib/password');

async function usersEmpty(){
  const { usersPrefix } = repoInfo();
  const files = await listFolder(usersPrefix);
  return !files || files.length === 0;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = await readJsonBody(req);
    const userId = String(body.userId || '').trim();
    const password = String(body.password || '').trim();
    if (!userId || !password) return json(res, 400, { error: 'User ID and Password are required' });

    const { usersPrefix } = repoInfo();
    const id = safeId(userId);
    const record = await getJson(usersPrefix, id);

    // Bootstrap first admin only when users DB is empty
    const bootUser = String(process.env.BOOTSTRAP_ADMIN_USER || '').trim();
    const bootPass = String(process.env.BOOTSTRAP_ADMIN_PASS || '').trim();
    if (!record.exists) {
      const empty = await usersEmpty();
      if (empty && bootUser && bootPass && userId === bootUser && password === bootPass) {
        const now = new Date().toISOString();
        const pw = hashPassword(password);
        const u = { userId, role: 'admin', active: true, password: pw, createdAt: now, updatedAt: now };
        await putJson(usersPrefix, id, u, `Bootstrap admin ${userId}`);
        const auth = { role:'admin', userId, expiresAt: new Date(Date.now()+1000*60*60*12).toISOString() };
        setAuthCookie(res, auth, 60*60*12);
        return json(res, 200, auth);
      }
      return json(res, 403, { error: 'User not found. Ask admin to create your account.' });
    }

    const u = record.json || {};
    if (u.active === false) return json(res, 403, { error: 'User inactive' });
    if (!verifyPassword(password, u.password)) return json(res, 403, { error: 'Invalid credentials' });

    const role = String(u.role || 'viewer').toLowerCase();
    const auth = { role, userId, expiresAt: new Date(Date.now()+1000*60*60*24*7).toISOString() };
    setAuthCookie(res, auth);
    return json(res, 200, auth);

  } catch (e) {
    return json(res, 500, { error: e.message || String(e), details: e.data || null });
  }
};
