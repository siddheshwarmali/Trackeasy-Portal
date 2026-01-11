// api/_lib/http.js
const https = require('https');

async function request(url, { method='GET', headers={}, body=null } = {}) {
  if (typeof fetch === 'function') {
    const r = await fetch(url, { method, headers, body });
    const text = await r.text();
    return { status: r.status, ok: r.ok, text, headers: Object.fromEntries(r.headers.entries()) };
  }

  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { method, hostname: u.hostname, path: u.pathname + u.search, headers };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => resolve({ status: res.statusCode || 0, ok: (res.statusCode||0) >= 200 && (res.statusCode||0) < 300, text: data, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { request };
