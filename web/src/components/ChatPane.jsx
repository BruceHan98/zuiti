import { useEffect, useRef, useState } from 'react';
import { REPLY_STYLES, ROLES } from '../constants.js';

function ReplyCard({ reply, index, chosen, onCopy, copiedKey }) {
  const isCopied = copiedKey === index;
  const isChosen = chosen === index;
  return (
    <div className={`reply-card ${isChosen ? 'chosen' : ''}`}>
      {isChosen && <span className="chosen-badge">已选用</span>}
      <span className="reply-tag">
        <span className="tag-dot" />
        {String.fromCharCode(65 + index)} · {REPLY_STYLES[index] || '推荐'}
      </span>
      <div className="reply-text">{reply}</div>
      <button className={`copy-btn ${isCopied ? 'copied' : ''}`} onClick={() => onCopy(index)}>
        {isCopied ? '✓ 已复制选用' : '复制'}
      </button>
    </div>
  );
}

export default function ChatPane({
  session,
  content,
  generating,
  onGenerate,
  onCopy,
  onDeleteRound,
  onNotify,
  copiedKey,
}) {
  const [message, setMessage] = useState('');
  const [purpose, setPurpose] = useState(session ? ROLES[session.role].purposes[0] : '');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (session) setPurpose(ROLES[session.role].purposes[0]);
    setMessage('');
  }, [session?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [content?.rounds?.length, generating]);

  if (!session) {
    return (
      <div className="messages">
        <div className="empty-state">
          <div className="big">💭</div>
          <h3>开始一段对话</h3>
          <p>从左侧选择或新建一个会话</p>
        </div>
      </div>
    );
  }

  const rounds = content?.rounds || [];

  function submit() {
    const msg = message.trim();
    if (!msg || generating) return;
    // 失败时保留输入内容，仅在成功后清空
    Promise.resolve(onGenerate(msg, purpose)).then((ok) => {
      if (ok !== false) setMessage('');
    });
  }

  /** 删除某一轮记录 */
  async function deleteRound(ri) {
    if (generating) return;
    if (!window.confirm('确定删除这一轮记录？')) return;
    await onDeleteRound(ri);
  }

  /** 重新编辑：删除该轮并把内容回填输入框，可修改后重新生成 */
  async function editRound(ri) {
    if (generating) return;
    const round = rounds[ri];
    if (!round) return;
    const ok = await onDeleteRound(ri, { silent: true });
    if (ok === false) return;
    setMessage(round.text);
    if (round.purpose) setPurpose(round.purpose);
    onNotify?.('已回填到输入框，修改后可重新生成');
  }

  function clear() {
    setMessage('');
    setPurpose(ROLES[session.role].purposes[0]);
  }

  return (
    <>
      <div className="messages">
        <div className="messages-inner">
          {rounds.length === 0 && !generating && (
            <div className="empty-state">
              <div className="big">{ROLES[session.role]?.emoji}</div>
              <h3>{session.name}</h3>
              <p>输入{ROLES[session.role]?.label}发给你的话，AI 会给出 3 条不同风格的回复</p>
            </div>
          )}

          {rounds.map((round, ri) => (
            <div className="round" key={ri}>
              <div className="round-head">
                <span className="round-purpose">{round.purpose || '回复'}</span>
                <span className="round-time">
                  {new Date(round.ts).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="round-actions">
                  <button className="round-btn" title="删除后回填到输入框，可修改后重新生成" onClick={() => editRound(ri)} disabled={generating}>
                    ✎ 重新编辑
                  </button>
                  <button className="round-btn danger" title="删除这条记录" onClick={() => deleteRound(ri)} disabled={generating}>
                    🗑 删除
                  </button>
                </span>
              </div>
              <div className="bubble-in">{round.text}</div>
              <div className="replies-row">
                {round.replies.map((reply, i) => (
                  <ReplyCard
                    key={i}
                    reply={reply}
                    index={i}
                    chosen={round.chosen}
                    copiedKey={ri === rounds.length - 1 ? copiedKey : null}
                    onCopy={(idx) => onCopy(ri, idx)}
                  />
                ))}
              </div>
            </div>
          ))}

          {generating && (
            <div className="generating-tip">
              <span className="spinner" />
              AI 正在构思 3 条话术…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="composer-wrap">
        <div className="composer">
          <div className="composer-box">
            <textarea
              value={message}
              placeholder={`输入${ROLES[session.role]?.label}对你说的话…`}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className="composer-toolbar">
              <div className="purpose-row">
                <span className="selector-label">目的</span>
                <div className="purpose-chips">
                  {ROLES[session.role].purposes.map((p) => (
                    <button
                      key={p}
                      className={`chip ${purpose === p ? 'active' : ''}`}
                      onClick={() => setPurpose(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="composer-actions">
                <button className="btn-clear" onClick={clear} disabled={generating}>
                  清空
                </button>
                <button
                  className="btn btn-primary composer-send"
                  onClick={submit}
                  disabled={generating || !message.trim()}
                >
                  {generating ? '生成中…' : '✨ 生成'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
