import { useEffect, useRef, useState } from 'react';
import { IconEdit } from './Icons.jsx';

/** 点击主页面标题修改会话名称 */
export default function RenameModal({ current, onClose, onSave }) {
  const [name, setName] = useState(current || '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  async function save() {
    const n = name.trim();
    if (!n || saving) return;
    setSaving(true);
    try {
      const ok = await onSave(n);
      if (ok !== false) onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>重命名会话</h2>
        <p className="modal-sub">修改后侧边栏与顶栏同步更新</p>
        <div className="field">
          <label>会话名称</label>
          <input
            ref={inputRef}
            value={name}
            maxLength={50}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) save();
            }}
            placeholder="输入新的会话名称"
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? '保存中…' : <><IconEdit size={14} /> 保存</>}
          </button>
        </div>
      </div>
    </div>
  );
}
