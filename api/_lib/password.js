// api/_lib/password.js
const crypto = require('crypto');

function hashPassword(password, opts = {}) {
  const iterations = opts.iterations || 210000;
  const keylen = opts.keylen || 32;
  const digest = opts.digest || 'sha256';
  const salt = opts.salt || crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, keylen, digest);
  return { iterations, keylen, digest, salt: salt.toString('base64'), hash: hash.toString('base64') };
}

function verifyPassword(password, record) {
  if (!record || !record.hash || !record.salt) return false;
  const iterations = record.iterations || 210000;
  const keylen = record.keylen || 32;
  const digest = record.digest || 'sha256';
  const salt = Buffer.from(String(record.salt), 'base64');
  const expected = Buffer.from(String(record.hash), 'base64');
  const actual = crypto.pbkdf2Sync(String(password), salt, iterations, keylen, digest);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
