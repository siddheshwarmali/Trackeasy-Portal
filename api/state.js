
import { parseCookies, verifySession } from './_lib/auth.js';
import { readJson, writeJson, nowIso, uuid } from './_lib/github.js';

const STATE_PATH = process.env.GITHUB_STATE_PATH || 'data/dashboards.json';

function requireAuth(req) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw Object.assign(new Error('Missing env var: AUTH_SECRET'), { status: 500 });
  const token = parseCookies(req).session;
  if (!token) throw Object.assign(new Error('Not authenticated'), { status: 401 });
  const payload = verifySession(token, secret);
  if (!payload) throw Object.assign(new Error('Invalid session'), { status: 401 });
  return payload;
}

function canWrite(role) {
  return role === 'admin' || role === 'creator';
}

export default async function handler(req, res) {
  try {
    const me = requireAuth(req);
    const role = me.role || 'viewer';

    const listFlag = req.query?.list;
    const dashId = req.query?.dash;

    const { json, sha } = await readJson(STATE_PATH, { dashboards: {} });
    const store = (json && typeof json === 'object') ? json : { dashboards: {} };
    if (!store.dashboards || typeof store.dashboards !== 'object') store.dashboards = {};

    if (req.method === 'GET') {
      if (listFlag) {
        const dashboards = Object.values(store.dashboards).map(d => ({
          id: d.id,
          name: d.name || d.id,
          createdAt: d.createdAt || d.updatedAt || '',
          updatedAt: d.updatedAt || ''
        })).sort((a,b) => (b.updatedAt||'').localeCompare(a.updatedAt||''));
        return res.status(200).json({ dashboards });
      }

      if (!dashId) return res.status(400).json({ error: 'dash is required' });
      const d = store.dashboards[dashId];
      if (!d) return res.status(200).json({ id: dashId, state: null, name: dashId });
      return res.status(200).json({ id: d.id, name: d.name || d.id, state: d.state || null, createdAt: d.createdAt, updatedAt: d.updatedAt });
    }

    if (req.method === 'POST') {
      if (!canWrite(role)) return res.status(403).json({ error: 'Forbidden: creator/admin only' });
      if (!dashId) return res.status(400).json({ error: 'dash is required' });

      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const state = body?.state;
      const nameFromBody = body?.name;
      const now = nowIso();

      const prev = store.dashboards[dashId];
      const createdAt = prev?.createdAt || now;
      const name = nameFromBody || (state && state.__meta && state.__meta.name) || prev?.name || dashId;

      store.dashboards[dashId] = {
        id: dashId,
        name,
        createdAt,
        updatedAt: now,
        state: state || null
      };

      await writeJson(STATE_PATH, store, sha, `Save dashboard ${dashId}`);
      return res.status(200).json({ ok: true, id: dashId, updatedAt: now });
    }

    if (req.method === 'DELETE') {
      if (!canWrite(role)) return res.status(403).json({ error: 'Forbidden: creator/admin only' });
      if (!dashId) return res.status(400).json({ error: 'dash is required' });
      if (store.dashboards[dashId]) delete store.dashboards[dashId];
      await writeJson(STATE_PATH, store, sha, `Delete dashboard ${dashId}`);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', ['GET','POST','DELETE']);
    return res.status(405).send('Method Not Allowed');

  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || String(e) });
  }
}
