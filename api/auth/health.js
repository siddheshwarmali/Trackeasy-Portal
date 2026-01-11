// api/health.js
const { json } = require('./_lib/auth');
const { repoInfo, listFolder } = require('./_lib/github');

module.exports = async (req, res) => {
  try {
    const missing = [];
    if (!process.env.GITHUB_TOKEN) missing.push('GITHUB_TOKEN');
    if (!process.env.GITHUB_OWNER) missing.push('GITHUB_OWNER');
    if (!process.env.GITHUB_REPO) missing.push('GITHUB_REPO');
    if (missing.length) return json(res, 200, { ok: false, error: 'Missing env vars: ' + missing.join(', ') });

    const { dashPrefix } = repoInfo();
    await listFolder(dashPrefix);
    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 200, { ok: false, error: e.message || String(e), details: e.data || null });
  }
};
