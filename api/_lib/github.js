// api/_lib/github.js
const { request } = require('./http');
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
  const r = await request(url, {
    method: opts.method || 'GET',
    headers: { ...ghHeaders(), ...(opts.headers || {}) },
    body: opts.body || null,
  });

  const raw = r.text || '';
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
  const dashPrefix = env('GITHUB_DATA_PREFIX', 'data/dashboards');
  const usersPrefix = env('GITHUB_USERS_PREFIX', 'data/users');
  if (!owner || !repo) throw new Error('Missing env: GITHUB_OWNER or GITHUB_REPO');
  return { owner, repo, branch, dashPrefix, usersPrefix };
}

function safeId(id) {
  return String(id || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_');
}

function pathFor(prefix, id) {
  const safe = safeId(id || 'default');
  return `${prefix}/${safe}.json`;
}

async function getJson(prefix, id) {
  const { owner, repo, branch } = repoInfo();
  const path = pathFor(prefix, id);
  try {
    const data = await ghRequest(`/repos/${owner}/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`);
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return { exists: true, sha: data.sha, path, json: JSON.parse(content) };
  } catch (e) {
    if (e.status === 404) return { exists: false, sha: null, path, json: null };
    throw e;
  }
}

async function putJson(prefix, id, obj, message = null) {
  const { owner, repo, branch } = repoInfo();
  const { exists, sha, path } = await getJson(prefix, id);
  const body = {
    message: message || `Update ${id}`,
    content: Buffer.from(JSON.stringify(obj, null, 2)).toString('base64'),
    branch,
  };
  if (exists && sha) body.sha = sha;
  return ghRequest(`/repos/${owner}/${repo}/contents/${encodeURI(path)}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function deleteJson(prefix, id, message = null) {
  const { owner, repo, branch } = repoInfo();
  const { exists, sha, path } = await getJson(prefix, id);
  if (!exists) return { deleted: false };
  const body = { message: message || `Delete ${id}`, sha, branch };
  return ghRequest(`/repos/${owner}/${repo}/contents/${encodeURI(path)}`,
    { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function listFolder(prefix) {
  const { owner, repo, branch } = repoInfo();
  let items = [];
  try {
    items = await ghRequest(`/repos/${owner}/${repo}/contents/${encodeURI(prefix)}?ref=${encodeURIComponent(branch)}`);
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
  if (!Array.isArray(items)) return [];
  return items.filter(x => x.type === 'file' && String(x.name || '').endsWith('.json'));
}

module.exports = { repoInfo, safeId, getJson, putJson, deleteJson, listFolder };
