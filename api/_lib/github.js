const API = 'https://api.github.com';

function b64encode(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}
function b64decode(b64) {
  return Buffer.from(b64, 'base64').toString('utf8');
}

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Missing GITHUB_TOKEN');
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'vercel-github-db',
  };
}

function repoBase() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!owner || !repo) throw new Error('Missing GITHUB_OWNER/GITHUB_REPO');
  return { owner, repo, branch };
}

async function ghFetch(path, opt = {}) {
  const res = await fetch(path, { ...opt, headers: { ...ghHeaders(), ...(opt.headers || {}) } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: text }; }
  if (!res.ok) throw new Error(json.message || json.error || `GitHub API HTTP ${res.status}`);
  return json;
}

async function getFile(filePath) {
  const { owner, repo, branch } = repoBase();
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`;
  try {
    const data = await ghFetch(url, { method: 'GET' });
    const content = data.content ? b64decode(String(data.content).replace(/
/g, '')) : '';
    return { text: content, sha: data.sha };
  } catch (e) {
    if (String(e.message).includes('Not Found')) return null;
    throw e;
  }
}

async function putFile(filePath, text, message, sha) {
  const { owner, repo, branch } = repoBase();
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;
  const body = { message: message || `Update ${filePath}`, content: b64encode(text), branch };
  if (sha) body.sha = sha;
  return await ghFetch(url, { method: 'PUT', body: JSON.stringify(body) });
}

async function deleteFile(filePath, sha, message) {
  const { owner, repo, branch } = repoBase();
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;
  const body = { message: message || `Delete ${filePath}`, sha, branch };
  return await ghFetch(url, { method: 'DELETE', body: JSON.stringify(body) });
}

async function listDir(dirPath) {
  const { owner, repo, branch } = repoBase();
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(dirPath)}?ref=${encodeURIComponent(branch)}`;
  const data = await ghFetch(url, { method: 'GET' });
  return Array.isArray(data) ? data : [];
}

module.exports = { getFile, putFile, deleteFile, listDir };
