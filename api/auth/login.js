const { getFile, putFile } = require('../../lib/github');
const { setCookie, makeToken, hashPassword, verifyPassword } = require('../../lib/auth');
const { readJsonBody, sendJson } = require('../../lib/http');

const USERS_PATH = process.env.GITHUB_USERS_FILE || 'data/users.json';

async function ensureBootstrapAdmin() {
  const existing = await getFile(USERS_PATH);
  let users = [];
  if (existing?.text) {
    try { users = JSON.parse(existing.text).users || []; } catch { users = []; }
  }

  const adminUser = process.env.BOOTSTRAP_ADMIN_USER;
  const adminPass = process.env.BOOTSTRAP_ADMIN_PASS;

  if (adminUser && adminPass) {
    const found = users.find(u => u.userId === adminUser);
    if (!found) {
      users.push({
        userId: adminUser,
        role: 'admin',
        passwordHash: hashPassword(adminPass),
        updatedAt: new Date().toISOString(),
      });
      await putFile(USERS_PATH, JSON.stringify({ users }, null, 2), 'Bootstrap admin user', existing?.sha);
    }
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

    // If serverless is reachable but env vars are missing, return clear error (no crash page)
    if (!process.env.AUTH_SECRET) return sendJson(res, 500, { error: 'Missing AUTH_SECRET (set in Vercel env vars)' });
    if (!process.env.GITHUB_TOKEN) return sendJson(res, 500, { error: 'Missing GITHUB_TOKEN (set in Vercel env vars)' });
    if (!process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) return sendJson(res, 500, { error: 'Missing GITHUB_OWNER / GITHUB_REPO (set in Vercel env vars)' });

    await ensureBootstrapAdmin();

    const body = await readJsonBody(req);
    const userId = (body.userId || '').trim();
    const password = body.password || '';

    if (!userId || !password) return sendJson(res, 400, { error: 'Missing userId/password' });

    const file = await getFile(USERS_PATH);
    const users = file?.text ? (JSON.parse(file.text).users || []) : [];
    const user = users.find(u => u.userId === userId);
    if (!user) return sendJson(res, 401, { error: 'Invalid credentials' });
    if (!verifyPassword(password, user.passwordHash)) return sendJson(res, 401, { error: 'Invalid credentials' });

    const token = makeToken({ userId: user.userId, role: user.role });
    setCookie(res, token);
    return sendJson(res, 200, { ok: true, userId: user.userId, role: user.role });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
