import { useState } from 'react';
import MbtiGrid from './MbtiGrid.jsx';

/** 修改会话 MBTI 的单选弹窗 */
export default function MbtiPickerModal({ current, sessionName, onClose, onSave }) {
  const [value, setValue] = useState(current || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const ok = await onSave(value);
      if (ok !== false) onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>对方 MBTI</h2>
        <p className="modal-sub">{sessionName ? `「${sessionName}」` : ''}设定后，AI 将结合 TA 的性格生成让 TA 舒服的回复</p>
        <MbtiGrid value={value} onChange={setValue} />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
