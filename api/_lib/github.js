
import crypto from 'crypto';

export function getCfg(){
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const path = process.env.GITHUB_DB_PATH || 'db/users.json';
  if(!token || !owner || !repo){
    throw new Error('Missing env vars: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
  }
  return { token, owner, repo, branch, path };
}

export async function readJson(){
  const { token, owner, repo, branch, path } = getCfg();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json'
    }
  });
  if(!r.ok){
    const txt = await r.text();
    throw new Error(`GitHub read failed (${r.status}): ${txt}`);
  }
  const data = await r.json();
  const json = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  return { json, sha: data.sha };
}

export async function writeJson(newJson, sha, message='Update db/users.json'){
  const { token, owner, repo, branch, path } = getCfg();
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const content = Buffer.from(JSON.stringify(newJson, null, 2), 'utf8').toString('base64');

  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message,
      content,
      sha,
      branch
    })
  });
  if(!r.ok){
    const txt = await r.text();
    throw new Error(`GitHub write failed (${r.status}): ${txt}`);
  }
  return r.json();
}

export function uuid(){
  return crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.randomBytes(1)[0]&15>>c/4).toString(16));
}
