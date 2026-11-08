import { useState } from 'react';
import { api, setToken } from '../api.js';

export default function LoginView({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const fn = mode === 'login' ? api.login : api.register;
      const res = await fn(username.trim(), password);
      setToken(res.token);
      onLogin(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-icon">💬</div>
          <h1>回话助手</h1>
        </div>
        <p className="auth-sub">AI 帮你想好怎么回复每一条消息</p>

        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>
            登录
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>
            注册
          </button>
        </div>

        <form onSubmit={submit}>
          {error && <div className="error-tip">{error}</div>}
          <div className="field">
            <label>用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="2-32 个字符"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>
          <button className="btn btn-primary btn-block" disabled={loading || !username.trim() || !password}>
            {loading ? '请稍候…' : mode === 'login' ? '登录' : '创建账号'}
          </button>
        </form>
      </div>
    </div>
  );
}
