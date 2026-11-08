import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { encrypt, decryptSafe } from '../crypto.js';
import {
  isValidRole,
  defaultPurpose,
  emptyContent,
  isValidMbti,
  normalizeMbti,
  ROLES,
} from '../prompts.js';
import { readLLM, generateReplies } from './settings.js';
import { rateLimitMiddleware, envLimit } from '../security.js';

export const sessionsRouter = Router();
sessionsRouter.use(authMiddleware);

// 生成接口限流：默认每用户 10 分钟 30 次（防滥用刷 token）
const generateLimiter = rateLimitMiddleware('generate', {
  limit: envLimit('GEN_RATE_LIMIT', 30),
  windowMs: 10 * 60_000,
  keyFn: (req) => req.user.id,
});

function getSessionForUser(id, userId) {
  return db
    .prepare('SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?')
    .get(Number(id), userId);
}

function decodeContent(session) {
  if (!session.content_enc) return emptyContent();
  const parsed = decryptSafe(session.content_enc, null);
  if (!parsed) return emptyContent();
  try {
    const obj = JSON.parse(parsed);
    return {
      summary: typeof obj.summary === 'string' ? obj.summary : '',
      rounds: Array.isArray(obj.rounds) ? obj.rounds : [],
    };
  } catch {
    return emptyContent();
  }
}

function sessionSummaryRow(s) {
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    roleLabel: ROLES[s.role]?.label || s.role,
    note: s.note || '',
    mbti: s.mbti || '',
    updatedAt: s.updated_at,
    createdAt: s.created_at,
  };
}

sessionsRouter.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.user.id);
  res.json({ sessions: rows.map(sessionSummaryRow) });
});

sessionsRouter.post('/', (req, res) => {
  const { name, role, note, mbti } = req.body || {};
  if (!isValidRole(role)) return res.status(400).json({ error: '无效的角色' });
  if (!isValidMbti(mbti)) return res.status(400).json({ error: '无效的 MBTI 类型' });
  const finalName = String(name || '').trim().slice(0, 50) || `新的${ROLES[role].label}会话`;
  const info = db
    .prepare(
      'INSERT INTO chat_sessions (user_id, name, role, note, mbti, content_enc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(req.user.id, finalName, role, String(note || '').trim().slice(0, 200), normalizeMbti(mbti), encrypt(JSON.stringify(emptyContent())), Date.now(), Date.now());
  const s = getSessionForUser(info.lastInsertRowid, req.user.id);
  res.status(201).json({ session: sessionSummaryRow(s), purpose: defaultPurpose(role) });
});

sessionsRouter.get('/:id', (req, res) => {
  const s = getSessionForUser(req.params.id, req.user.id);
  if (!s) return res.status(404).json({ error: '会话不存在' });
  const content = decodeContent(s);
  res.json({
    session: sessionSummaryRow(s),
    purposes: ROLES[s.role].purposes,
    content: {
      summary: content.summary,
      rounds: content.rounds,
    },
  });
});

sessionsRouter.patch('/:id', (req, res) => {
  const s = getSessionForUser(req.params.id, req.user.id);
  if (!s) return res.status(404).json({ error: '会话不存在' });
  const { name, note, mbti } = req.body || {};
  if (mbti !== undefined && !isValidMbti(mbti)) {
    return res.status(400).json({ error: '无效的 MBTI 类型' });
  }
  const finalName = name != null ? String(name).trim().slice(0, 50) || s.name : s.name;
  const finalNote = note != null ? String(note).trim().slice(0, 200) : s.note;
  const finalMbti = mbti !== undefined ? normalizeMbti(mbti) : s.mbti;
  db.prepare('UPDATE chat_sessions SET name = ?, note = ?, mbti = ?, updated_at = ? WHERE id = ?').run(
    finalName,
    finalNote,
    finalMbti,
    Date.now(),
    s.id
  );
  res.json({ session: sessionSummaryRow(getSessionForUser(s.id, req.user.id)) });
});

sessionsRouter.delete('/:id', (req, res) => {
  const s = getSessionForUser(req.params.id, req.user.id);
  if (!s) return res.status(404).json({ error: '会话不存在' });
  db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(s.id);
  res.json({ ok: true });
});

/** 记录用户选用了哪条回复（供下轮上下文与摘要使用） */
sessionsRouter.put('/:id/choose', (req, res) => {
  const s = getSessionForUser(req.params.id, req.user.id);
  if (!s) return res.status(404).json({ error: '会话不存在' });
  const { roundIndex, replyIndex } = req.body || {};
  const content = decodeContent(s);
  const round = content.rounds[Number(roundIndex)];
  if (!round) return res.status(400).json({ error: '无效的轮次' });
  if (!(Number(replyIndex) >= 0 && Number(replyIndex) < round.replies.length)) {
    return res.status(400).json({ error: '无效的回复序号' });
  }
  round.chosen = Number(replyIndex);
  db.prepare('UPDATE chat_sessions SET content_enc = ?, updated_at = ? WHERE id = ?').run(
    encrypt(JSON.stringify(content)),
    Date.now(),
    s.id
  );
  res.json({ ok: true });
});

/** 删除某一轮记录（不影响其他轮次与滚动摘要） */
sessionsRouter.delete('/:id/round/:roundIndex', (req, res) => {
  const s = getSessionForUser(req.params.id, req.user.id);
  if (!s) return res.status(404).json({ error: '会话不存在' });
  const idx = Number(req.params.roundIndex);
  const content = decodeContent(s);
  if (!(idx >= 0 && idx < content.rounds.length)) {
    return res.status(400).json({ error: '无效的轮次' });
  }
  content.rounds.splice(idx, 1);
  db.prepare('UPDATE chat_sessions SET content_enc = ?, updated_at = ? WHERE id = ?').run(
    encrypt(JSON.stringify(content)),
    Date.now(),
    s.id
  );
  res.json({ ok: true, rounds: content.rounds.length });
});

/** 生成 3 条推荐话术（reply=针对对方的话；compose=把用户想法写成消息） */
sessionsRouter.post('/:id/generate', generateLimiter, async (req, res) => {
  const s = getSessionForUser(req.params.id, req.user.id);
  if (!s) return res.status(404).json({ error: '会话不存在' });
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: '请输入内容' });
  if (message.length > 2000) return res.status(400).json({ error: '消息过长（≤2000字）' });
  const mode = req.body?.mode === 'compose' ? 'compose' : 'reply';
  const purpose = String(req.body?.purpose || '');

  const llm = readLLM(req.user.id);
  if (!llm) return res.status(400).json({ error: '请先在设置中绑定大模型', code: 'LLM_NOT_BOUND' });

  const content = decodeContent(s);
  let result;
  try {
    result = await generateReplies(llm, { session: s, content, purpose, message, mode });
  } catch (e) {
    return res.status(502).json({ error: e.message, code: e.code || 'LLM_ERROR' });
  }

  content.rounds.push({
    text: message,
    purpose: mode === 'compose' ? '' : purpose,
    mode,
    replies: result.replies,
    chosen: null,
    ts: Date.now(),
  });
  content.summary = result.summary;
  db.prepare('UPDATE chat_sessions SET content_enc = ?, updated_at = ? WHERE id = ?').run(
    encrypt(JSON.stringify(content)),
    Date.now(),
    s.id
  );
  res.json({
    replies: result.replies,
    roundIndex: content.rounds.length - 1,
    summary: result.summary,
  });
});
