const TOKEN_KEY = 'huichat_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new ApiError(
      json?.error || json?.message || `请求失败 (${res.status})`,
      res.status,
      json?.code
    );
  }
  return json;
}

export const api = {
  // 认证
  register: (username, password) => request('POST', '/auth/register', { username, password }),
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  me: () => request('GET', '/auth/me'),
  changePassword: (oldPassword, newPassword) =>
    request('POST', '/auth/change-password', { oldPassword, newPassword }),

  // 会话
  listSessions: () => request('GET', '/sessions'),
  createSession: (name, role, note, mbti) => request('POST', '/sessions', { name, role, note, mbti }),
  getSession: (id) => request('GET', `/sessions/${id}`),
  updateSession: (id, patch) => request('PATCH', `/sessions/${id}`, patch),
  deleteSession: (id) => request('DELETE', `/sessions/${id}`),
  generate: (id, message, purpose) => request('POST', `/sessions/${id}/generate`, { message, purpose }),
  chooseReply: (id, roundIndex, replyIndex) =>
    request('PUT', `/sessions/${id}/choose`, { roundIndex, replyIndex }),
  deleteRound: (id, roundIndex) => request('DELETE', `/sessions/${id}/round/${roundIndex}`),

  // 设置
  getLLM: () => request('GET', '/settings/llm'),
  saveLLM: (cfg) => request('PUT', '/settings/llm', cfg),
  testLLM: (cfg) => request('POST', '/settings/llm/test', cfg),
};
