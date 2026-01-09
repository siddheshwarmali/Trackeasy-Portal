// api/ado.js (Vercel)
const API_VER = '6.0';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw='';
  await new Promise(resolve => {
    req.on('data', c => raw += c);
    req.on('end', resolve);
  });
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { __raw: raw }; }
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error:'Method not allowed' })); }

  const payload = await readBody(req);
  if (payload.__raw) { res.statusCode=400; return res.end(JSON.stringify({ error:'Invalid JSON body' })); }

  const org = String(payload.org||'').trim();
  const project = String(payload.project||'').trim();
  const queryId = String(payload.queryId||'').trim();
  const pat = String(payload.pat || process.env.ADO_PAT || '').trim();

  if (!org || !project || !queryId) { res.statusCode=400; return res.end(JSON.stringify({ error:'Missing org/project/queryId' })); }
  if (!pat) { res.statusCode=400; return res.end(JSON.stringify({ error:'Missing PAT (set ADO_PAT env var)' })); }

  const baseUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis`;
  const authHeader = 'Basic ' + Buffer.from(':' + pat,'utf8').toString('base64');

  try {
    const wiqlUrl = `${baseUrl}/wit/wiql/${encodeURIComponent(queryId)}?api-version=${API_VER}`;
    const q = await fetch(wiqlUrl, { method:'GET', headers:{ 'Authorization': authHeader, 'Content-Type':'application/json' } });
    const qText = await q.text();
    if (!q.ok) { res.statusCode=502; return res.end(JSON.stringify({ error:'WIQL failed', status:q.status, details:qText.slice(0,500) })); }
    const qData = JSON.parse(qText);
    const ids = (qData.workItems||[]).slice(0,200).map(w=>w.id);
    if (!ids.length) { res.statusCode=200; res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({ value: [] })); }

    const dUrl = `${baseUrl}/wit/workitems?ids=${ids.join(',')}&api-version=${API_VER}`;
    const d = await fetch(dUrl, { method:'GET', headers:{ 'Authorization': authHeader, 'Content-Type':'application/json' } });
    const dText = await d.text();
    if (!d.ok) { res.statusCode=502; return res.end(JSON.stringify({ error:'Workitems failed', status:d.status, details:dText.slice(0,500) })); }

    res.statusCode=200;
    res.setHeader('Content-Type','application/json');
    return res.end(dText);
  } catch (e) {
    res.statusCode=500;
    res.setHeader('Content-Type','application/json');
    return res.end(JSON.stringify({ error:'Unhandled', details:String(e?.message||e) }));
  }
};
