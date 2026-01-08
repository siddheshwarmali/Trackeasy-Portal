/**
 * Netlify Function (CommonJS): /.netlify/functions/state
 * GitHub-backed shared state store.
 *
 * Required Netlify environment variables:
 *   GITHUB_TOKEN  (fine-grained PAT with Contents: Read and write)
 *   GITHUB_OWNER
 *   GITHUB_REPO
 *   GITHUB_PATH   (example: data/dashboard_state.json)  // no leading slash
 * Optional:
 *   GITHUB_BRANCH (default: main)
 */

const API_BASE = 'https://api.github.com';

function jsonResponse(statusCode, obj) {
  return {
    statusCode: statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}

function missingEnv() {
  var required = ['GITHUB_TOKEN','GITHUB_OWNER','GITHUB_REPO','GITHUB_PATH'];
  return required.filter(function(k){ return !process.env[k]; });
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

function encodeGitHubPath(p) {
  return String(p || '').split('/').map(encodeURIComponent).join('/');
}

async function ghGetFile(token, owner, repo, path, branch) {
  var encPath = encodeGitHubPath(path);
  var url = API_BASE + '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/contents/' + encPath + '?ref=' + encodeURIComponent(branch);
  var r = await fetch(url, { method: 'GET', headers: ghHeaders(token) });

  if (r.status === 404) {
    return { exists: false, url: url };
  }

  var raw = await r.text();
  if (!r.ok) {
    return { error: { stage: 'github_get', status: r.status, statusText: r.statusText, url: url, raw: raw } };
  }

  var data;
  try { data = JSON.parse(raw); } catch (e) {
    return { error: { stage: 'github_get_parse', url: url, raw: raw, message: e.message } };
  }

  var contentB64 = String(data.content || '').split('\n').join('');
  return { exists: true, sha: data.sha, contentB64: contentB64, url: url };
}

async function ghPutFile(token, owner, repo, path, branch, message, contentStr, sha) {
  var encPath = encodeGitHubPath(path);
  var url = API_BASE + '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/contents/' + encPath;
  var body = { message: message, content: toBase64(contentStr), branch: branch };
  if (sha) body.sha = sha;

  var r = await fetch(url, {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders(token)),
    body: JSON.stringify(body)
  });

  var raw = await r.text();
  if (!r.ok) {
    return { error: { stage: 'github_put', status: r.status, statusText: r.statusText, url: url, raw: raw } };
  }

  var data;
  try { data = JSON.parse(raw); } catch (e) {
    return { error: { stage: 'github_put_parse', url: url, raw: raw, message: e.message } };
  }

  var commitUrl = (data.commit && data.commit.html_url) ? data.commit.html_url : null;
  return { ok: true, commitUrl: commitUrl, url: url };
}

exports.handler = async function(event, context) {
  var missing = missingEnv();
  if (missing.length) {
    return jsonResponse(500, { error: 'Missing Netlify environment variables', missing: missing });
  }

  var token  = process.env.GITHUB_TOKEN;
  var owner  = process.env.GITHUB_OWNER;
  var repo   = process.env.GITHUB_REPO;
  var filePath = process.env.GITHUB_PATH;
  var branch = process.env.GITHUB_BRANCH || 'main';

  var target = { owner: owner, repo: repo, path: filePath, branch: branch };

  if (String(filePath || '').indexOf('/') === 0) {
    return jsonResponse(400, { error: 'GITHUB_PATH must NOT start with /', target: target });
  }

  try {
    if (event.httpMethod === 'GET') {
      var file = await ghGetFile(token, owner, repo, filePath, branch);
      if (file && file.error) return jsonResponse(502, { error: 'GitHub GET error', target: target, details: file.error });
      if (!file.exists) return jsonResponse(200, { state: null, exists: false, target: target, debug: { url: file.url } });

      try {
        var state = JSON.parse(fromBase64(file.contentB64));
        return jsonResponse(200, { state: state, exists: true, target: target, debug: { url: file.url, sha: file.sha } });
      } catch (e) {
        return jsonResponse(500, { error: 'Stored JSON parse error', details: e.message, exists: true, target: target, debug: { url: file.url } });
      }
    }

    if (event.httpMethod === 'POST') {
      var payload = {};
      try { payload = JSON.parse(event.body || '{}'); } catch (e) {
        return jsonResponse(400, { error: 'Request JSON parse error', details: e.message, target: target });
      }

      var state = Object.prototype.hasOwnProperty.call(payload, 'state') ? payload.state : null;

      var existing = await ghGetFile(token, owner, repo, filePath, branch);
      if (existing && existing.error) return jsonResponse(502, { error: 'GitHub GET error (pre-update)', target: target, details: existing.error });

      var contentStr = JSON.stringify(state, null, 2);
      var message = 'Update dashboard state (' + new Date().toISOString() + ')';

      var res = await ghPutFile(token, owner, repo, filePath, branch, message, contentStr, existing.exists ? existing.sha : null);
      if (res && res.error) return jsonResponse(502, { error: 'GitHub PUT error', target: target, details: res.error });

      return jsonResponse(200, { ok: true, commitUrl: res.commitUrl, target: target, debug: { url: res.url } });
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (e) {
    return jsonResponse(500, { error: 'Unhandled function error', details: String(e && e.message ? e.message : e), stack: String(e && e.stack ? e.stack : ''), target: target });
  }
};
