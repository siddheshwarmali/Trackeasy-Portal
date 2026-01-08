
const API_BASE = "https://api.github.com";
const MANIFEST_PATH = "data/manifest.json";
const DASH_DIR = "data/dashboards";

function jsonResponse(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

function missingEnv() {
  const required = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"]; 
  return required.filter((k) => !process.env[k]);
}

function toBase64(str) { return Buffer.from(str, "utf8").toString("base64"); }
function fromBase64(b64) { return Buffer.from(b64, "base64").toString("utf8"); }

function ghHeaders(token) {
  return {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function encodeGitHubPath(p) {
  return String(p || "").split("/").map(encodeURIComponent).join("/");
}

async function ghGetFile(token, owner, repo, path, branch) {
  const encPath = encodeGitHubPath(path);
  const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encPath}?ref=${encodeURIComponent(branch)}`;
  const r = await fetch(url, { method: "GET", headers: ghHeaders(token) });
  if (r.status === 404) return { exists: false, url };
  const raw = await r.text();
  if (!r.ok) return { error: { stage: "github_get", status: r.status, statusText: r.statusText, url, raw } };
  const data = JSON.parse(raw);
  const contentB64 = String(data.content || "").split("
").join("");
  return { exists: true, sha: data.sha, contentB64, url };
}

async function ghPutFile(token, owner, repo, path, branch, message, contentStr, sha) {
  const encPath = encodeGitHubPath(path);
  const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encPath}`;
  const body = { message, content: toBase64(contentStr), branch };
  if (sha) body.sha = sha;
  const r = await fetch(url, {
    method: "PUT",
    headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders(token)),
    body: JSON.stringify(body),
  });
  const raw = await r.text();
  if (!r.ok) return { error: { stage: "github_put", status: r.status, statusText: r.statusText, url, raw } };
  const data = JSON.parse(raw);
  return { ok: true, sha: data.content?.sha || null, commitUrl: data.commit?.html_url || null, url };
}

async function ghDeleteFile(token, owner, repo, path, branch, sha) {
  const encPath = encodeGitHubPath(path);
  const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encPath}`;
  const body = { message: `Delete ${path} (${new Date().toISOString()})`, sha, branch };
  const r = await fetch(url, {
    method: "DELETE",
    headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders(token)),
    body: JSON.stringify(body),
  });
  const raw = await r.text();
  if (!r.ok) return { error: { stage: "github_delete", status: r.status, statusText: r.statusText, url, raw } };
  let data = {}; try { data = JSON.parse(raw || "{}"); } catch(e) {}
  return { ok: true, commitUrl: data.commit?.html_url || null, url };
}

function safeDashId(id) {
  const s = String(id || "").trim();
  if (!s) return null;
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(s)) return null;
  return s;
}

async function loadManifest(token, owner, repo, branch) {
  const file = await ghGetFile(token, owner, repo, MANIFEST_PATH, branch);
  if (file.error) return { error: file.error };
  if (!file.exists) return { exists: false, sha: null, list: [] };
  try {
    const txt = fromBase64(file.contentB64);
    const list = JSON.parse(txt);
    return { exists: true, sha: file.sha, list: Array.isArray(list) ? list : [] };
  } catch (e) {
    return { exists: true, sha: file.sha, list: [] };
  }
}

async function saveManifest(token, owner, repo, branch, manifestSha, list) {
  const contentStr = JSON.stringify(list, null, 2);
  return ghPutFile(token, owner, repo, MANIFEST_PATH, branch, `Update manifest (${new Date().toISOString()})`, contentStr, manifestSha);
}

exports.handler = async function(event) {
  const missing = missingEnv();
  if (missing.length) return jsonResponse(500, { error: "Missing env vars", missing });

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";

  if (String(repo).includes("/")) {
    return jsonResponse(400, { error: "GITHUB_REPO must be repo name only", got: repo });
  }

  const u = new URL(event.rawUrl || ("https://example.com" + (event.path || "/")));
  const dash = u.searchParams.get("dash");
  const listFlag = u.searchParams.get("list");

  try {
    if (event.httpMethod === "GET" && listFlag) {
      const man = await loadManifest(token, owner, repo, branch);
      if (man.error) return jsonResponse(502, { error: "Manifest GET failed", details: man.error });
      return jsonResponse(200, { dashboards: man.list });
    }

    if (event.httpMethod === "GET") {
      const id = safeDashId(dash);
      if (!id) return jsonResponse(400, { error: "Missing/invalid dash id" });
      const path = `${DASH_DIR}/${id}.json`;
      const file = await ghGetFile(token, owner, repo, path, branch);
      if (file.error) return jsonResponse(502, { error: "GitHub GET failed", details: file.error });
      if (!file.exists) return jsonResponse(200, { state: null, exists: false });
      const state = JSON.parse(fromBase64(file.contentB64));
      return jsonResponse(200, { state, exists: true });
    }

    if (event.httpMethod === "POST") {
      const id = safeDashId(dash);
      if (!id) return jsonResponse(400, { error: "Missing/invalid dash id" });
      const path = `${DASH_DIR}/${id}.json`;
      let payload = {}; 
      try { payload = JSON.parse(event.body || "{}"); } catch(e) { return jsonResponse(400, { error: "Invalid request JSON", details: e.message }); }
      const state = Object.prototype.hasOwnProperty.call(payload, "state") ? payload.state : null;

      const existing = await ghGetFile(token, owner, repo, path, branch);
      if (existing.error) return jsonResponse(502, { error: "GitHub GET pre-update failed", details: existing.error });

      const contentStr = JSON.stringify(state, null, 2);
      const saved = await ghPutFile(token, owner, repo, path, branch, `Update dashboard ${id} (${new Date().toISOString()})`, contentStr, existing.exists ? existing.sha : null);
      if (saved.error) return jsonResponse(502, { error: "GitHub PUT failed", details: saved.error });

      const man = await loadManifest(token, owner, repo, branch);
      if (man.error) return jsonResponse(502, { error: "Manifest GET failed", details: man.error });
      const list = man.list || [];
      const now = new Date().toISOString();
      const name = state && state.__meta && state.__meta.name ? String(state.__meta.name) : null;
      const idx = list.findIndex((x) => x && x.id === id);
      const entry = { id, name, updatedAt: now };
      if (idx >= 0) list[idx] = Object.assign({}, list[idx], entry);
      else list.push(entry);
      const manSaved = await saveManifest(token, owner, repo, branch, man.exists ? man.sha : null, list);
      if (manSaved.error) return jsonResponse(502, { error: "Manifest PUT failed", details: manSaved.error });

      return jsonResponse(200, { ok: true, commitUrl: saved.commitUrl });
    }

    if (event.httpMethod === "DELETE") {
      const id = safeDashId(dash);
      if (!id) return jsonResponse(400, { error: "Missing/invalid dash id" });
      const path = `${DASH_DIR}/${id}.json`;
      const file = await ghGetFile(token, owner, repo, path, branch);
      if (file.error) return jsonResponse(502, { error: "GitHub GET pre-delete failed", details: file.error });
      if (!file.exists) return jsonResponse(200, { ok: true, deleted: false });
      const del = await ghDeleteFile(token, owner, repo, path, branch, file.sha);
      if (del.error) return jsonResponse(502, { error: "GitHub DELETE failed", details: del.error });

      const man = await loadManifest(token, owner, repo, branch);
      if (!man.error) {
        const newList = (man.list || []).filter((x) => x && x.id !== id);
        await saveManifest(token, owner, repo, branch, man.exists ? man.sha : null, newList);
      }
      return jsonResponse(200, { ok: true, commitUrl: del.commitUrl });
    }

    return jsonResponse(405, { error: "Method not allowed" });
  } catch(e) {
    return jsonResponse(500, { error: "Unhandled", details: String(e.message || e), stack: String(e.stack || "") });
  }
};
