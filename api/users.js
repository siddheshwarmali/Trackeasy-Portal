const { getFile, putFile } = require('../lib/github');
const { parseCookies, verifyToken, hashPassword } = require('../lib/auth');

const USERS_PATH = process.env.GITHUB_USERS_FILE || 'data/users.json';

function json(res, code, data) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function requireAdmin(req) {
  const cookies = parseCookies(req);
  const payload = verifyToken(cookies.tw_session);
  if (!payload) throw new Error('Unauthenticated');
  if (payload.role !== 'admin') throw new Error('Forbidden');
  return payload;
}

async function readUsers() {
  const file = await getFile(USERS_PATH);
  let users = [];
  let sha = file?.sha;
  if (file?.text) {
    try {
      users = JSON.parse(file.text).users || [];
    } catch {
      users = [];
    }
  }
  return { users, sha };
}

module.exports = async (req, res) => {
  try {
    await requireAdmin(req);

    if (req.method === 'GET') {
      const { users } = await readUsers();
      return json(res, 200, {
        users: users.map((u) => ({ userId: u.userId, role: u.role, updatedAt: u.updatedAt })),
      });
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const { users, sha } = await readUsers();

        if (req.method === 'POST') {
          const { userId, password, role } = data;
          if (!userId || !password) return json(res, 400, { error: 'userId/password required' });

          const idx = users.findIndex((u) => u.userId === userId);
          const rec = {
            userId,
            role: role || 'viewer',
            passwordHash: hashPassword(password),
            updatedAt: new Date().toISOString(),
          };

          if (idx >= 0) users[idx] = { ...users[idx], ...rec };
          else users.push(rec);

          await putFile(USERS_PATH, JSON.stringify({ users }, null, 2), 'Upsert user', sha);
          return json(res, 200, { ok: true });
        }

        if (req.method === 'PUT') {
          const { userId, role, password } = data;
          if (!userId) return json(res, 400, { error: 'userId required' });

          const idx = users.findIndex((u) => u.userId === userId);
          if (idx < 0) return json(res, 404, { error: 'User not found' });

          if (role) users[idx].role = role;
          if (password) users[idx].passwordHash = hashPassword(password);
          users[idx].updatedAt = new Date().toISOString();

          await putFile(USERS_PATH, JSON.stringify({ users }, null, 2), 'Update user', sha);
          return json(res, 200, { ok: true });
        }

        if (req.method === 'DELETE') {
          const { userId } = data;
          if (!userId) return json(res, 400, { error: 'userId required' });

          const next = users.filter((u) => u.userId !== userId);
          await putFile(USERS_PATH, JSON.stringify({ users: next }, null, 2), 'Delete user', sha);
          return json(res, 200, { ok: true });
        }

        return json(res, 405, { error: 'Method not allowed' });
      } catch (e) {
        return json(res, 500, { error: e.message });
      }
    });
  } catch (e) {
    const msg = e.message || 'Error';
    const code = msg === 'Forbidden' ? 403 : msg === 'Unauthenticated' ? 401 : 500;
    return json(res, code, { error: msg });
  }
};
