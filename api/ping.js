module.exports = async (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    ok: true,
    node: process.version,
    hasFetch: typeof fetch === 'function',
    env: {
      AUTH_SECRET: !!process.env.AUTH_SECRET,
      GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
      GITHUB_OWNER: !!process.env.GITHUB_OWNER,
      GITHUB_REPO: !!process.env.GITHUB_REPO,
      GITHUB_BRANCH: !!process.env.GITHUB_BRANCH,
      BOOTSTRAP_ADMIN_USER: !!process.env.BOOTSTRAP_ADMIN_USER,
      BOOTSTRAP_ADMIN_PASS: !!process.env.BOOTSTRAP_ADMIN_PASS,
    }
  }));
};
