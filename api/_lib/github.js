
import crypto from 'crypto';

export function cfg() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token || !owner || !repo) {
    throw new Error('Missing env vars: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
  }
  return { token, owner, repo, branch };
}

async function ghFetch(url, options={}) {
  const { token } = cfg();
  const r = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/vnd.github+json',
      ...(options.headers || {}),
      'Authorization': `Bearer ${token}`,
    }
  });
  return r;
}

export async function readFile(path) {
  const { owner, repo, branch } = cfg();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const r = await ghFetch(url);
  if (r.status === 404) return { exists: false, sha: null, content: null };
  const txt = await r.text();
  if (!r.ok) throw new Error(`GitHub read failed (${r.status}): ${txt}`);
  const data = JSON.parse(txt);
  const content = data.content ? Buffer.from(data.content, 'base64').toString('utf8') : '';
  return { exists: true, sha: data.sha, content };
}

export async function readJson(path, fallback) {
  const f = await readFile(path);
  if (!f.exists || !f.content) return { json: fallback, sha: f.sha, exists: f.exists };
  try {
    return { json: JSON.parse(f.content), sha: f.sha, exists: f.exists };
  } catch {
    return { json: fallback, sha: f.sha, exists: f.exists };
  }
}

export async function writeJson(path, obj, sha, message='Update data') {
  const { owner, repo, branch } = cfg();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const content = Buffer.from(JSON.stringify(obj, null, 2), 'utf8').toString('base64');
  const body = {
    message,
    content,
    branch
  };
  if (sha) body.sha = sha;

  const r = await ghFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`GitHub write failed (${r.status}): ${txt}`);
  return JSON.parse(txt);
}

export function nowIso() {
  return new Date().toISOString();
}

export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.randomBytes(1)[0]&15>>c/4).toString(16));
}
