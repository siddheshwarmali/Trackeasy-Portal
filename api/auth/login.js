
import { signSession } from '../_lib/auth.js';
import { verifyHash } from '../_lib/auth.js';
import { setCookie } from '../_lib/auth.js';
import { loadUsers, ensureBootstrapAdmin } from '../_lib/users.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).send('Method Not Allowed');
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) return res.status(500).json({ error: 'Missing env var: AUTH_SECRET' });

  try {
    await ensureBootstrapAdmin();

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const userId = String(body?.userId || '').trim();
    const password = String(body?.password || '');
    if (!userId || !password) return res.status(400).json({ error: 'User ID and password are required' });

    const { users } = await loadUsers();
    const u = users.find(x => String(x.userId).toLowerCase() === userId.toLowerCase());
    if (!u || !u.passwordHash || !verifyHash(password, u.passwordHash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signSession({ userId: u.userId, role: u.role || 'viewer' }, secret);
    setCookie(req, res, 'session', token, { maxAge: 60*60*12, httpOnly: true, sameSite: 'Lax' });
    return res.status(200).json({ ok: true });

  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
