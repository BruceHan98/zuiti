import { Router } from 'express';
import { db } from '../db.js';
import { hashPassword, verifyPassword, signToken, authMiddleware, publicUser } from '../auth.js';
import { rateLimitMiddleware, clientIp, envLimit } from '../security.js';

export const authRouter = Router();

// 注册/登录限流：默认每 IP 5 分钟 30 次（可用 AUTH_RATE_LIMIT 调整，0 关闭）
const authLimiter = rateLimitMiddleware('auth', {
  limit: envLimit('AUTH_RATE_LIMIT', 30),
  windowMs: 5 * 60_000,
  keyFn: clientIp,
});

// 可选注册邀请码：设置环境变量 REGISTER_CODE 后，注册必须携带正确的 inviteCode
function registerGuard(req, res, next) {
  const expected = process.env.REGISTER_CODE;
  if (!expected) return next();
  if (req.body?.inviteCode !== expected) {
    return res.status(403).json({ error: '邀请码不正确' });
  }
  next();
}

function validateCredentials(username, password) {
  if (typeof username !== 'string' || !/^[^\s]{2,32}$/.test(username)) {
    return '用户名需为 2-32 个字符且不含空白';
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 64) {
    return '密码需为 6-64 个字符';
  }
  return null;
}

authRouter.post('/register', authLimiter, registerGuard, (req, res) => {
  const { username, password } = req.body || {};
  const err = validateCredentials(username, password);
  if (err) return res.status(400).json({ error: err });
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: '用户名已被注册' });
  const info = db
    .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(username, hashPassword(password), Date.now());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

authRouter.post('/login', authLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || ''));
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

authRouter.post('/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(oldPassword || ''), user.password_hash)) {
    return res.status(400).json({ error: '旧密码不正确' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 64) {
    return res.status(400).json({ error: '新密码需为 6-64 个字符' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    hashPassword(newPassword),
    user.id
  );
  res.json({ ok: true });
});

authRouter.get('/me', authMiddleware, (req, res) => {
  res.json({ user: publicUser(req.user) });
});
