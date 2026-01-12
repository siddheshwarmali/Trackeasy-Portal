
const { verify, parseCookies, json, readJson } = require('./_lib/auth');

const DEFAULT_DIR = 'data/dashboards';
const INDEX_FILE = '_index.json';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function ghHeaders() {
  const token = requireEnv('GITHUB_TOKEN');
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function ghBase() {
  const owner = requireEnv('GITHUB_OWNER');
  const repo = requireEnv('GITHUB_REPO');
  return { owner, repo };
}

function ghBranch() {
  return process.env.GITHUB_BRANCH || 'main';
}

function ghDir() {
  return (process.env.GITHUB_DASHBOARD_DIR || DEFAULT_DIR).replace(/^\/+|\/+$/g,'');
}

function b64(s) {
  return Buffer.from(s, 'utf8').toString('base64');
}

async function ghGetContent(path) {
  const { owner, repo } = ghBase();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ghBranch())}`;
  const r = await fetch(url, { headers: ghHeaders() });
  if (r.status === 404) return null;
  const data = await r.json();
  if (!r.ok) {
    const msg = data && data.message ? data.message : `GitHub GET failed (${r.status})`;
    throw new Error(msg);
  }
  return data;
}

async function ghPutFile(path, contentText, message) {
  const { owner, repo } = ghBase();
  const existing = await ghGetContent(path);
  const sha = existing && existing.sha ? existing.sha : undefined;
  const body = {
    message: message || `Update ${path}`,
    content: b64(contentText),
    branch: ghBranch(),
  };
  if (sha) body.sha = sha;

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(path)}`;
  const r = await fetch(url, { method: 'PUT', headers: { ...ghHeaders(), 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) {
    const msg = data && data.message ? data.message : `GitHub PUT failed (${r.status})`;
    throw new Error(msg);
  }
  return data;
}

async function ghDeleteFile(path, message) {
  const { owner, repo } = ghBase();
  const existing = await ghGetContent(path);
  if (!existing || !existing.sha) return { ok: true, skipped: true };

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURI(path)}`;
  const body = { message: message || `Delete ${path}`, sha: existing.sha, branch: ghBranch() };
  const r = await fetch(url, { method: 'DELETE', headers: { ...ghHeaders(), 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) {
    const msg = data && data.message ? data.message : `GitHub DELETE failed (${r.status})`;
    throw new Error(msg);
  }
  return data;
}

async function readJsonFromGithubFile(path) {
  const file = await ghGetContent(path);
  if (!file) return null;
  if (file.type !== 'file' || !file.content) return null;
  const text = Buffer.from(file.content, 'base64').toString('utf8');
  try { return JSON.parse(text); } catch { return null; }
}

function getSession(req) {
  const secret = process.env.AUTH_SECRET || 'dev-secret-change-me';
  const cookies = parseCookies(req);
  return verify(cookies.tw_session, secret);
}

function canWrite(role) {
  return role === 'admin' || role === 'creator';
}

module.exports = async (req, res) => {
  // Auth gate
  const session = getSession(req);
  if (!session) return json(res, 401, { error: 'Not authenticated' });

  const url = new URL(req.url, 'http://localhost');
  const dash = url.searchParams.get('dash');
  const list = url.searchParams.get('list');

  const dir = ghDir();
  const indexPath = `${dir}/${INDEX_FILE}`;

  try {
    // LIST dashboards
    if (req.method === 'GET' && list) {
      // Prefer index if present
      const idx = await readJsonFromGithubFile(indexPath);
      if (idx && Array.isArray(idx.dashboards)) {
        return json(res, 200, { dashboards: idx.dashboards });
      }
      // Fallback: directory listing (names only)
      const listing = await ghGetContent(dir);
      const dashboards = Array.isArray(listing) ? listing
        .filter(x => x.type === 'file' && x.name.endsWith('.json') && x.name !== INDEX_FILE)
        .map(x => ({ id: x.name.replace(/\.json$/,''), name: x.name.replace(/\.json$/,''), createdAt: null, updatedAt: null }))
        : [];
      return json(res, 200, { dashboards });
    }

    // GET one dashboard state
    if (req.method === 'GET' && dash) {
      const data = await readJsonFromGithubFile(`${dir}/${dash}.json`);
      if (!data) return json(res, 404, { error: 'Dashboard not found' });
      return json(res, 200, { id: dash, state: data });
    }

    // SAVE one dashboard state
    if (req.method === 'POST' && dash) {
      if (!canWrite(session.role)) return json(res, 403, { error: 'Forbidden' });
      let body = {};
      try { body = await readJson(req); } catch (e) { return json(res, 400, { error: e.message }); }
      const state = body && body.state ? body.state : null;
      if (!state) return json(res, 400, { error: 'Missing body.state' });

      // Ensure meta
      const now = new Date().toISOString();
      const name = (state && state.__meta && state.__meta.name) ? state.__meta.name : dash;
      state.__meta = { ...(state.__meta || {}), id: dash, name, updatedAt: now, savedBy: session.email || session.userId || 'unknown' };

      await ghPutFile(`${dir}/${dash}.json`, JSON.stringify(state, null, 2), `Save dashboard ${dash}`);

      // Update index
      const idx = (await readJsonFromGithubFile(indexPath)) || { dashboards: [] };
      const arr = Array.isArray(idx.dashboards) ? idx.dashboards : [];
      const existing = arr.find(d => d.id === dash);
      if (existing) {
        existing.name = name;
        existing.updatedAt = now;
      } else {
        arr.push({ id: dash, name, createdAt: now, updatedAt: now });
      }
      idx.dashboards = arr;
      await ghPutFile(indexPath, JSON.stringify(idx, null, 2), `Update dashboard index`);

      return json(res, 200, { ok: true, id: dash });
    }

    // DELETE dashboard
    if (req.method === 'DELETE' && dash) {
      if (!canWrite(session.role)) return json(res, 403, { error: 'Forbidden' });
      await ghDeleteFile(`${dir}/${dash}.json`, `Delete dashboard ${dash}`);
      // Update index
      const idx = (await readJsonFromGithubFile(indexPath)) || { dashboards: [] };
      idx.dashboards = (Array.isArray(idx.dashboards) ? idx.dashboards : []).filter(d => d.id !== dash);
      await ghPutFile(indexPath, JSON.stringify(idx, null, 2), `Update dashboard index`);
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'Unsupported operation' });

  } catch (e) {
    return json(res, 500, { error: e.message || String(e) });
  }
};
