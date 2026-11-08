import { useEffect, useState } from 'react';
import { api } from '../api.js';

function LLMSection() {
  const [presets, setPresets] = useState({});
  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keyMasked, setKeyMasked] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tip, setTip] = useState(null); // {type:'ok'|'err', text}

  useEffect(() => {
    api
      .getLLM()
      .then((res) => {
        setPresets(res.presets || {});
        if (res.configured) {
          setConfigured(true);
          setProvider(res.provider);
          setBaseUrl(res.baseUrl);
          setModel(res.model);
          setKeyMasked(res.keyMasked);
        } else {
          setProvider('deepseek');
          setBaseUrl(res.presets?.deepseek?.baseUrl || '');
          setModel(res.presets?.deepseek?.model || '');
        }
      })
      .catch((e) => setTip({ type: 'err', text: e.message }));
  }, []);

  function applyPreset(p) {
    setProvider(p);
    if (presets[p]) {
      setBaseUrl(presets[p].baseUrl);
      setModel(presets[p].model);
    }
  }

  async function save() {
    setSaving(true);
    setTip(null);
    try {
      const res = await api.saveLLM({ provider, baseUrl, apiKey: apiKey.trim(), model });
      setConfigured(true);
      setKeyMasked(res.keyMasked);
      setApiKey('');
      setTip({ type: 'ok', text: '配置已保存（API Key 已加密存储）' });
    } catch (e) {
      setTip({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTip(null);
    try {
      const res = await api.testLLM({ provider, baseUrl, apiKey: apiKey.trim(), model });
      setTip({ type: 'ok', text: res.message });
    } catch (e) {
      setTip({ type: 'err', text: e.message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="settings-section">
      <h3>
        <span className={`status-dot ${configured ? 'on' : 'off'}`} />
        大模型绑定 {configured ? '· 已绑定' : '· 未绑定'}
      </h3>
      {configured && keyMasked && (
        <p className="modal-sub">当前 Key：{keyMasked}（留空则保留）</p>
      )}
      <div className="field">
        <label>服务商</label>
        <select value={provider} onChange={(e) => applyPreset(e.target.value)}>
          {Object.entries(presets).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Base URL</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.deepseek.com/v1"
        />
      </div>
      <div className="field">
        <label>模型名称</label>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat" />
      </div>
      <div className="field">
        <label>API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={configured ? '已加密保存，留空不修改' : 'sk-…'}
        />
      </div>
      {tip && <div className={tip.type === 'ok' ? 'success-tip' : 'error-tip'}>{tip.text}</div>}
      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || !baseUrl || !model}>
          {saving ? '保存中…' : '保存'}
        </button>
        <button className="btn btn-ghost" onClick={test} disabled={testing || !baseUrl || !model}>
          {testing ? '测试中…' : '测试连通'}
        </button>
      </div>
    </div>
  );
}

function PasswordSection() {
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [loading, setLoading] = useState(false);
  const [tip, setTip] = useState(null);

  async function submit() {
    setLoading(true);
    setTip(null);
    try {
      await api.changePassword(oldPassword, newPassword);
      setOld('');
      setNew('');
      setTip({ type: 'ok', text: '密码已修改，下次登录请使用新密码' });
    } catch (e) {
      setTip({ type: 'err', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="settings-section">
      <h3>修改密码</h3>
      <div className="field">
        <label>旧密码</label>
        <input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} />
      </div>
      <div className="field">
        <label>新密码（≥6 位）</label>
        <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} />
      </div>
      {tip && <div className={tip.type === 'ok' ? 'success-tip' : 'error-tip'}>{tip.text}</div>}
      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={loading || !oldPassword || newPassword.length < 6}
        >
          {loading ? '修改中…' : '修改密码'}
        </button>
      </div>
    </div>
  );
}

export default function SettingsModal({ onClose, onLogout }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>设置</h2>
        <p className="modal-sub">绑定你自己的大模型账号，Key 加密存储在服务端</p>
        <LLMSection />
        <PasswordSection />
        <div className="settings-section">
          <h3>账号</h3>
          <button className="btn btn-danger-ghost" onClick={onLogout} style={{ width: '100%' }}>
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
