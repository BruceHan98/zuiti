import { MBTI_TYPES } from '../constants.js';

/** MBTI 单选网格（可复用）：value 为已选 code，'' 表示不设定；点击同项可取消 */
export default function MbtiGrid({ value, onChange }) {
  return (
    <>
      <div className="mbti-grid">
        <button
          type="button"
          className={`mbti-chip ${value === '' ? 'active' : ''}`}
          onClick={() => onChange('')}
        >
          不设定
        </button>
        {MBTI_TYPES.map((t) => (
          <button
            key={t.code}
            type="button"
            className={`mbti-chip ${value === t.code ? 'active' : ''}`}
            onClick={() => onChange(value === t.code ? '' : t.code)}
            title={t.traits}
          >
            {t.code}
          </button>
        ))}
      </div>
      {value && (
        <div className="mbti-desc">
          <b>
            {value} · {MBTI_TYPES.find((t) => t.code === value)?.label}
          </b>
          <span>{MBTI_TYPES.find((t) => t.code === value)?.traits}</span>
        </div>
      )}
    </>
  );
}
