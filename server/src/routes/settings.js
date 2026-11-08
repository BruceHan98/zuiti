import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { encrypt, decryptSafe } from '../crypto.js';
import { LLM_PRESETS, chatComplete, testConnection, parseJSONLoose } from '../llm.js';
import { buildSystemPrompt, buildUserMessage, isValidPurpose, defaultPurpose } from '../prompts.js';
import { assertSafeBaseUrl, rateLimitMiddleware, envLimit } from '../security.js';

export const settingsRouter = Router();
settingsRouter.use(authMiddleware);

// 连通性测试限流：默认每用户 10 分钟 15 次（防刷别人账号的 LLM 调用）
const llmTestLimiter = rateLimitMiddleware('llm-test', {
  limit: envLimit('LLM_TEST_RATE_LIMIT', 15),
  windowMs: 10 * 60_000,
  keyFn: (req) => req.user.id,
});

function readLLM(userId) {
  const row = db.prepare('SELECT llm_enc FROM user_settings WHERE user_id = ?').get(userId);
  if (!row || !row.llm_enc) return null;
  const plain = decryptSafe(row.llm_enc, null);
  if (!plain) return null;
  try {
    return JSON.parse(plain);
  } catch {
    return null;
  }
}

function maskKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

settingsRouter.get('/llm', (req, res) => {
  const s = readLLM(req.user.id);
  if (!s) return res.json({ configured: false, presets: LLM_PRESETS });
  res.json({
    configured: true,
    presets: LLM_PRESETS,
    provider: s.provider,
    baseUrl: s.baseUrl,
    model: s.model,
    keyMasked: maskKey(s.apiKey),
  });
});

settingsRouter.put('/llm', async (req, res) => {
  const { provider, baseUrl, apiKey, model } = req.body || {};
  const preset = LLM_PRESETS[provider];
  if (!preset) return res.status(400).json({ error: '不支持的服务商' });
  const finalBase = String(baseUrl || '').trim();
  const finalModel = String(model || '').trim();
  if (!finalBase || !/^https?:\/\//.test(finalBase)) {
    return res.status(400).json({ error: 'Base URL 需以 http(s):// 开头' });
  }
  if (!finalModel) return res.status(400).json({ error: '请填写模型名称' });
  // SSRF 防护：保存前校验不指向内网/本机
  try {
    await assertSafeBaseUrl(finalBase);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const existing = readLLM(req.user.id);
  // 前端不回传完整 key：为空且已有配置时保留旧 key
  const finalKey = String(apiKey || '').trim() || existing?.apiKey || '';
  if (!finalKey) return res.status(400).json({ error: '请填写 API Key' });
  const payload = JSON.stringify({
    provider,
    baseUrl: finalBase,
    model: finalModel,
    apiKey: finalKey,
  });
  db.prepare(
    `INSERT INTO user_settings (user_id, llm_enc) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET llm_enc = excluded.llm_enc`
  ).run(req.user.id, encrypt(payload));
  res.json({ ok: true, keyMasked: maskKey(finalKey) });
});

/**
 * 连通性测试。可传临时配置（未保存前测试），不传则用已保存配置。
 */
settingsRouter.post('/llm/test', llmTestLimiter, async (req, res) => {
  const body = req.body || {};
  let settings;
  if (body.baseUrl && body.model) {
    const existing = readLLM(req.user.id);
    settings = {
      provider: body.provider || 'custom',
      baseUrl: body.baseUrl,
      model: body.model,
      apiKey: String(body.apiKey || '').trim() || existing?.apiKey || '',
    };
  } else {
    settings = readLLM(req.user.id);
  }
  if (!settings) return res.status(400).json({ ok: false, message: '请先填写并保存配置' });
  try {
    await testConnection(settings);
    res.json({ ok: true, message: '连接成功，模型响应正常' });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message });
  }
});

/**
 * 生成话术：供会话路由复用（也导出给测试）。
 */
export async function generateReplies(settings, { session, content, purpose, message }) {
  const finalPurpose = isValidPurpose(session.role, purpose) ? purpose : defaultPurpose(session.role);
  const { content: raw } = await chatComplete(settings, {
    system: buildSystemPrompt(),
    user: buildUserMessage({ session, content, purpose: finalPurpose, message }),
  });
  const parsed = parseJSONLoose(raw);
  const replies = Array.isArray(parsed.replies)
    ? parsed.replies.map((r) => String(r).trim()).filter(Boolean).slice(0, 3)
    : [];
  if (replies.length === 0) throw new Error('模型未返回有效话术');
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 400) : content.summary;
  return { replies, summary };
}

export { readLLM };
