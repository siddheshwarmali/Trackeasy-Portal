const { getFile, putFile } = require('../../lib/github');
const { setCookie, makeToken, hashPassword, verifyPassword } = require('../../lib/auth');

const USERS_PATH = process.env.GITHUB_USERS_FILE || 'data/users.json';

function json(res, code, data) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function ensureBootstrapAdmin() {
  const existing = await getFile(USERS_PATH);
  let users = [];
  if (existing?.text) {
    try {
      users = JSON.parse(existing.text).users || [];
    } catch {
      users = [];
    }
  }

  const adminUser = process.env.BOOTSTRAP_ADMIN_USER;
  const adminPass = process.env.BOOTSTRAP_ADMIN_PASS;

  if (adminUser && adminPass) {
    const found = users.find((u) => u.userId === adminUser);
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
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  await ensureBootstrapAdmin();

  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', async () => {
    try {
      const { userId, password } = JSON.parse(body || '{}');
      if (!userId || !password) return json(res, 400, { error: 'Missing userId/password' });

      const file = await getFile(USERS_PATH);
      const users = file?.text ? JSON.parse(file.text).users || [] : [];
      const user = users.find((u) => u.userId === userId);
      if (!user) return json(res, 401, { error: 'Invalid credentials' });

      if (!verifyPassword(password, user.passwordHash)) {
        return json(res, 401, { error: 'Invalid credentials' });
      }

      const token = makeToken({ userId: user.userId, role: user.role });
      setCookie(res, token);
      return json(res, 200, { ok: true, userId: user.userId, role: user.role });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  });
};
