
// Netlify Function: /.netlify/functions/state
// Shared dashboard state persisted in a GitHub repository file.
// Uses GitHub REST "repository contents" endpoint (Get contents + Create/Update file).
//
// Netlify Environment variables required:
//   GITHUB_TOKEN  = fine-grained PAT with Contents: Read and write
//   GITHUB_OWNER  = repo owner/org
//   GITHUB_REPO   = repo name
//   GITHUB_PATH   = file path in repo, e.g. data/dashboard_state.json
// Optional:
//   GITHUB_BRANCH = main

const API_BASE = 'https://api.github.com';

function env(name, fallback=null) {
  return process.env[name] || fallback;
}

function must(name) {
  const v = env(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function toBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function fromBase64(b64) {
  return Buffer.from(b64, 'base64').toString('utf8');
}

function ghHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function ghGetFile({ token, owner, repo, path, branch }) {
  const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const r = await fetch(url, { method: 'GET', headers: ghHeaders(token) });
  if (r.status === 404) return { exists: false };
  const raw = await r.text();
  if (!r.ok) throw new Error(`GitHub GET failed ${r.status}: ${raw}`);
  const data = JSON.parse(raw);
  const contentB64 = (data.content || '').replace(/
/g, '');
  return { exists: true, sha: data.sha, contentB64 };
}

async function ghPutFile({ token, owner, repo, path, branch, message, contentStr, sha }) {
  const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
  const body = { message, content: toBase64(contentStr), branch };
  if (sha) body.sha = sha;

  const r = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(`GitHub PUT failed ${r.status}: ${raw}`);
  const data = JSON.parse(raw);
  return { commitUrl: data.commit?.html_url || null, newSha: data.content?.sha || null };
}

export default async (request, context) => {
  try {
    const token  = must('GITHUB_TOKEN');
    const owner  = must('GITHUB_OWNER');
    const repo   = must('GITHUB_REPO');
    const filePath = must('GITHUB_PATH');
    const branch = env('GITHUB_BRANCH', 'main');

    if (request.method === 'GET') {
      const file = await ghGetFile({ token, owner, repo, path: filePath, branch });
      if (!file.exists) return Response.json({ state: null, exists: false });
      let state = null;
      try {
        state = JSON.parse(fromBase64(file.contentB64));
      } catch {
        state = null;
      }
      return Response.json({ state, exists: true });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const state = body?.state ?? null;

      const file = await ghGetFile({ token, owner, repo, path: filePath, branch });
      const contentStr = JSON.stringify(state ?? null, null, 2);

      const res = await ghPutFile({
        token, owner, repo, path: filePath, branch,
        message: `Update dashboard state (${new Date().toISOString()})`,
        contentStr,
        sha: file.exists ? file.sha : undefined
      });

      return Response.json({ ok: true, commitUrl: res.commitUrl });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
};
