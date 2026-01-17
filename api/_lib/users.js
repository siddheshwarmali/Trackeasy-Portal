
import { readJson, writeJson, nowIso } from './github.js';
import { pbkdf2Hash } from './auth.js';

const USERS_PATH = process.env.GITHUB_USERS_PATH || 'data/users.json';

export async function loadUsers() {
  const { json, sha } = await readJson(USERS_PATH, { users: [] });
  const users = Array.isArray(json.users) ? json.users : (Array.isArray(json) ? json : []);
  return { users, sha };
}

export async function saveUsers(users, sha, message='Update users') {
  const payload = { users };
  return writeJson(USERS_PATH, payload, sha, message);
}

export async function ensureBootstrapAdmin() {
  const adminUser = (process.env.ADMIN_USER || '').trim();
  const adminPassword = (process.env.ADMIN_PASSWORD || '').trim();
  if (!adminUser || !adminPassword) return;

  const { users, sha } = await loadUsers();
  const exists = users.some(u => String(u.userId).toLowerCase() === adminUser.toLowerCase());
  if (exists) return;

  const now = nowIso();
  users.push({
    userId: adminUser,
    role: 'admin',
    passwordHash: pbkdf2Hash(adminPassword),
    updatedAt: now,
    createdAt: now
  });
  await saveUsers(users, sha, `Bootstrap admin ${adminUser}`);
}
