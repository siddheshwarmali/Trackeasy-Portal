
export async function api(path, opts={}){
  const r = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type':'application/json', ...(opts.headers||{}) },
    ...opts,
  });
  const text = await r.text();
  let data;
  try{ data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if(!r.ok){
    const msg = data?.error || data?.message || `Request failed (${r.status})`;
    throw new Error(msg);
  }
  return data;
}

export function toast(id, msg, ok=true){
  const el = document.getElementById(id);
  if(!el) return;
  el.className = 'toast ' + (ok?'ok':'err');
  el.textContent = msg;
  el.style.display = 'block';
}

export async function requireAuth(redirectTo='/login.html'){
  try{
    const me = await api('/api/auth/me');
    return me;
  }catch(e){
    location.href = redirectTo;
  }
}
