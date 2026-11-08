import { useState } from 'react';
import { ROLE_KEYS, ROLES } from '../constants.js';
import MbtiGrid from './MbtiGrid.jsx';

export default function NewSessionModal({ onClose, onCreate }) {
  const [role, setRole] = useState('lover');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [mbti, setMbti] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    setLoading(true);
    try {
      await onCreate({ name: name.trim(), role, note: note.trim(), mbti });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>新建会话</h2>
        <p className="modal-sub">为一段关系建立独立会话，AI 将记住其风格保持一致</p>

        <div className="field">
          <label>对方与你的关系</label>
          <div className="role-grid">
            {ROLE_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className={`role-card ${role === k ? 'active' : ''}`}
                onClick={() => setRole(k)}
              >
                <div className="re">{ROLES[k].emoji}</div>
                <div className="rl">{ROLES[k].label}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>会话名称</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`如：${ROLES[role].label === '恋人' ? '女朋友·小美' : ROLES[role].label + '·某某'}`}
            autoFocus
          />
        </div>

        <div className="field">
          <label>对方背景备注（可选）</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="如：小美，恋爱 2 年，喜欢被哄，讨厌讲道理"
            rows={2}
            style={{ resize: 'none' }}
          />
        </div>

        <div className="field">
          <label>对方 MBTI（可选，让回复更贴合 TA 的性格）</label>
          <MbtiGrid value={mbti} onChange={setMbti} />
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}
