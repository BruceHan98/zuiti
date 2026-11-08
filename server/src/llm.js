/**
 * OpenAI 兼容协议的 LLM 客户端（支持 OpenAI / DeepSeek / Moonshot / 智谱 / 自定义）。
 * settings: { provider, baseUrl, apiKey, model }
 */
import { assertSafeBaseUrl } from './security.js';

export const LLM_PRESETS = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  moonshot: { label: 'Moonshot (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  zhipu: { label: '智谱 (GLM)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  custom: { label: '自定义（OpenAI 兼容）', baseUrl: '', model: '' },
};

/**
 * 宽松地从模型输出中提取 JSON 对象（容忍 ```json 围栏、前后闲聊）。
 */
export function parseJSONLoose(text) {
  if (!text) throw new Error('模型返回为空');
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('模型未返回有效 JSON');
  return JSON.parse(t.slice(start, end + 1));
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

/** 从错误响应中提取可读信息，兼容各厂商错误结构 */
async function extractErrorDetail(res) {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      // 智谱/OpenAI: {"error":{"code","message"}}；部分厂商: {"message"} 或 {"msg"}
      detail = j?.error?.message || j?.message || j?.msg || '';
    } catch {
      /* 非 JSON */
    }
    if (!detail) detail = text.slice(0, 200);
  } catch {
    /* ignore */
  }
  return `大模型服务返回 ${res.status}：${detail || res.statusText}`;
}

/**
 * 底层请求 /chat/completions。返回原始 Response（已做 SSRF 校验）。
 */
async function requestChatCompletions(settings, payload) {
  const base = normalizeBaseUrl(settings.baseUrl);
  if (!base || !settings.apiKey || !settings.model) {
    const err = new Error('大模型配置不完整，请先在设置中绑定');
    err.code = 'LLM_NOT_CONFIGURED';
    throw err;
  }
  // SSRF 防护：发起请求前兜底校验（即使绕过了保存校验）
  await assertSafeBaseUrl(base);
  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    const err = new Error(`无法连接大模型服务：${e.message}`);
    err.code = 'LLM_NETWORK';
    throw err;
  }
  if (!res.ok) {
    const err = new Error(await extractErrorDetail(res));
    err.code = res.status === 401 || res.status === 403 ? 'LLM_AUTH' : 'LLM_HTTP';
    throw err;
  }
  return res;
}

/**
 * 调用 /chat/completions 并解析回复。
 * 返回 { content, usage }；失败抛出带 code 的 Error。
 */
export async function chatComplete(settings, { system, user, maxTokens = 1400, temperature = 0.8 }) {
  const res = await requestChatCompletions(settings, {
    model: settings.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    // 默认值留足推理型模型（GLM-4.5+/DeepSeek-R1）的思考 token 余量
    max_tokens: maxTokens,
    temperature,
  });
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    const err = new Error('大模型返回内容为空（推理型模型可能思考超时，请重试）');
    err.code = 'LLM_EMPTY';
    throw err;
  }
  return { content, usage: data.usage || null };
}

/**
 * 连通性测试：一次极小请求，仅验证端点/Key/模型有效。
 * HTTP 2xx 即视为成功（不校验内容：推理型模型可能只返回思考过程）。
 */
export async function testConnection(settings) {
  await requestChatCompletions(settings, {
    model: settings.model,
    messages: [{ role: 'user', content: 'hi' }],
    // 推理型模型（如 GLM-4.5+）默认带思考过程，max_tokens 过小会直接失败
    max_tokens: 64,
    temperature: 0,
  });
  return '连接成功，模型响应正常';
}
