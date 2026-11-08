import crypto from 'node:crypto';
import { MASTER_KEY } from './config.js';

const ALGO = 'aes-256-gcm';

/**
 * AES-256-GCM 加密。输出格式：base64(iv(12B) | authTag(16B) | ciphertext)
 * 同一明文每次加密结果不同（随机 iv）。
 */
export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, MASTER_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** 解密 encrypt() 的输出，被篡改/密钥不符时抛错 */
export function decrypt(payload) {
  const raw = Buffer.from(String(payload), 'base64');
  if (raw.length < 12 + 16) throw new Error('invalid ciphertext');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, MASTER_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** 安全解密：失败返回 fallback 而不是抛错 */
export function decryptSafe(payload, fallback) {
  try {
    return decrypt(payload);
  } catch {
    return fallback;
  }
}
