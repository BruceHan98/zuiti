import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { ROLES } from './constants.js';
import LoginView from './components/LoginView.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatPane from './components/ChatPane.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import NewSessionModal from './components/NewSessionModal.jsx';
import MbtiPickerModal from './components/MbtiPickerModal.jsx';
import RenameModal from './components/RenameModal.jsx';
import { IconEdit, IconMenu, IconPuzzle } from './components/Icons.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeDetail, setActiveDetail] = useState(null); // {session, content}
  const [generating, setGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNewSession, setShowNewSession] = useState(false);
  const [showMbtiPicker, setShowMbtiPicker] = useState(false);
  const [renaming, setRenaming] = useState(null); // 待重命名的会话对象
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);
  const [regenerating, setRegenerating] = useState(null); // 重新生成中的轮次索引
  const toastTimer = useRef(null);

  const notify = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2000);
  }, []);

  // 启动：恢复登录态
  useEffect(() => {
    if (!getToken()) {
      setBooting(false);
      return;
    }
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  const refreshSessions = useCallback(async () => {
    const res = await api.listSessions();
    setSessions(res.sessions);
    return res.sessions;
  }, []);

  useEffect(() => {
    if (user) refreshSessions().catch(() => {});
  }, [user, refreshSessions]);

  async function openSession(id) {
    setActiveId(id);
    setSidebarOpen(false);
    setActiveDetail(null);
    try {
      const res = await api.getSession(id);
      setActiveDetail(res);
    } catch (e) {
      notify(e.message);
    }
  }

  async function handleCreateSession({ name, role, note, mbti }) {
    try {
      const res = await api.createSession(name, role, note, mbti);
      setShowNewSession(false);
      await refreshSessions();
      await openSession(res.session.id);
    } catch (e) {
      notify(e.message);
    }
  }

  /** 保存会话重命名（RenameModal 回调） */
  async function handleRenameSave(name) {
    try {
      await api.updateSession(renaming.id, { name });
      await refreshSessions();
      if (renaming.id === activeId) await openSession(renaming.id);
      notify('会话已重命名');
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    }
  }

  /** 保存当前会话的对方 MBTI（单选弹窗回调） */
  async function handleSaveMbti(val) {
    try {
      await api.updateSession(activeId, { mbti: val });
      setActiveDetail((prev) => ({
        ...prev,
        session: { ...prev.session, mbti: val },
      }));
      refreshSessions().catch(() => {});
      notify(val ? `已设定对方 MBTI：${val}` : '已清除 MBTI 设定');
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    }
  }

  async function handleDelete(s) {
    if (!window.confirm(`确定删除会话「${s.name}」？历史记录将一并删除。`)) return;
    try {
      await api.deleteSession(s.id);
      const rest = await refreshSessions();
      if (s.id === activeId) {
        setActiveId(null);
        setActiveDetail(null);
        if (rest.length) openSession(rest[0].id);
      }
    } catch (e) {
      notify(e.message);
    }
  }

  async function handleGenerate(message, purpose, mode) {
    if (!activeId || generating) return false;
    setGenerating(true);
    setCopiedKey(null);
    try {
      const res = await api.generate(activeId, message, purpose, mode);
      // 本地立即追加这一轮，避免整页刷新
      setActiveDetail((prev) => ({
        ...prev,
        content: {
          rounds: [
            ...(prev?.content?.rounds || []),
            { text: message, purpose: mode === 'compose' ? '' : purpose, mode, replies: res.replies, chosen: null, ts: Date.now() },
          ],
        },
      }));
      refreshSessions().catch(() => {});
      return true;
    } catch (e) {
      // 失败时返回 false：输入框保留内容，方便修改后重试
      notify(e.message);
      if (e.code === 'LLM_NOT_BOUND') setShowSettings(true);
      return false;
    } finally {
      setGenerating(false);
    }
  }

  /** 复制即选用：写入剪贴板后同时标记为实际发送的回复 */
  async function handleCopy(roundIndex, replyIndex) {
    const round = activeDetail?.content?.rounds?.[roundIndex];
    if (!round) return;
    const text = round.replies[replyIndex];
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopiedKey(`${roundIndex}-${replyIndex}`);
    // 同步标记选用（失败不影响复制体验）
    try {
      await api.chooseReply(activeId, roundIndex, replyIndex);
      setActiveDetail((prev) => {
        const rounds = [...(prev?.content?.rounds || [])];
        if (rounds[roundIndex]) rounds[roundIndex] = { ...rounds[roundIndex], chosen: replyIndex };
        return { ...prev, content: { ...prev.content, rounds } };
      });
    } catch {
      /* 标记失败仅静默 */
    }
    notify('已复制，并标记为选用');
  }

  /** 删除某一轮记录；silent 时不弹「已删除」提示（用于编辑回填场景） */
  async function handleDeleteRound(roundIndex, { silent } = {}) {
    try {
      await api.deleteRound(activeId, roundIndex);
      setActiveDetail((prev) => {
        const rounds = [...(prev?.content?.rounds || [])];
        rounds.splice(roundIndex, 1);
        return { ...prev, content: { ...prev.content, rounds } };
      });
      if (!silent) notify('记录已删除');
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    }
  }

  /** 重新生成某一轮回复：原地替换该轮 3 条回复 */
  async function handleRegenerate(roundIndex) {
    if (!activeId || generating || regenerating != null) return;
    setRegenerating(roundIndex);
    setCopiedKey(null);
    try {
      const res = await api.regenerate(activeId, roundIndex);
      setActiveDetail((prev) => {
        const rounds = [...(prev?.content?.rounds || [])];
        if (rounds[roundIndex]) {
          rounds[roundIndex] = {
            ...rounds[roundIndex],
            replies: res.replies,
            chosen: null,
          };
        }
        return { ...prev, content: { ...prev.content, rounds } };
      });
      notify('已重新生成 3 条回复');
      return true;
    } catch (e) {
      notify(e.message);
      if (e.code === 'LLM_NOT_BOUND') setShowSettings(true);
      return false;
    } finally {
      setRegenerating(null);
    }
  }

  function handleLogout() {
    setToken(null);
    setUser(null);
    setSessions([]);
    setActiveId(null);
    setActiveDetail(null);
    setShowSettings(false);
  }

  if (booting) {
    return (
      <div className="loading-block" style={{ height: '100vh' }}>
        <span className="spinner" /> 加载中…
      </div>
    );
  }

  if (!user) {
    return <LoginView onLogin={setUser} />;
  }

  const session = activeDetail?.session;

  return (
    <div className="app">
      <Sidebar
        open={sidebarOpen}
        sessions={sessions}
        activeId={activeId}
        user={user}
        onSelect={(id, closeOnly) => {
          if (closeOnly) setSidebarOpen(false);
          else if (id != null) openSession(id);
        }}
        onNew={() => setShowNewSession(true)}
        onDelete={handleDelete}
        onOpenSettings={() => setShowSettings(true)}
        onLogout={handleLogout}
      />

      <main className="main">
        <div className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setSidebarOpen(true)}>
            <IconMenu size={18} />
          </button>
          {session ? (
            <button
              className="title-btn"
              onClick={() => setRenaming(session)}
              title="点击修改会话名称"
            >
              <span className="t">{session.name}</span>
              <IconEdit size={13} className="t-edit" />
            </button>
          ) : (
            <span className="title">回话助手</span>
          )}
          {session && <span className="role-chip">{ROLES[session.role]?.label}</span>}
          {session && (
            <button
              className="role-chip mbti-chip-toggle"
              onClick={() => setShowMbtiPicker(true)}
              title="点击修改对方的 MBTI"
            >
              <IconPuzzle size={13} /> {session.mbti || 'MBTI'}
            </button>
          )}
          <span className="spacer" />
        </div>

        <ChatPane
          session={session}
          content={activeDetail?.content}
          generating={generating}
          onGenerate={handleGenerate}
          onCopy={handleCopy}
          onDeleteRound={handleDeleteRound}
          onRegenerate={handleRegenerate}
          regenerating={regenerating}
          onNotify={notify}
          copiedKey={copiedKey}
        />
      </main>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} onLogout={handleLogout} />
      )}
      {showNewSession && (
        <NewSessionModal onClose={() => setShowNewSession(false)} onCreate={handleCreateSession} />
      )}
      {showMbtiPicker && session && (
        <MbtiPickerModal
          current={session.mbti || ''}
          sessionName={session.name}
          onClose={() => setShowMbtiPicker(false)}
          onSave={handleSaveMbti}
        />
      )}
      {renaming && (
        <RenameModal
          current={renaming.name}
          onClose={() => setRenaming(null)}
          onSave={handleRenameSave}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
