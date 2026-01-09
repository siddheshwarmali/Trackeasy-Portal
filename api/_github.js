// api/_github.js - GitHub Contents API helper
const API_BASE = 'https://api.github.com';

function ghHeaders(token) {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'trackwise-dashboard'
  };
}

function toBase64(str){ return Buffer.from(str,'utf8').toString('base64'); }
function fromBase64(b64){ return Buffer.from(b64,'base64').toString('utf8'); }
function encodePath(p){ return String(p||'').split('/').map(encodeURIComponent).join('/'); }

async function getFile({token, owner, repo, path, branch}) {
  const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const r = await fetch(url, { method:'GET', headers: ghHeaders(token) });
  const raw = await r.text();
  if (r.status === 404) return { exists:false, url };
  if (!r.ok) return { error:{ status:r.status, statusText:r.statusText, url, raw: raw.slice(0,500) } };
  const data = JSON.parse(raw);
  const contentB64 = String(data.content||'').split('\n').join('');
  return { exists:true, sha:data.sha, contentB64, url };
}

async function putFile({token, owner, repo, path, branch, message, contentStr, sha}) {
  const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`;
  const body = { message, content: toBase64(contentStr), branch };
  if (sha) body.sha = sha;
  const r = await fetch(url, { method:'PUT', headers: Object.assign({ 'Content-Type':'application/json' }, ghHeaders(token)), body: JSON.stringify(body) });
  const raw = await r.text();
  if (!r.ok) return { error:{ status:r.status, statusText:r.statusText, url, raw: raw.slice(0,500) } };
  const data = JSON.parse(raw);
  return { ok:true, commitUrl: data.commit?.html_url || null, sha: data.content?.sha || null };
}

async function deleteFile({token, owner, repo, path, branch, sha}) {
  const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`;
  const body = { message: `Delete ${path} (${new Date().toISOString()})`, sha, branch };
  const r = await fetch(url, { method:'DELETE', headers: Object.assign({ 'Content-Type':'application/json' }, ghHeaders(token)), body: JSON.stringify(body) });
  const raw = await r.text();
  if (!r.ok) return { error:{ status:r.status, statusText:r.statusText, url, raw: raw.slice(0,500) } };
  let data = {}; try { data = JSON.parse(raw||'{}'); } catch {}
  return { ok:true, commitUrl: data.commit?.html_url || null };
}

module.exports = { getFile, putFile, deleteFile, fromBase64 };
