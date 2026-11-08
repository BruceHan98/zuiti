import { ROLES } from '../constants.js';

function timeLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export default function Sidebar({
  open,
  sessions,
  activeId,
  user,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onOpenSettings,
  onLogout,
}) {
  return (
    <>
      {open && <div className="sidebar-mask" onClick={() => onSelect(null, true)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-head">
          <div className="logo-icon">💬</div>
          <h1>回话助手</h1>
        </div>

        <button className="btn btn-primary new-chat-btn" onClick={onNew}>
          ＋ 新建会话
        </button>

        <div className="session-list">
          {sessions.length === 0 && (
            <div className="session-empty">还没有会话<br />点击上方「新建会话」开始</div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`session-item ${s.id === activeId ? 'active' : ''}`}
              onClick={() => onSelect(s.id)}
            >
              <span className="session-emoji">{ROLES[s.role]?.emoji || '💬'}</span>
              <div className="session-meta">
                <div className="session-name">{s.name}</div>
                <div className="session-sub">
                  {ROLES[s.role]?.label || s.role} · {timeLabel(s.updatedAt)}
                </div>
              </div>
              <div className="session-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="icon-btn"
                  title="重命名"
                  onClick={() => onRename(s)}
                >
                  ✎
                </button>
                <button
                  className="icon-btn danger"
                  title="删除"
                  onClick={() => onDelete(s)}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-foot">
          <div className="avatar">{(user?.username || '?').slice(0, 1).toUpperCase()}</div>
          <div className="username">{user?.username}</div>
          <button className="icon-btn" title="设置" onClick={onOpenSettings}>
            ⚙️
          </button>
          <button className="icon-btn danger" title="退出登录" onClick={onLogout}>
            ⏻
          </button>
        </div>
      </aside>
    </>
  );
}
