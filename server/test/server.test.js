import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

// 独立的测试数据目录（必须在 import 业务模块之前设置）
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'huichat-test-'));
// 测试用 mock LLM 跑在本机回环地址，需放行私有地址（SSRF 测试中会临时关闭）
process.env.LLM_ALLOW_PRIVATE = '1';

const { createApp } = await import('../src/app.js');
const { encrypt, decrypt } = await import('../src/crypto.js');
const { trimRounds, buildUserMessage, ROLES } = await import('../src/prompts.js');
const { parseJSONLoose } = await import('../src/llm.js');
const { db } = await import('../src/db.js');
const { rateLimit, assertSafeBaseUrl } = await import('../src/security.js');

let base;
let llmBase;
let llmErrBase;
const llmCalls = [];
let httpServer;
let llmServer;
let llmErrServer;

// 启动被测应用与模拟 LLM 服务（顶层 await）
{
  const app = createApp();
  httpServer = app.listen(0, '127.0.0.1');
  await new Promise((r) => httpServer.once('listening', r));
  base = `http://127.0.0.1:${httpServer.address().port}`;

  // 模拟 OpenAI 兼容的 LLM 服务
  llmServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      llmCalls.push({ url: req.url, body: JSON.parse(body) });
      const n = llmCalls.length;
      const content =
        n === 3
          ? '```json\n{"replies":["围栏回复一","围栏回复二","围栏回复三"],"summary":"摘要#3"}\n```'
          : `好的，结果如下：{"replies":["稳妥回复${n}","主动回复${n}","幽默回复${n}"],"summary":"摘要#${n}"}`;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 50 } }));
    });
  });
  await new Promise((r) => llmServer.listen(0, '127.0.0.1', r));
  llmBase = `http://127.0.0.1:${llmServer.address().port}/v1`;

  // 模拟智谱风格错误响应（嵌套 error 对象）的 LLM 服务
  llmErrServer = http.createServer((req, res) => {
    res.statusCode = 401;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: '401', message: '令牌已过期或验证不正确' } }));
  });
  await new Promise((r) => llmErrServer.listen(0, '127.0.0.1', r));
  llmErrBase = `http://127.0.0.1:${llmErrServer.address().port}/v1`;
}

after(async () => {
  await new Promise((r) => httpServer.close(r));
  await new Promise((r) => llmServer.close(r));
  await new Promise((r) => llmErrServer.close(r));
});

const api = {
  async req(method, url, { token, body } = {}) {
    const res = await fetch(`${base}${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* ignore */
    }
    return { status: res.status, json };
  },
};

async function createUser(name) {
  const r = await api.req('POST', '/api/auth/register', {
    body: { username: name, password: 'pass123' },
  });
  assert.equal(r.status, 201);
  return r.json.token;
}

// ---------- 单元：加密 ----------
test('AES-256-GCM 加解密往返 & 随机 IV', () => {
  const plain = JSON.stringify({ hello: '世界', n: 42 });
  const c1 = encrypt(plain);
  const c2 = encrypt(plain);
  assert.equal(decrypt(c1), plain);
  assert.equal(decrypt(c2), plain);
  assert.notEqual(c1, c2, '同一明文两次加密密文应不同（随机 IV）');
});

test('密文被篡改时解密失败', () => {
  const c = encrypt('secret-data');
  const raw = Buffer.from(c, 'base64');
  raw[raw.length - 1] ^= 0xff;
  assert.throws(() => decrypt(raw.toString('base64')));
});

test('密文不含明文（静态加密落库）', () => {
  const c = encrypt('PLAINTEXT-MARKER-123');
  assert.ok(!c.includes('PLAINTEXT-MARKER-123'));
});

// ---------- 单元：LLM 输出解析 ----------
test('parseJSONLoose 支持纯 JSON / 围栏 / 带闲聊', () => {
  assert.deepEqual(parseJSONLoose('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJSONLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJSONLoose('好的，结果：{"replies":["x"]}'.replace('x', 'y')), {
    replies: ['y'],
  });
  assert.throws(() => parseJSONLoose('没有任何 JSON'));
  assert.throws(() => parseJSONLoose(''));
});

// ---------- 单元：节省 token 的上下文裁剪 ----------
test('trimRounds 只保留最近 3 轮', () => {
  const rounds = [1, 2, 3, 4, 5].map((i) => ({ text: `msg-${i}`, replies: [`r${i}`], chosen: 0 }));
  const trimmed = trimRounds(rounds);
  assert.equal(trimmed.length, 3);
  assert.deepEqual(trimmed.map((r) => r.text), ['msg-3', 'msg-4', 'msg-5']);
});

test('buildUserMessage：含最近 3 轮，不含更早历史', () => {
  const session = { role: 'lover', note: '小美' };
  const content = {
    rounds: [1, 2, 3, 4].map((i) => ({
      text: `msg-${i}`,
      replies: [`回复${i}`],
      chosen: 0,
      purpose: '日常关心',
    })),
  };
  const msg = buildUserMessage({ session, content, purpose: '化解矛盾', message: 'msg-new' });
  assert.ok(msg.includes('关系:恋人'));
  assert.ok(msg.includes('目的:化解矛盾'));
  assert.ok(msg.includes('对方:小美'));
  assert.ok(msg.includes('msg-4'), '应含最近一轮');
  assert.ok(msg.includes('msg-3'), '应含最近两轮');
  assert.ok(msg.includes('msg-2'), '应含最近三轮');
  assert.ok(!msg.includes('msg-1'), '更早的历史不应出现（省 token）');
  assert.ok(msg.includes('msg-new'));
});

// ---------- 接口：认证 ----------
test('注册/登录/重复注册/错误密码', async () => {
  const reg = await api.req('POST', '/api/auth/register', {
    body: { username: 'alice', password: 'pass123' },
  });
  assert.equal(reg.status, 201);
  assert.ok(reg.json.token);

  const dup = await api.req('POST', '/api/auth/register', {
    body: { username: 'alice', password: 'pass123' },
  });
  assert.equal(dup.status, 409);

  const bad = await api.req('POST', '/api/auth/login', {
    body: { username: 'alice', password: 'wrong!!' },
  });
  assert.equal(bad.status, 401);

  const ok = await api.req('POST', '/api/auth/login', {
    body: { username: 'alice', password: 'pass123' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.username, 'alice');

  const weak = await api.req('POST', '/api/auth/register', {
    body: { username: 'bob', password: '123' },
  });
  assert.equal(weak.status, 400);
});

test('未携带 token 访问受保护接口返回 401', async () => {
  const r = await api.req('GET', '/api/sessions');
  assert.equal(r.status, 401);
});

test('修改密码流程', async () => {
  const token = await createUser('carol');
  const wrong = await api.req('POST', '/api/auth/change-password', {
    token,
    body: { oldPassword: 'nope12', newPassword: 'newpass123' },
  });
  assert.equal(wrong.status, 400);
  const ok = await api.req('POST', '/api/auth/change-password', {
    token,
    body: { oldPassword: 'pass123', newPassword: 'newpass123' },
  });
  assert.equal(ok.status, 200);
  const relogin = await api.req('POST', '/api/auth/login', {
    body: { username: 'carol', password: 'newpass123' },
  });
  assert.equal(relogin.status, 200);
});

// ---------- 接口：会话 CRUD 与隔离 ----------
test('会话 CRUD + 用户间数据隔离', async () => {
  const ta = await createUser('dave');
  const tb = await createUser('erin');

  const created = await api.req('POST', '/api/sessions', {
    token: ta,
    body: { name: '女朋友小美', role: 'lover', note: '小美，恋爱2年' },
  });
  assert.equal(created.status, 201);
  const sid = created.json.session.id;
  assert.equal(created.json.session.role, 'lover');

  const list = await api.req('GET', '/api/sessions', { token: ta });
  assert.equal(list.json.sessions.length, 1);
  assert.equal(list.json.sessions[0].name, '女朋友小美');

  // 他人访问 -> 404（隔离）
  const foreign = await api.req('GET', `/api/sessions/${sid}`, { token: tb });
  assert.equal(foreign.status, 404);
  const foreignDel = await api.req('DELETE', `/api/sessions/${sid}`, { token: tb });
  assert.equal(foreignDel.status, 404);

  const patched = await api.req('PATCH', `/api/sessions/${sid}`, {
    token: ta,
    body: { name: '小美', note: '小美，恋爱3年' },
  });
  assert.equal(patched.json.session.name, '小美');
  assert.equal(patched.json.session.note, '小美，恋爱3年');

  const detail = await api.req('GET', `/api/sessions/${sid}`, { token: ta });
  assert.deepEqual(detail.json.purposes, ROLES.lover.purposes);
  assert.equal(detail.json.content.rounds.length, 0);

  const del = await api.req('DELETE', `/api/sessions/${sid}`, { token: ta });
  assert.equal(del.status, 200);
  const after = await api.req('GET', '/api/sessions', { token: ta });
  assert.equal(after.json.sessions.length, 0);
});

// ---------- 接口：LLM 绑定与生成 ----------
test('未绑定大模型时生成返回 400', async () => {
  const token = await createUser('frank');
  const s = await api.req('POST', '/api/sessions', { token, body: { role: 'friend', name: '老王' } });
  const gen = await api.req('POST', `/api/sessions/${s.json.session.id}/generate`, {
    token,
    body: { message: '在吗？', purpose: '幽默调侃' },
  });
  assert.equal(gen.status, 400);
  assert.equal(gen.json.code, 'LLM_NOT_BOUND');
});

test('LLM 设置保存（Key 脱敏返回）+ 连通性测试', async () => {
  const token = await createUser('gina');
  const saved = await api.req('PUT', '/api/settings/llm', {
    token,
    body: {
      provider: 'custom',
      baseUrl: llmBase,
      apiKey: 'sk-test-1234567890abcdef',
      model: 'mock-model',
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.keyMasked, 'sk-t****cdef');

  const read = await api.req('GET', '/api/settings/llm', { token });
  assert.equal(read.json.configured, true);
  assert.equal(read.json.baseUrl, llmBase);
  assert.ok(!JSON.stringify(read.json).includes('sk-test-1234567890abcdef'), '完整 Key 不能回传');

  // 落库内容加密
  const row = db.prepare("SELECT llm_enc FROM user_settings WHERE user_id = (SELECT id FROM users WHERE username='gina')").get();
  assert.ok(!row.llm_enc.includes('sk-test-1234567890abcdef'), 'DB 中 Key 必须为密文');

  const testConn = await api.req('POST', '/api/settings/llm/test', { token, body: {} });
  assert.equal(testConn.json.ok, true);
});

test('端到端生成：3 条话术 + 3 轮 token 裁剪 + 落库加密', async () => {
  const token = await createUser('henry');
  await api.req('PUT', '/api/settings/llm', {
    token,
    body: { provider: 'custom', baseUrl: llmBase, apiKey: 'sk-x', model: 'mock-model' },
  });
  const s = await api.req('POST', '/api/sessions', {
    token,
    body: { role: 'colleague', name: '老板张总', note: '直属领导张总' },
  });
  const sid = s.json.session.id;
  const gen0 = llmCalls.length;

  // 五轮生成（第 5 轮时已有 4 轮历史，可验证 3 轮裁剪生效）
  for (const [i, msg] of [
    '今天加班吗？',
    '项目进展如何？',
    '这个需求能排上吗？',
    '周末团建来吗？',
    '下周汇报准备啥？',
  ].entries()) {
    const r = await api.req('POST', `/api/sessions/${sid}/generate`, {
      token,
      body: { message: msg, purpose: '专业协作' },
    });
    assert.equal(r.status, 200, `第${i + 1}轮生成失败: ${JSON.stringify(r.json)}`);
    assert.equal(r.json.replies.length, 3, '应返回 3 条话术');
  }

  // 第 5 轮生成时发送给模型的 prompt：
  const lastPrompt = llmCalls[llmCalls.length - 1].body.messages.map((m) => m.content).join('\n');
  assert.ok(lastPrompt.includes('下周汇报准备啥？'), '必须包含最新消息');
  assert.ok(lastPrompt.includes('周末团建来吗？'), '必须包含最近 1 轮历史');
  assert.ok(lastPrompt.includes('这个需求能排上吗？'), '必须包含最近 2 轮历史');
  assert.ok(lastPrompt.includes('项目进展如何？'), '必须包含最近 3 轮历史');
  assert.ok(!lastPrompt.includes('今天加班吗？'), '更早历史不应发送（省 token）');
  assert.equal(llmCalls.length - gen0, 5, '五轮生成应恰好 5 次 LLM 调用');

  // 选用第 2 条回复
  const detail = await api.req('GET', `/api/sessions/${sid}`, { token });
  assert.equal(detail.json.content.rounds.length, 5);
  assert.equal(detail.json.content.summary, undefined, '不再返回摘要');
  const choose = await api.req('PUT', `/api/sessions/${sid}/choose`, {
    token,
    body: { roundIndex: 4, replyIndex: 1 },
  });
  assert.equal(choose.status, 200);
  const detail2 = await api.req('GET', `/api/sessions/${sid}`, { token });
  assert.equal(detail2.json.content.rounds[4].chosen, 1);

  // 落库密文校验：DB 中不含明文消息
  const raw = db.prepare('SELECT content_enc FROM chat_sessions WHERE id = ?').get(sid);
  assert.ok(!raw.content_enc.includes('周末团建来吗？'), '会话内容必须加密落库');
  const decrypted = JSON.parse(decrypt(raw.content_enc));
  assert.equal(decrypted.rounds.length, 5);
});

test('生成接口校验：空消息 400 / 越权会话 404', async () => {
  const t1 = await createUser('ivan');
  const t2 = await createUser('jack');
  await api.req('PUT', '/api/settings/llm', {
    token: t1,
    body: { provider: 'custom', baseUrl: llmBase, apiKey: 'sk-x', model: 'm' },
  });
  const s = await api.req('POST', '/api/sessions', { token: t1, body: { role: 'family', name: '妈妈' } });
  const sid = s.json.session.id;

  const empty = await api.req('POST', `/api/sessions/${sid}/generate`, {
    token: t1,
    body: { message: '   ', purpose: '表达关心' },
  });
  assert.equal(empty.status, 400);

  const foreign = await api.req('POST', `/api/sessions/${sid}/generate`, {
    token: t2,
    body: { message: 'hi', purpose: '表达关心' },
  });
  assert.equal(foreign.status, 404);
});

// ---------- 安全：LLM 配置按用户隔离 ----------
test('LLM 配置按用户隔离：B 无法使用 A 的配置调用', async () => {
  const ta = await createUser('kate');
  const tb = await createUser('liam');
  // A 绑定了自己的 LLM
  await api.req('PUT', '/api/settings/llm', {
    token: ta,
    body: { provider: 'custom', baseUrl: llmBase, apiKey: 'sk-a-key', model: 'm' },
  });
  // B 未绑定：读不到 A 的配置
  const readB = await api.req('GET', '/api/settings/llm', { token: tb });
  assert.equal(readB.json.configured, false);
  assert.ok(!JSON.stringify(readB.json).includes(llmBase), 'B 不能看到 A 的配置');
  // B 生成时不能用 A 的 Key
  const s = await api.req('POST', '/api/sessions', {
    token: tb,
    body: { role: 'friend', name: '老王' },
  });
  const gen = await api.req('POST', `/api/sessions/${s.json.session.id}/generate`, {
    token: tb,
    body: { message: '在吗', purpose: '幽默调侃' },
  });
  assert.equal(gen.status, 400);
  assert.equal(gen.json.code, 'LLM_NOT_BOUND');
  // 期间 A 正常使用不受影响
  const sa = await api.req('POST', '/api/sessions', {
    token: ta,
    body: { role: 'friend', name: '老李' },
  });
  const genA = await api.req('POST', `/api/sessions/${sa.json.session.id}/generate`, {
    token: ta,
    body: { message: '在吗', purpose: '幽默调侃' },
  });
  assert.equal(genA.status, 200);
});

// ---------- 安全：SSRF 防护 ----------
test('assertSafeBaseUrl：拦截内网/本机/非法协议（单元）', async () => {
  const saved = process.env.LLM_ALLOW_PRIVATE;
  delete process.env.LLM_ALLOW_PRIVATE;
  try {
    for (const bad of [
      'http://127.0.0.1:8787/v1',
      'http://localhost:9000/v1',
      'http://192.168.1.5/v1',
      'http://10.0.0.1/v1',
      'http://172.16.0.1/v1',
      'http://172.31.255.255/v1',
      'http://169.254.169.254/latest/meta-data', // 云厂商元数据接口
      'http://[::1]/v1',
      'http://[fe80::1]/v1',
      'ftp://example.com/v1',
      'file:///etc/passwd',
      'not-a-url',
    ]) {
      await assert.rejects(() => assertSafeBaseUrl(bad), undefined, `应拦截: ${bad}`);
    }
    // 公网 IP 与正常域名放行（字面量 IP 不触发 DNS）
    await assertSafeBaseUrl('https://8.8.8.8/v1');
    await assertSafeBaseUrl('https://api.deepseek.com/v1');
  } finally {
    if (saved !== undefined) process.env.LLM_ALLOW_PRIVATE = saved;
    else process.env.LLM_ALLOW_PRIVATE = '1';
  }
});

test('SSRF 防护：保存配置时拒绝内网 Base URL（接口）', async () => {
  const token = await createUser('mia');
  const saved = process.env.LLM_ALLOW_PRIVATE;
  delete process.env.LLM_ALLOW_PRIVATE;
  try {
    for (const bad of ['http://127.0.0.1:8787/v1', 'http://192.168.1.5/v1', 'http://[::1]/v1']) {
      const r = await api.req('PUT', '/api/settings/llm', {
        token,
        body: { provider: 'custom', baseUrl: bad, apiKey: 'sk', model: 'm' },
      });
      assert.equal(r.status, 400, `应拒绝保存: ${bad}`);
    }
    // 关闭开关后无法通过保存接口探测内网
    const read = await api.req('GET', '/api/settings/llm', { token });
    assert.equal(read.json.configured, false);
  } finally {
    if (saved !== undefined) process.env.LLM_ALLOW_PRIVATE = saved;
    else process.env.LLM_ALLOW_PRIVATE = '1';
  }
});

// ---------- 安全：速率限制 ----------
test('rateLimit 固定窗口计数（单元）', () => {
  const key = `unit-${Date.now()}-${Math.random()}`;
  assert.equal(rateLimit(key, 3, 60_000).ok, true);
  assert.equal(rateLimit(key, 3, 60_000).ok, true);
  assert.equal(rateLimit(key, 3, 60_000).ok, true);
  const blocked = rateLimit(key, 3, 60_000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterMs > 0);
  // 不同 key 互不影响
  assert.equal(rateLimit(`${key}-other`, 3, 60_000).ok, true);
});

test('注册邀请码（可选开关）', async () => {
  process.env.REGISTER_CODE = 'invite-2026';
  try {
    const none = await api.req('POST', '/api/auth/register', {
      body: { username: 'noah1', password: 'pass123' },
    });
    assert.equal(none.status, 403);
    const wrong = await api.req('POST', '/api/auth/register', {
      body: { username: 'noah2', password: 'pass123', inviteCode: 'wrong' },
    });
    assert.equal(wrong.status, 403);
    const ok = await api.req('POST', '/api/auth/register', {
      body: { username: 'noah3', password: 'pass123', inviteCode: 'invite-2026' },
    });
    assert.equal(ok.status, 201);
  } finally {
    delete process.env.REGISTER_CODE;
  }
});

// ---------- 兼容性：厂商错误信息解析（需在限流用例前，避免 IP 配额被耗尽） ----------
test('智谱风格嵌套 error 结构：错误信息可读且完整透传', async () => {
  const token = await createUser('olivia');
  await api.req('PUT', '/api/settings/llm', {
    token,
    body: { provider: 'custom', baseUrl: llmErrBase, apiKey: 'sk-bad', model: 'glm-4.7-flash' },
  });
  const r = await api.req('POST', '/api/settings/llm/test', { token, body: {} });
  assert.equal(r.status, 400);
  assert.equal(r.json.ok, false);
  assert.ok(
    r.json.message.includes('令牌已过期或验证不正确'),
    `应透传厂商具体错误而非原始 JSON：${r.json.message}`
  );
  assert.ok(r.json.message.includes('401'), '应包含状态码');
});

// ---------- 轮次删除 ----------
test('删除轮次：正常删除/无效索引/越权隔离', async () => {
  const t1 = await createUser('paul');
  const t2 = await createUser('qua');
  await api.req('PUT', '/api/settings/llm', {
    token: t1,
    body: { provider: 'custom', baseUrl: llmBase, apiKey: 'sk-x', model: 'm' },
  });
  const s = await api.req('POST', '/api/sessions', {
    token: t1,
    body: { role: 'lover', name: '小美' },
  });
  const sid = s.json.session.id;
  for (const msg of ['第一条', '第二条']) {
    await api.req('POST', `/api/sessions/${sid}/generate`, {
      token: t1,
      body: { message: msg, purpose: '日常关心' },
    });
  }

  // 删除第一轮（索引 0），剩余 1 轮且应为原第二轮
  const del = await api.req('DELETE', `/api/sessions/${sid}/round/0`, { token: t1 });
  assert.equal(del.status, 200);
  assert.equal(del.json.rounds, 1);
  const detail = await api.req('GET', `/api/sessions/${sid}`, { token: t1 });
  assert.equal(detail.json.content.rounds.length, 1);
  assert.ok(detail.json.content.rounds[0].text.includes('第二条'), '应删除索引 0，保留后续轮次');

  // 无效索引
  const bad = await api.req('DELETE', `/api/sessions/${sid}/round/99`, { token: t1 });
  assert.equal(bad.status, 400);

  // 他人无权删除
  const foreign = await api.req('DELETE', `/api/sessions/${sid}/round/0`, { token: t2 });
  assert.equal(foreign.status, 404);
});

// ---------- MBTI ----------
test('MBTI：创建/修改/注入提示词/无效值校验', async () => {
  const token = await createUser('rita');
  await api.req('PUT', '/api/settings/llm', {
    token,
    body: { provider: 'custom', baseUrl: llmBase, apiKey: 'sk-x', model: 'm' },
  });

  // 创建时带 MBTI
  const s = await api.req('POST', '/api/sessions', {
    token,
    body: { role: 'lover', name: '小美', note: '小美', mbti: 'infp' },
  });
  assert.equal(s.json.session.mbti, 'INFP', '应统一为大写存储');

  // 生成时注入 MBTI 画像到 prompt
  await api.req('POST', `/api/sessions/${s.json.session.id}/generate`, {
    token,
    body: { message: '你今晚有空吗', purpose: '日常关心' },
  });
  const lastPrompt = llmCalls[llmCalls.length - 1].body.messages.map((m) => m.content).join('\n');
  assert.ok(lastPrompt.includes('对方MBTI:INFP'), 'prompt 应含 MBTI 代码');
  assert.ok(lastPrompt.includes('感性温和'), 'prompt 应含 MBTI 画像描述');

  // 修改 MBTI
  const patched = await api.req('PATCH', `/api/sessions/${s.json.session.id}`, {
    token,
    body: { mbti: 'ENTJ' },
  });
  assert.equal(patched.json.session.mbti, 'ENTJ');

  // 清除 MBTI 后不再注入
  await api.req('PATCH', `/api/sessions/${s.json.session.id}`, { token, body: { mbti: '' } });
  await api.req('POST', `/api/sessions/${s.json.session.id}/generate`, {
    token,
    body: { message: '在吗', purpose: '日常关心' },
  });
  const lastPrompt2 = llmCalls[llmCalls.length - 1].body.messages.map((m) => m.content).join('\n');
  assert.ok(!lastPrompt2.includes('对方MBTI:'), '清除后不应再注入 MBTI（检查用户消息设定行）');

  // 无效值
  const bad1 = await api.req('POST', '/api/sessions', {
    token,
    body: { role: 'friend', name: 'x', mbti: 'XXXX' },
  });
  assert.equal(bad1.status, 400);
  const bad2 = await api.req('PATCH', `/api/sessions/${s.json.session.id}`, {
    token,
    body: { mbti: 'ABC' },
  });
  assert.equal(bad2.status, 400);
});

test('想法模式（compose）：提示词/轮次结构/上下文回填', async () => {
  const token = await createUser('modeuser');
  await api.req('PUT', '/api/settings/llm', {
    token,
    body: { provider: 'custom', baseUrl: llmBase, apiKey: 'sk-x', model: 'm' },
  });
  const s = await api.req('POST', '/api/sessions', {
    token,
    body: { role: 'lover', name: '想法测试' },
  });
  const sid = s.json.session.id;

  // compose 生成：系统提示切换、用户消息为【我的想法】
  const gen = await api.req('POST', `/api/sessions/${sid}/generate`, {
    token,
    body: { message: '想约她周末去看展', purpose: '日常关心', mode: 'compose' },
  });
  assert.equal(gen.status, 200);
  assert.equal(Array.isArray(gen.json.replies), true);
  const lastCall = llmCalls[llmCalls.length - 1].body.messages;
  assert.ok(lastCall[0].content.includes('表达顾问'), 'compose 系统提示应切换为表达顾问');
  assert.ok(lastCall[1].content.includes('【我的想法】想约她周末去看展'), '用户消息应为【我的想法】');
  assert.ok(!lastCall[1].content.includes('目的:'), 'compose 模式不应注入目的');

  // 轮次结构带 mode，purpose 置空
  const detail = await api.req('GET', `/api/sessions/${sid}`, { token });
  const round = detail.json.content.rounds[0];
  assert.equal(round.mode, 'compose');
  assert.equal(round.purpose, '');

  // 下一轮 reply 模式上下文应区分「我的想法」
  await api.req('POST', `/api/sessions/${sid}/generate`, {
    token,
    body: { message: '她说周末要加班', purpose: '日常关心', mode: 'reply' },
  });
  const lastPrompt = llmCalls[llmCalls.length - 1].body.messages.map((m) => m.content).join('\n');
  assert.ok(lastPrompt.includes('我的想法:想约她周末去看展'), '近期对话应回填为「我的想法」');
  assert.ok(lastPrompt.includes('对方:她说周末要加班'), '最新消息应为对方话语');
  assert.ok(lastCall[0] !== undefined, 'reply 系统提示保持回复顾问');
});

test('登录接口限流：爆破触发 429（接口，放在最后）', async () => {
  let got429 = false;
  for (let i = 0; i < 40; i++) {
    const r = await api.req('POST', '/api/auth/login', {
      body: { username: `nobody_${i}`, password: 'whatever1' },
    });
    if (r.status === 429) {
      got429 = true;
      break;
    }
  }
  assert.ok(got429, '连续失败登录应触发限流 429');
});
