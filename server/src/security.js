import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/* ============================================================
 * SSRF 防护：校验用户提交的 LLM Base URL 不指向内网/本机
 * ============================================================ */

function isPrivateIPv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export function isPrivateIp(ip) {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
    if (/^fe[89ab]/.test(lower)) return true; // link-local
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return false;
  }
  return false;
}

/**
 * 校验 Base URL：仅允许 http(s)，且解析出的地址不得为内网/本机。
 * 自部署场景确需访问本机 LLM（如 ollama）时，可设 LLM_ALLOW_PRIVATE=1 放行。
 */
export async function assertSafeBaseUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw new Error('Base URL 格式无效');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Base URL 仅支持 http/https 协议');
  }
  if (process.env.LLM_ALLOW_PRIVATE === '1') return url;

  // 收集需要检查的地址：字面量主机名 + DNS 解析结果（防域名指向内网）
  const hosts = [url.hostname.replace(/^\[|\]$/g, '')];
  if (isIP(hosts[0]) === 0) {
    try {
      const addrs = await lookup(hosts[0], { all: true });
      hosts.push(...addrs.map((a) => a.address));
    } catch {
      // 域名解析失败：交给后续 fetch 报错即可
    }
  }
  for (const h of hosts) {
    if (isPrivateIp(h)) {
      throw new Error('Base URL 不允许指向内网/本机地址');
    }
  }
  return url;
}

/* ============================================================
 * 速率限制：进程内固定窗口计数器（自部署单实例足够）
 * ============================================================ */

const buckets = new Map();
let lastSweep = Date.now();

function sweep(now) {
  for (const [key, b] of buckets) {
    if (now - b.start > 30 * 60_000) buckets.delete(key);
  }
}

export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    sweep(now);
    lastSweep = now;
  }
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.start + windowMs) {
    bucket = { start: now, count: 0 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterMs: bucket.start + windowMs - now };
  }
  return { ok: true };
}

export function clientIp(req) {
  return req.socket?.remoteAddress || 'unknown';
}

export function rateLimitMiddleware(name, { limit, windowMs, keyFn }) {
  return (req, res, next) => {
    const result = rateLimit(`${name}:${keyFn(req)}`, limit, windowMs);
    if (!result.ok) {
      return res
        .status(429)
        .set('Retry-After', String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))))
        .json({ error: '请求过于频繁，请稍后再试' });
    }
    next();
  };
}

/** 从环境变量读取限流阈值（0 表示关闭该限流） */
export function envLimit(name, defaultValue) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : defaultValue;
}
