const { json, readBody } = require('./_util');

const API_VER = '6.0';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error:'Method not allowed' });

  const payload = await readBody(event.body);
  if (payload.__raw) return json(400, { error:'Invalid JSON body' });

  const org = String(payload.org||'').trim();
  const project = String(payload.project||'').trim();
  const queryId = String(payload.queryId||'').trim();
  const pat = String(payload.pat || process.env.ADO_PAT || '').trim();

  if (!org || !project || !queryId) return json(400, { error:'Missing org/project/queryId' });
  if (!pat) return json(400, { error:'Missing PAT (set ADO_PAT env var)' });

  const baseUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis`;
  const authHeader = 'Basic ' + Buffer.from(':' + pat,'utf8').toString('base64');

  try {
    const wiqlUrl = `${baseUrl}/wit/wiql/${encodeURIComponent(queryId)}?api-version=${API_VER}`;
    const q = await fetch(wiqlUrl, { method:'GET', headers:{ 'Authorization': authHeader, 'Content-Type':'application/json' } });
    const qText = await q.text();
    if (!q.ok) return json(502, { error:'WIQL failed', status:q.status, details:qText.slice(0,500) });
    const qData = JSON.parse(qText);
    const ids = (qData.workItems||[]).slice(0,200).map(w=>w.id);
    if (!ids.length) return json(200, { value: [] });

    const dUrl = `${baseUrl}/wit/workitems?ids=${ids.join(',')}&api-version=${API_VER}`;
    const d = await fetch(dUrl, { method:'GET', headers:{ 'Authorization': authHeader, 'Content-Type':'application/json' } });
    const dText = await d.text();
    if (!d.ok) return json(502, { error:'Workitems failed', status:d.status, details:dText.slice(0,500) });

    return { statusCode: 200, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' }, body: dText };
  } catch (e) {
    return json(500, { error:'Unhandled', details:String(e?.message||e) });
  }
};
