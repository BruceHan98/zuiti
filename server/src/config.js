import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const SERVER_ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));

export const DATA_DIR = process.env.DATA_DIR || path.join(SERVER_ROOT, '.data');
export const PORT = Number(process.env.PORT || 8787);
export const DB_FILE = path.join(DATA_DIR, 'app.db');
export const WEB_DIST = process.env.WEB_DIST || path.join(SERVER_ROOT, '..', 'web', 'dist');

function loadOrCreateSecret(fileName, bytes = 32) {
  const file = path.join(DATA_DIR, fileName);
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch {
    /* not exists */
  }
  const secret = crypto.randomBytes(bytes).toString('hex');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

/** JWT 签名密钥 */
export const JWT_SECRET = process.env.JWT_SECRET || loadOrCreateSecret('jwt.secret');
/** 内容静态加密主密钥（AES-256） */
export const MASTER_KEY = Buffer.from(
  process.env.MASTER_KEY || loadOrCreateSecret('master.key'),
  'hex'
);
if (MASTER_KEY.length !== 32) {
  throw new Error('MASTER_KEY must be 32 bytes hex');
}
