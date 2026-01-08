
/**
 * Netlify Function: /.netlify/functions/state
 * GitHub-backed shared state store.
 *
 * REQUIRED Netlify environment variables:
 *   GITHUB_TOKEN  (fine-grained PAT with Contents: Read and write)
 *   GITHUB_OWNER
 *   GITHUB_REPO
 *   GITHUB_PATH   (e.g. data/dashboard_state.json)
 * OPTIONAL:
 *   GITHUB_BRANCH (default: main)
 */

const API_BASE = 'https://api.github.com';

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}

function missingEnv() {
  const required = ['GITHUB_TOKEN','GITHUB_OWNER','GITHUB_REPO','GITHUB_PATH'];
  return required.filter((k) => !process.env[k]);
}

function toBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function fromBase64(b64) {
  return Buffer.from(b64, 'base64').toString('utf8');
}

function ghHeaders(token) {
  return {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function ghGetFile(token, owner, repo, path, branch) {
  const url = API_BASE + '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/contents/' + path + '?ref=' + encodeURIComponent(branch);
  const r = await fetch(url, { method: 'GET', headers: ghHeaders(token) });

  if (r.status === 404) {
    return { exists: false };
  }

  const raw = await r.text();
  if (!r.ok) {
    return { error: { stage: 'github_get', status: r.status, statusText: r.statusText, url, raw } };
  }

  let data;
  try { data = JSON.parse(raw); } catch (e) {
    return { error: { stage: 'github_get_parse', url, raw, message: e.message } };
  }

  // GitHub returns base64 with newlines sometimes
  const contentB64 = String(data.content || '').split('
').join('');

  return { exists: true, sha: data.sha, contentB64 };
}

async function ghPutFile(token, owner, repo, path, branch, message, contentStr, sha) {
  const url = API_BASE + '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/contents/' + path;
  const body = {
    message: message,
    content: toBase64(contentStr),
    branch: branch
  };
  if (sha) body.sha = sha;

  const r = await fetch(url, {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders(token)),
    body: JSON.stringify(body)
  });

  const raw = await r.text();
  if (!r.ok) {
    return { error: { stage: 'github_put', status: r.status, statusText: r.statusText, url, raw } };
  }

  let data;
  try { data = JSON.parse(raw); } catch (e) {
    return { error: { stage: 'github_put_parse', url, raw, message: e.message } };
  }

  return { ok: true, commitUrl: data.commit && data.commit.html_url ? data.commit.html_url : null };
}

exports.handler = async function(event, context) {
  const missing = missingEnv();
  if (missing.length) {
    return jsonResponse(500, { error: 'Missing Netlify environment variables', missing });
  }

  const token  = process.env.GITHUB_TOKEN;
  const owner  = process.env.GITHUB_OWNER;
  const repo   = process.env.GITHUB_REPO;
  const filePath = process.env.GITHUB_PATH;
  const branch = process.env.GITHUB_BRANCH || 'main';

  try {
    if (event.httpMethod === 'GET') {
      const file = await ghGetFile(token, owner, repo, filePath, branch);
      if (file && file.error) return jsonResponse(502, { error: 'GitHub GET error', details: file.error });
      if (!file.exists) return jsonResponse(200, { state: null, exists: false });

      try {
        const state = JSON.parse(fromBase64(file.contentB64));
        return jsonResponse(200, { state: state, exists: true });
      } catch (e) {
        return jsonResponse(500, { error: 'Stored JSON parse error', details: e.message, exists: true });
      }
    }

    if (event.httpMethod === 'POST') {
      let payload = {};
      try { payload = JSON.parse(event.body || '{}'); } catch (e) {
        return jsonResponse(400, { error: 'Request JSON parse error', details: e.message });
      }

      const state = (payload && Object.prototype.hasOwnProperty.call(payload, 'state')) ? payload.state : null;

      const existing = await ghGetFile(token, owner, repo, filePath, branch);
      if (existing && existing.error) return jsonResponse(502, { error: 'GitHub GET error (pre-update)', details: existing.error });

      const contentStr = JSON.stringify(state, null, 2);
      const message = 'Update dashboard state (' + new Date().toISOString() + ')';

      const res = await ghPutFile(token, owner, repo, filePath, branch, message, contentStr, existing.exists ? existing.sha : null);
      if (res && res.error) return jsonResponse(502, { error: 'GitHub PUT error', details: res.error });

      return jsonResponse(200, { ok: true, commitUrl: res.commitUrl });
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (e) {
    return jsonResponse(500, { error: 'Unhandled function error', details: String(e && e.message ? e.message : e), stack: String(e && e.stack ? e.stack : '') });
  }
};
