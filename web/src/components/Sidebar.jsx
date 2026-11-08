import { ROLES } from '../constants.js';
import { IconChat, IconEdit, IconLogout, IconPlus, IconSettings, IconTrash } from './Icons.jsx';

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
          <div className="logo-icon"><IconChat size={17} /></div>
          <h1>回话助手</h1>
        </div>

        <button className="btn btn-primary new-chat-btn" onClick={onNew}>
          <IconPlus size={15} /> 新建会话
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
              <span className="session-emoji">{ROLES[s.role]?.emoji || <IconChat size={15} />}</span>
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
                  <IconEdit size={14} />
                </button>
                <button
                  className="icon-btn danger"
                  title="删除"
                  onClick={() => onDelete(s)}
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-foot">
          <div className="avatar">{(user?.username || '?').slice(0, 1).toUpperCase()}</div>
          <div className="username">{user?.username}</div>
          <button className="icon-btn" title="设置" onClick={onOpenSettings}>
            <IconSettings size={16} />
          </button>
          <button className="icon-btn danger" title="退出登录" onClick={onLogout}>
            <IconLogout size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}
