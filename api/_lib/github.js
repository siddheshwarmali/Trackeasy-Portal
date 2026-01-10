// api/_lib/github.js
const GH_API = 'https://api.github.com';

function env(name, fallback = undefined) {
  const v = process.env[name];
  return (v === undefined || v === '') ? fallback : v;
}

function ghHeaders() {
  const token = env('GITHUB_TOKEN');
  if (!token) throw new Error('Missing env: GITHUB_TOKEN');
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'exec-dashboard-vercel',
  };
}

async function ghRequest(path, opts = {}) {
  const url = `${GH_API}${path}`;
  const r = await fetch(url, {
    ...opts,
    headers: { ...ghHeaders(), ...(opts.headers || {}) },
  });
  const raw = await r.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!r.ok) {
    const msg = (data && data.message) ? data.message : raw;
    const err = new Error(`GitHub API ${r.status}: ${msg}`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

function repoInfo() {
  const owner = env('GITHUB_OWNER');
  const repo = env('GITHUB_REPO');
  const branch = env('GITHUB_BRANCH', 'main');
  const prefix = env('GITHUB_DATA_PREFIX', 'data/dashboards');
  if (!owner || !repo) throw new Error('Missing env: GITHUB_OWNER or GITHUB_REPO');
  return { owner, repo, branch, prefix };
}

function filePath(dashId) {
  const { prefix } = repoInfo();
  const safe = String(dashId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${prefix}/${safe}.json`;
}

async function getFile(dashId) {
  const { owner, repo, branch } = repoInfo();
  const path = filePath(dashId);
  try {
    const data = await ghRequest(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`);
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return { exists: true, sha: data.sha, path, json: JSON.parse(content) };
  } catch (e) {
    if (e.status === 404) return { exists: false, sha: null, path, json: null };
    throw e;
  }
}

async function putFile(dashId, json, message = null) {
  const { owner, repo, branch } = repoInfo();
  const { exists, sha, path } = await getFile(dashId);
  const body = {
    message: message || `Update dashboard ${dashId}`,
    content: Buffer.from(JSON.stringify(json, null, 2)).toString('base64'),
    branch,
  };
  if (exists && sha) body.sha = sha;
  return ghRequest(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function deleteFile(dashId, message = null) {
  const { owner, repo, branch } = repoInfo();
  const { exists, sha, path } = await getFile(dashId);
  if (!exists) return { deleted: false };
  const body = { message: message || `Delete dashboard ${dashId}`, sha, branch };
  return ghRequest(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
    { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function listDashboards() {
  const { owner, repo, branch, prefix } = repoInfo();
  // List folder contents
  let items = [];
  try {
    items = await ghRequest(`/repos/${owner}/${repo}/contents/${encodeURIComponent(prefix)}?ref=${encodeURIComponent(branch)}`);
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
  if (!Array.isArray(items)) return [];
  const jsonFiles = items.filter(x => x.type === 'file' && String(x.name || '').endsWith('.json'));

  // Get last commit date per file (best-effort)
  const out = [];
  for (const f of jsonFiles) {
    let updatedAt = null;
    try {
      const commits = await ghRequest(`/repos/${owner}/${repo}/commits?path=${encodeURIComponent(f.path)}&per_page=1&sha=${encodeURIComponent(branch)}`);
      updatedAt = commits && commits[0] && commits[0].commit && commits[0].commit.committer && commits[0].commit.committer.date;
    } catch { /* ignore */ }
    const id = String(f.name).replace(/\.json$/, '');
    out.push({ id, name: id, updatedAt, createdAt: updatedAt });
  }
  return out;
}

module.exports = {
  repoInfo,
  getFile,
  putFile,
  deleteFile,
  listDashboards,
};
