const { getFile, putFile, deleteFile, listDir } = require('../lib/github');
const { parseCookies, verifyToken } = require('../lib/auth');

const DIR = process.env.GITHUB_DASH_DIR || 'data/dashboards';
const INDEX_PATH = process.env.GITHUB_DASH_INDEX || 'data/dashboards/index.json';

function json(res, code, data) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function safeId(id) {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function canWrite(role) {
  return role === 'admin' || role === 'creator';
}

function requireAuth(req) {
  const cookies = parseCookies(req);
  const payload = verifyToken(cookies.tw_session);
  if (!payload) throw new Error('Unauthenticated');
  return payload;
}

async function readIndex() {
  const file = await getFile(INDEX_PATH);
  if (!file) return { sha: null, index: { dashboards: {} } };
  try {
    const obj = JSON.parse(file.text || '{}');
    if (!obj.dashboards) obj.dashboards = {};
    return { sha: file.sha, index: obj };
  } catch {
    return { sha: file.sha, index: { dashboards: {} } };
  }
}

async function writeIndex(index, sha, message) {
  const text = JSON.stringify(index, null, 2);
  await putFile(INDEX_PATH, text, message || 'Update dashboards index', sha);
}

async function rebuildIndexIfNeeded() {
  // Build names by reading each dashboard JSON once.
  const items = await listDir(DIR);
  const dashboards = {};
  for (const i of items) {
    if (i.type !== 'file' || !i.name.endsWith('.json') || i.name === 'index.json') continue;
    const id = i.name.replace(/\.json$/, '');
    const file = await getFile(`${DIR}/${i.name}`);
    let name = id;
    let updatedAt = new Date().toISOString();
    try {
      const st = JSON.parse(file?.text || '{}');
      name = st?.__meta?.name || name;
      updatedAt = st?.__meta?.updatedAt || st?.updatedAt || updatedAt;
    } catch {}
    dashboards[id] = { id, name, updatedAt };
  }
  const { sha } = await readIndex();
  await writeIndex({ dashboards }, sha, 'Rebuild dashboards index');
  return dashboards;
}

module.exports = async (req, res) => {
  try {
    const me = requireAuth(req);

    // LIST
    if (req.method === 'GET' && req.query && req.query.list === '1') {
      let { index } = await readIndex();
      // If index empty, rebuild
      if (!index || !index.dashboards || Object.keys(index.dashboards).length === 0) {
        const dashboards = await rebuildIndexIfNeeded();
        return json(res, 200, { dashboards: Object.values(dashboards) });
      }
      return json(res, 200, { dashboards: Object.values(index.dashboards) });
    }

    const dash = safeId(req.query?.dash);
    if (!dash) return json(res, 400, { error: 'Missing dash' });

    const path = `${DIR}/${dash}.json`;

    // GET ONE
    if (req.method === 'GET') {
      const file = await getFile(path);
      if (!file) return json(res, 404, { error: 'Not found' });
      let state = {};
      try {
        state = JSON.parse(file.text || '{}');
      } catch {
        state = {};
      }
      return json(res, 200, { id: dash, state });
    }

    // DELETE
    if (req.method === 'DELETE') {
      if (!canWrite(me.role)) return json(res, 403, { error: 'Forbidden' });
      const file = await getFile(path);
      if (!file) return json(res, 404, { error: 'Not found' });
      await deleteFile(path, file.sha, `Delete workspace ${dash}`);

      // Update index
      const { sha, index } = await readIndex();
      if (index?.dashboards) delete index.dashboards[dash];
      await writeIndex(index, sha, `Remove workspace ${dash} from index`);

      return json(res, 200, { ok: true });
    }

    // SAVE (including rename)
    if (req.method === 'POST') {
      if (!canWrite(me.role)) return json(res, 403, { error: 'Forbidden' });

      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const state = payload.state || payload;
          const name = payload.name || state?.__meta?.name || dash;

          // persist file
          const existing = await getFile(path);
          const text = JSON.stringify(state, null, 2);
          await putFile(path, text, `Save workspace ${dash}`, existing?.sha);

          // update index so renamed dashboards show up across devices
          const { sha, index } = await readIndex();
          if (!index.dashboards) index.dashboards = {};
          index.dashboards[dash] = {
            id: dash,
            name,
            updatedAt: new Date().toISOString(),
          };
          await writeIndex(index, sha, `Update workspace meta ${dash}`);

          return json(res, 200, { ok: true, id: dash });
        } catch (e) {
          return json(res, 500, { error: e.message });
        }
      });
      return;
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    const msg = e.message || 'Error';
    const code = msg === 'Unauthenticated' ? 401 : 500;
    return json(res, code, { error: msg });
  }
};
