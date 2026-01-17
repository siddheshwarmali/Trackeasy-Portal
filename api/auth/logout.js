
import { setCookie } from '../api/_lib/auth.js';

export default async function handler(req,res){
  if(req.method !== 'POST'){
    res.setHeader('Allow', ['POST']);
    return res.status(405).send('Method Not Allowed');
  }
  setCookie(res, 'session', '', { maxAge: 0, httpOnly: true, sameSite: 'Lax', secure: true });
  return res.status(200).json({ ok: true });
}
