
import { readJson, writeJson, uuid } from './_lib/github.js';
import { parseCookies, verifySession, pbkdf2Hash } from './_lib/auth.js';

function requireAdmin(req){
  const secret = process.env.AUTH_SECRET;
  if(!secret) throw new Error('Missing env var: AUTH_SECRET');
  const cookies = parseCookies(req);
  const token = cookies.session;
  if(!token) throw Object.assign(new Error('Not authenticated'), { status: 401 });
  const payload = verifySession(token, secret);
  if(!payload) throw Object.assign(new Error('Invalid session'), { status: 401 });
  if(payload.role !== 'admin') throw Object.assign(new Error('Forbidden (admin only)'), { status: 403 });
  return payload;
}

export default async function handler(req,res){
  try{
    requireAdmin(req);

    if(req.method === 'GET'){
      const { json } = await readJson();
      const users = (json.users||[]).map(u => ({ id:u.id, name:u.name, email:u.email, role:u.role, createdAt:u.createdAt }));
      return res.status(200).json({ users });
    }

    if(req.method === 'POST'){
      let body = req.body;
      if(typeof body === 'string'){
        try{ body = JSON.parse(body); }catch{ body = {}; }
      }
      const name = (body?.name||'').trim();
      const email = (body?.email||'').trim().toLowerCase();
      const role = (body?.role||'user').trim();
      const password = body?.password;
      if(!name || !email) return res.status(400).json({ error: 'Name and email required' });
      if(!['admin','user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

      const { json, sha } = await readJson();
      const users = json.users || (json.users=[]);

      const idx = users.findIndex(u => (u.email||'').toLowerCase() === email);
      const now = Math.floor(Date.now()/1000);

      if(idx >= 0){
        users[idx].name = name;
        users[idx].role = role;
        if(password) users[idx].passwordHash = pbkdf2Hash(password);
      }else{
        if(!password) return res.status(400).json({ error: 'Password required for new user' });
        users.push({
          id: uuid(),
          name,
          email,
          role,
          passwordHash: pbkdf2Hash(password),
          createdAt: now
        });
      }

      await writeJson(json, sha, `Upsert user ${email}`);
      return res.status(200).json({ ok:true });
    }

    if(req.method === 'DELETE'){
      const email = (req.query?.email||'').toString().trim().toLowerCase();
      if(!email) return res.status(400).json({ error: 'email is required' });

      const { json, sha } = await readJson();
      const users = json.users || [];
      const before = users.length;
      json.users = users.filter(u => (u.email||'').toLowerCase() !== email);
      if(json.users.length === before) return res.status(404).json({ error: 'User not found' });

      await writeJson(json, sha, `Delete user ${email}`);
      return res.status(200).json({ ok:true });
    }

    res.setHeader('Allow', ['GET','POST','DELETE']);
    return res.status(405).send('Method Not Allowed');

  }catch(e){
    const status = e.status || 500;
    return res.status(status).json({ error: e.message });
  }
}
