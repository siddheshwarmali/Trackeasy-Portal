
import { parseCookies, verifySession } from '../api/_lib/auth.js';

export default async function handler(req,res){
  const secret = process.env.AUTH_SECRET;
  if(!secret) return res.status(500).json({ error: 'Missing env var: AUTH_SECRET' });

  const cookies = parseCookies(req);
  const token = cookies.session;
  if(!token) return res.status(401).json({ error: 'Not authenticated' });

  const payload = verifySession(token, secret);
  if(!payload) return res.status(401).json({ error: 'Invalid session' });

  return res.status(200).json({
    user: {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.name
    }
  });
}
