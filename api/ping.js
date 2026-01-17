'use strict';
module.exports = async (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({
    ok: true,
    env: {
      GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
      GITHUB_OWNER: !!process.env.GITHUB_OWNER,
      GITHUB_REPO: !!process.env.GITHUB_REPO,
      GITHUB_USERS_FILE: !!process.env.GITHUB_USERS_FILE
    }
  }));
};