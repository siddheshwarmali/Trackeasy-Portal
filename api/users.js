
const { verify, parseCookies, json, readJson } = require('./_lib/auth');
const { readJsonFile, ghPutFile } = require('./_lib/github');
const USERS_FILE = process.env.GITHUB_USERS_FILE || 'data/users.json';

function getSession(req){
  const secret = process.env.AUTH_SECRET || 'dev-secret-change-me';
  const cookies = parseCookies(req);
  return verify(cookies.tw_session, secret);
}

function normEmail(email){ return String(email||'').trim().toLowerCase(); }

async function loadUsers(){
  const data = await readJsonFile(USERS_FILE);
  if(data && typeof data==='object'){
    return { creators: Array.isArray(data.creators)?data.creators:[], viewers: Array.isArray(data.viewers)?data.viewers:[] };
  }
  return { creators: [], viewers: [] };
}

async function saveUsers(users, actor){
  const payload = { creators: users.creators||[], viewers: users.viewers||[], updatedAt: new Date().toISOString(), updatedBy: actor||'admin' };
  await ghPutFile(USERS_FILE, JSON.stringify(payload, null, 2), 'Update users allowlist');
}

module.exports = async (req,res)=>{
  const session = getSession(req);
  if(!session) return json(res,401,{error:'Not authenticated'});
  if(session.role!=='admin') return json(res,403,{error:'Forbidden'});

  try{
    if(req.method==='GET'){
      const users=await loadUsers();
      return json(res,200,users);
    }
    if(req.method==='POST'){
      const body=await readJson(req);
      const role=String(body.role||'').toLowerCase();
      const email=normEmail(body.email);
      if(!email || !email.includes('@')) return json(res,400,{error:'Valid email required'});
      if(role!=='creator' && role!=='viewer') return json(res,400,{error:'role must be creator or viewer'});
      const users=await loadUsers();
      users.creators = Array.from(new Set(users.creators.map(normEmail)));
      users.viewers  = Array.from(new Set(users.viewers.map(normEmail)));
      if(role==='creator'){
        if(!users.creators.includes(email)) users.creators.push(email);
        users.viewers = users.viewers.filter(e=>normEmail(e)!==email);
      } else {
        if(!users.viewers.includes(email)) users.viewers.push(email);
        users.creators = users.creators.filter(e=>normEmail(e)!==email);
      }
      await saveUsers(users, session.email||session.userId);
      return json(res,200,{ok:true});
    }
    if(req.method==='DELETE'){
      const body=await readJson(req);
      const role=String(body.role||'').toLowerCase();
      const email=normEmail(body.email);
      const users=await loadUsers();
      if(role==='creator') users.creators = users.creators.map(normEmail).filter(e=>e!==email);
      else if(role==='viewer') users.viewers = users.viewers.map(normEmail).filter(e=>e!==email);
      else {
        users.creators = users.creators.map(normEmail).filter(e=>e!==email);
        users.viewers = users.viewers.map(normEmail).filter(e=>e!==email);
      }
      await saveUsers(users, session.email||session.userId);
      return json(res,200,{ok:true});
    }
    return json(res,405,{error:'Method not allowed'});
  } catch(e){
    return json(res,500,{error:e.message||String(e)});
  }
};
