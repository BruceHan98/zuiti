import { useEffect, useRef, useState } from 'react';
import { MODES, REPLY_STYLES, ROLES } from '../constants.js';
import { IconChat, IconCheck, IconCopy, IconEdit, IconSparkles, IconTrash } from './Icons.jsx';

function ReplyCard({ reply, index, chosen, copied, onCopy }) {
  const isChosen = chosen === index;
  return (
    <div className={`reply-card ${isChosen ? 'chosen' : ''}`}>
      {isChosen && <span className="chosen-badge">已选用</span>}
      <div className="reply-head">
        <span className="reply-tag">
          <span className="tag-dot" />
          {String.fromCharCode(65 + index)} · {REPLY_STYLES[index] || '推荐'}
        </span>
        <button
          className={`card-icon-btn ${copied ? 'copied' : ''}`}
          onClick={() => onCopy(index)}
          title={copied ? '已复制并选用' : '复制并选用'}
        >
          {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
        </button>
      </div>
      <div className="reply-text">{reply}</div>
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
  const [mode, setMode] = useState('reply');
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
          <div className="big"><IconChat size={36} /></div>
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
    Promise.resolve(onGenerate(msg, purpose, mode)).then((ok) => {
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
    if (round.mode) setMode(round.mode);
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
                {round.mode === 'compose' ? (
                  <span className="round-purpose mode-compose">我的想法</span>
                ) : (
                  <span className="round-purpose">{round.purpose || '回复'}</span>
                )}
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
                    <IconEdit size={13} /> 重新编辑
                  </button>
                  <button className="round-btn danger" title="删除这条记录" onClick={() => deleteRound(ri)} disabled={generating}>
                    <IconTrash size={13} /> 删除
                  </button>
                </span>
              </div>
              <div className={`bubble-in ${round.mode === 'compose' ? 'bubble-compose' : ''}`}>
                {round.text}
              </div>
              <div className="replies-row">
                {round.replies.map((reply, i) => (
                  <ReplyCard
                    key={i}
                    reply={reply}
                    index={i}
                    chosen={round.chosen}
                    copied={copiedKey === `${ri}-${i}`}
                    onCopy={(idx) => onCopy(ri, idx)}
                  />
                ))}
              </div>
            </div>
          ))}

          {generating && (
            <div className="generating-tip">
              <span className="spinner" />
              {mode === 'compose' ? 'AI 正在把你的想法写成 3 条消息…' : 'AI 正在构思 3 条话术…'}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="composer-wrap">
        <div className="composer">
          <div className="composer-box">
            <div className="mode-toggle">
              {Object.entries(MODES).map(([k, m]) => (
                <button
                  key={k}
                  type="button"
                  className={`mode-btn ${mode === k ? 'active' : ''}`}
                  onClick={() => setMode(k)}
                  disabled={generating}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <textarea
              value={message}
              placeholder={MODES[mode].placeholder}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className="composer-toolbar">
              {mode === 'reply' && (
                <div className="purpose-row">
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
              )}
              <div className="composer-actions">
                <button className="btn-clear" onClick={clear} disabled={generating}>
                  清空
                </button>
                <button
                  className="btn btn-primary composer-send"
                  onClick={submit}
                  disabled={generating || !message.trim()}
                >
                  {generating ? '生成中…' : <><IconSparkles size={15} /> 生成</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
