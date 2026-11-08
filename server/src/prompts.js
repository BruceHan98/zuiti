/**
 * 角色与目的：开发时内置，不动态生成。
 */
export const ROLES = {
  lover: {
    label: '恋人',
    purposes: ['撒娇示爱', '化解矛盾', '日常关心', '制造惊喜', '认真沟通'],
  },
  friend: {
    label: '朋友',
    purposes: ['幽默调侃', '安慰支持', '出谋划策', '维系感情', '婉拒请求'],
  },
  colleague: {
    label: '同事',
    purposes: ['专业协作', '委婉拒绝', '汇报工作', '拉近关系', '化解尴尬'],
  },
  family: {
    label: '家人',
    purposes: ['表达关心', '回应唠叨', '耐心解释', '报平安', '节日问候'],
  },
};

export function isValidRole(role) {
  return Object.prototype.hasOwnProperty.call(ROLES, role);
}

export function isValidPurpose(role, purpose) {
  return isValidRole(role) && ROLES[role].purposes.includes(purpose);
}

export function defaultPurpose(role) {
  return ROLES[role]?.purposes?.[0] || '';
}

/** 会话内容（加密存储的 JSON）的初始结构 */
export function emptyContent() {
  return { summary: '', rounds: [] };
}

/** MBTI 十六型人格画像（与前端 constants.js 保持一致，用于提示词注入） */
export const MBTI_PROFILES = {
  INFP: '感性温和，重真实感受，怕冲突，吃软不吃硬',
  INFJ: '洞察力强，重意义与深度共鸣，讨厌敷衍',
  INTP: '理性好奇，重逻辑与准确性，不喜欢过度煽情',
  INTJ: '独立理性，重效率与目标，反感无意义寒暄',
  ENFP: '热情脑洞大，喜欢新鲜与共鸣，怕被泼冷水',
  ENFJ: '温暖体贴，重和谐与被需要，在意回应热度',
  ENTP: '机智爱抬杠，喜欢有趣交流，无聊是大忌',
  ENTJ: '直接果断，重结果与效率，反感拐弯抹角',
  ISFP: '安静随和，重真诚与空间感，不喜欢被逼迫',
  ISFJ: '细致体贴，重稳定与被记住，在意细节用心',
  ISTP: '务实冷幽默，不喜欢啰嗦与情感绑架',
  ISTJ: '严谨可靠，重细节与承诺，反感轻浮随意',
  ESFP: '活泼爱玩，喜欢轻松热闹氛围，怕冷场',
  ESFJ: '热心照顾人，重回应与仪式感，在意是否被重视',
  ESTP: '直爽行动派，喜欢干脆直接，讨厌磨叨',
  ESTJ: '务实有主见，重清晰明确，反感含糊不清',
};

const MBTI_CODES = Object.keys(MBTI_PROFILES);

export function normalizeMbti(mbti) {
  return String(mbti || '').toUpperCase().trim();
}

export function isValidMbti(mbti) {
  return !mbti || MBTI_CODES.includes(normalizeMbti(mbti));
}

/**
 * ============ 节省 Token 的核心：上下文裁剪 ============
 * 请求只携带：固定精简系统提示 + 一句话人设 + 滚动摘要 + 最近 RECENT_ROUNDS 轮原文 + 新消息。
 * 不携带全量历史。
 */
export const RECENT_ROUNDS = 2;

/**
 * 取最近 n 轮对话。chosen 为空（用户未选用任何回复）时，用第一条建议作为参考但仍标记未选用。
 */
export function trimRounds(rounds, n = RECENT_ROUNDS) {
  return rounds.slice(-n);
}

/** 生成模式：reply=针对对方的话回话；compose=把用户想法写成可直接发送的消息 */
export const MODES = ['reply', 'compose'];

export function isValidMode(mode) {
  return !mode || mode === 'reply' || mode === 'compose';
}

export function buildSystemPrompt(mode) {
  if (mode === 'compose') {
    return [
      '你是聊天表达顾问，帮用户把自己的想法润色成可直接发送的消息。',
      '根据【设定】与【我的想法】写出3条可发送的消息，要求：',
      '1. 三条侧重不同：A稳妥得体、B主动推进、C轻松幽默；务必忠实保留用户想法的核心意图与关键信息',
      '2. 每条≤80字，口语化可直接发送，符合双方关系，可延续已有聊天氛围',
      '3. 若设定了对方MBTI性格，须贴合其偏好与雷区，让对方读起来舒服自然',
      '4. 严格只输出JSON（不要多余文字）：',
      '{"replies":["...","...","..."],"summary":"≤150字对话摘要"}',
      'summary 规则：融合【旧摘要】与本次想法及最终表达，保留双方关系、称呼、性格特征、情绪基调、关键事实与承诺，供后续轮次使用。',
    ].join('\n');
  }
  return [
    '你是聊天回复顾问，帮用户想出如何回复对方的消息。',
    '根据【设定】与【最新消息】给出3条回复话术，要求：',
    '1. 三条侧重不同：A稳妥得体、B主动推进、C轻松幽默；若与回复目的冲突，以目的优先',
    '2. 每条≤80字，口语化可直接发送，符合双方关系与目的，可延续已有聊天氛围',
    '3. 若设定了对方MBTI性格，须贴合其偏好与雷区，让对方读起来舒服自然',
    '4. 严格只输出JSON（不要多余文字）：',
    '{"replies":["...","...","..."],"summary":"≤150字对话摘要"}',
    'summary 规则：融合【旧摘要】与新消息，保留双方关系、称呼、性格特征、情绪基调、关键事实与承诺，供后续轮次使用。',
  ].join('\n');
}

/**
 * 构造发送给模型的用户消息（已裁剪，最小化 token）。
 * round 结构：{ text, replies: [3], chosen: number|null, purpose, mode, ts }
 */
export function buildUserMessage({ session, content, purpose, message, mode }) {
  const roleLabel = ROLES[session.role]?.label || session.role;
  const lines = [];
  const settingParts = [`关系:${roleLabel}`];
  if (mode !== 'compose' && purpose) settingParts.push(`目的:${purpose}`);
  if (session.note) settingParts.push(`对方:${session.note}`);
  if (session.mbti) {
    settingParts.push(`对方MBTI:${session.mbti}（${MBTI_PROFILES[session.mbti] || ''}）`);
  }
  lines.push(`【设定】${settingParts.join('｜')}`);
  if (content.summary) lines.push(`【旧摘要】${content.summary}`);
  const recent = trimRounds(content.rounds);
  if (recent.length) {
    lines.push('【近期对话】');
    for (const r of recent) {
      if (r.mode === 'compose') {
        lines.push(`我的想法:${r.text}`);
      } else {
        lines.push(`对方:${r.text}`);
      }
      const chosen = r.chosen != null ? r.replies[r.chosen] : null;
      lines.push(chosen ? `我方发送:${chosen}` : `我方发送:(未从建议中选用)`);
    }
  }
  if (mode === 'compose') {
    lines.push(`【我的想法】${message}`);
  } else {
    lines.push(`【最新消息】对方:${message}`);
  }
  return lines.join('\n');
}
