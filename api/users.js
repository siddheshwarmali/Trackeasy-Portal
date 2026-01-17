
import { parseCookies, verifySession } from './_lib/auth.js';
import { loadUsers, saveUsers } from './_lib/users.js';
import { pbkdf2Hash } from './_lib/auth.js';
import { nowIso } from './_lib/github.js';

function requireAuth(req) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw Object.assign(new Error('Missing env var: AUTH_SECRET'), { status: 500 });
  const token = parseCookies(req).session;
  if (!token) throw Object.assign(new Error('Not authenticated'), { status: 401 });
  const payload = verifySession(token, secret);
  if (!payload) throw Object.assign(new Error('Invalid session'), { status: 401 });
  return payload;
}

function requireAdmin(payload) {
  if ((payload.role || 'viewer') !== 'admin') throw Object.assign(new Error('Forbidden: Admin only'), { status: 403 });
}

export default async function handler(req, res) {
  try {
    const me = requireAuth(req);
    requireAdmin(me);

    const method = req.method;

    if (method === 'GET') {
      const { users } = await loadUsers();
      return res.status(200).json({
        users: users.map(u => ({ userId: u.userId, role: u.role || 'viewer', updatedAt: u.updatedAt || u.createdAt || '' }))
      });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    if (method === 'POST') {
      const userId = String(body?.userId || '').trim();
      const password = String(body?.password || '');
      const role = String(body?.role || 'viewer').trim();
      if (!userId) return res.status(400).json({ error: 'User ID is required' });
      if (!password) return res.status(400).json({ error: 'Password is required' });
      if (!['viewer','creator','admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

      const { users, sha } = await loadUsers();
      const now = nowIso();
      const idx = users.findIndex(u => String(u.userId).toLowerCase() === userId.toLowerCase());
      const rec = { userId, role, passwordHash: pbkdf2Hash(password), updatedAt: now };
      if (idx >= 0) {
        users[idx] = { ...users[idx], ...rec };
      } else {
        users.push({ ...rec, createdAt: now });
      }
      await saveUsers(users, sha, `Upsert user ${userId}`);
      return res.status(200).json({ ok: true });
    }

    if (method === 'PUT') {
      const userId = String(body?.userId || '').trim();
      const role = body?.role != null ? String(body.role).trim() : null;
      const password = body?.password != null ? String(body.password) : null;
      if (!userId) return res.status(400).json({ error: 'User ID is required' });

      const { users, sha } = await loadUsers();
      const idx = users.findIndex(u => String(u.userId).toLowerCase() === userId.toLowerCase());
      if (idx < 0) return res.status(404).json({ error: 'User not found' });

      const now = nowIso();
      if (role) {
        if (!['viewer','creator','admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
        users[idx].role = role;
      }
      if (password) users[idx].passwordHash = pbkdf2Hash(password);
      users[idx].updatedAt = now;

      await saveUsers(users, sha, `Update user ${userId}`);
      return res.status(200).json({ ok: true });
    }

    if (method === 'DELETE') {
      const userId = String(body?.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'User ID is required' });

      const { users, sha } = await loadUsers();
      const before = users.length;
      const next = users.filter(u => String(u.userId).toLowerCase() !== userId.toLowerCase());
      if (next.length === before) return res.status(404).json({ error: 'User not found' });

      await saveUsers(next, sha, `Delete user ${userId}`);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', ['GET','POST','PUT','DELETE']);
    return res.status(405).send('Method Not Allowed');

  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || String(e) });
  }
}
