
import { readJson } from './_lib/github.js';
import { verifyHash, signSession, setCookie } from './_lib/auth.js';

export default async function handler(req, res){
  if(req.method !== 'POST'){
    res.setHeader('Allow', ['POST']);
    return res.status(405).send('Method Not Allowed');
  }

  const secret = process.env.AUTH_SECRET;
  if(!secret) return res.status(500).json({ error: 'Missing env var: AUTH_SECRET' });

  let body = req.body;
  if(typeof body === 'string'){
    try{ body = JSON.parse(body); }catch{ body = {}; }
  }

  const email = (body?.email||'').trim().toLowerCase();
  const password = body?.password || '';
  if(!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try{
    const { json } = await readJson();
    const users = json.users || [];
    const user = users.find(u => (u.email||'').toLowerCase() === email);
    if(!user || !user.passwordHash || !verifyHash(password, user.passwordHash)){
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signSession({ sub: user.id, email: user.email, role: user.role, name: user.name }, secret);
    setCookie(res, 'session', token, { maxAge: 60*60*8, httpOnly: true, sameSite: 'Lax', secure: true });

    return res.status(200).json({ ok: true });
  }catch(e){
    return res.status(500).json({ error: e.message });
  }
}
