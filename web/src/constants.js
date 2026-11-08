/** 与后端 prompts.js 保持一致的角色/目的配置 */
export const ROLES = {
  lover: {
    label: '恋人',
    emoji: '💖',
    purposes: ['撒娇示爱', '化解矛盾', '日常关心', '制造惊喜', '认真沟通'],
  },
  friend: {
    label: '朋友',
    emoji: '🤝',
    purposes: ['幽默调侃', '安慰支持', '出谋划策', '维系感情', '婉拒请求'],
  },
  colleague: {
    label: '同事',
    emoji: '💼',
    purposes: ['专业协作', '委婉拒绝', '汇报工作', '拉近关系', '化解尴尬'],
  },
  family: {
    label: '家人',
    emoji: '🏡',
    purposes: ['表达关心', '回应唠叨', '耐心解释', '报平安', '节日问候'],
  },
};

export const ROLE_KEYS = Object.keys(ROLES);

/** 生成模式：reply=针对对方的话回话；compose=把我的想法写成消息 */
export const MODES = {
  reply: { label: '回复 TA', placeholder: '输入对方对你说的话…' },
  compose: { label: '我的想法', placeholder: '输入你的想法，AI 帮你写成可发送的消息…' },
};

export const REPLY_STYLES = ['稳妥', '主动', '幽默'];

/** MBTI 十六型人格（可选，用于让 AI 结合对方性格生成更舒服的回复） */
export const MBTI_TYPES = [
  { code: 'INFP', label: '调停者', traits: '感性温和，重真实感受，怕冲突' },
  { code: 'INFJ', label: '提倡者', traits: '洞察力强，重意义与深度共鸣' },
  { code: 'INTP', label: '逻辑学家', traits: '理性好奇，重逻辑与准确性' },
  { code: 'INTJ', label: '建筑师', traits: '独立理性，重效率与目标' },
  { code: 'ENFP', label: '竞选者', traits: '热情脑洞大，喜欢新鲜与共鸣' },
  { code: 'ENFJ', label: '主人公', traits: '温暖体贴，重和谐与被需要' },
  { code: 'ENTP', label: '辩论家', traits: '机智爱抬杠，喜欢有趣交流' },
  { code: 'ENTJ', label: '指挥官', traits: '直接果断，重结果与效率' },
  { code: 'ISFP', label: '探险家', traits: '安静随和，重真诚与空间感' },
  { code: 'ISFJ', label: '守卫者', traits: '细致体贴，重稳定与被记住' },
  { code: 'ISTP', label: '鉴赏家', traits: '务实冷幽默，不喜欢啰嗦' },
  { code: 'ISTJ', label: '物流师', traits: '严谨可靠，重细节与承诺' },
  { code: 'ESFP', label: '表演者', traits: '活泼爱玩，喜欢轻松热闹氛围' },
  { code: 'ESFJ', label: '执政官', traits: '热心照顾人，重回应与仪式感' },
  { code: 'ESTP', label: '企业家', traits: '直爽行动派，喜欢干脆直接' },
  { code: 'ESTJ', label: '总经理', traits: '务实有主见，重清晰明确' },
];
