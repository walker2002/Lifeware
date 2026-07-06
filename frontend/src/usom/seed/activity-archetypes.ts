/**
 * @file activity-archetypes
 * @brief L2 种子数据 — Activity Archetype 默认词典（30+ 条，7 大类全覆盖）
 *
 * 每条带 EnergyCost 4 维 + ActivityLabel 6 维 + isSystem=true（不可删除）。
 * 高/中/低映射（OQ-2）：高=8，中=5，低=2。
 *
 * @see docs/usom-design.md §3.11
 */

import type { EnergyCost, ActivityLabel } from '@/usom/activity-archetype/types'
import type { L1Category } from '@/usom/activity-archetype/l1-categories'

/** Seed 条目（不含 id/userId/createdAt/updatedAt，由 Repository.create 补全） */
export interface ActivityArchetypeSeed {
  l1Category: L1Category
  l2Name: string
  energyCost: EnergyCost
  activityLabel: ActivityLabel
  /** [023.11] 同义词/范围描述（用于标题匹配） */
  synonyms: string[]
}

export const SEED_ACTIVITY_ARCHETYPES: ActivityArchetypeSeed[] = [
  // ═══ 工作（6 条） ═══
  {
    l1Category: '工作', l2Name: '深度专注',
    energyCost: { physical: 2, mental: 9, emotional: 4, creative: 7 },
    activityLabel: { enjoyment: 6, typicalDuration: 90, interruptTolerance: 'low', environment: ['安静', '电脑'], location: ['办公室', '家'], parallelizable: false },
    synonyms: ['写代码', '编程', 'coding', '深度工作', '技术研发', '论文', '研究', '架构', '专注写作'],
  },
  {
    l1Category: '工作', l2Name: '方案设计',
    energyCost: { physical: 2, mental: 8, emotional: 3, creative: 9 },
    activityLabel: { enjoyment: 7, typicalDuration: 60, interruptTolerance: 'medium', environment: ['白板', '电脑'], location: ['办公室', '会议室'], parallelizable: false },
    synonyms: ['设计', '画图', '建模', '方案', '原型', 'UI 设计', '系统设计', '画原型'],
  },
  {
    l1Category: '工作', l2Name: '日常事务',
    energyCost: { physical: 2, mental: 4, emotional: 2, creative: 2 },
    activityLabel: { enjoyment: 4, typicalDuration: 30, interruptTolerance: 'high', environment: ['电脑'], location: ['办公室', '家'], parallelizable: true },
    synonyms: ['回邮件', '整理', '归档', '报销', '填表', '行政', '杂务'],
  },
  {
    l1Category: '工作', l2Name: '代码审查',
    energyCost: { physical: 2, mental: 7, emotional: 3, creative: 4 },
    activityLabel: { enjoyment: 5, typicalDuration: 45, interruptTolerance: 'medium', environment: ['安静', '电脑', '大屏'], location: ['办公室'], parallelizable: false },
    synonyms: ['review', 'code review', '审 PR', '看 PR', '评审'],
  },
  {
    l1Category: '工作', l2Name: '会议',
    energyCost: { physical: 2, mental: 5, emotional: 6, creative: 3 },
    activityLabel: { enjoyment: 4, typicalDuration: 30, interruptTolerance: 'low', environment: ['会议室', '耳机'], location: ['办公室'], parallelizable: false },
    synonyms: ['开会', '讨论', '对齐', '站会', '周会', '评审会'],
  },
  {
    l1Category: '工作', l2Name: '响应式工作',
    energyCost: { physical: 2, mental: 5, emotional: 4, creative: 3 },
    activityLabel: { enjoyment: 4, typicalDuration: 15, interruptTolerance: 'high', environment: ['电脑'], location: ['办公室', '家'], parallelizable: true },
    synonyms: ['回消息', '处理 issue', '答疑', '看通知', '碎片沟通'],
  },

  // ═══ 生存（4 条） ═══
  {
    l1Category: '生存', l2Name: '睡眠',
    energyCost: { physical: 1, mental: 1, emotional: 1, creative: 1 },
    activityLabel: { enjoyment: 8, typicalDuration: 480, interruptTolerance: 'low', environment: ['安静', '暗光'], location: ['卧室'], parallelizable: false },
    synonyms: ['睡觉', '休息', '入睡', '午睡', '补觉'],
  },
  {
    l1Category: '生存', l2Name: '饮食',
    energyCost: { physical: 2, mental: 1, emotional: 2, creative: 1 },
    activityLabel: { enjoyment: 7, typicalDuration: 30, interruptTolerance: 'high', environment: ['餐桌'], location: ['家', '餐厅'], parallelizable: true },
    synonyms: ['吃饭', '早餐', '午餐', '晚餐', '做饭', '点外卖'],
  },
  {
    l1Category: '生存', l2Name: '通勤',
    energyCost: { physical: 3, mental: 2, emotional: 3, creative: 1 },
    activityLabel: { enjoyment: 3, typicalDuration: 45, interruptTolerance: 'high', environment: ['移动中'], location: ['公共交通', '私家车'], parallelizable: true },
    synonyms: ['上班路上', '地铁', '公交', '开车回家', '路上'],
  },
  {
    l1Category: '生存', l2Name: '家务',
    energyCost: { physical: 6, mental: 1, emotional: 2, creative: 1 },
    activityLabel: { enjoyment: 3, typicalDuration: 30, interruptTolerance: 'high', environment: ['居家'], location: ['家'], parallelizable: true },
    synonyms: ['打扫', '洗衣', '收拾', '洗碗', '整理房间'],
  },

  // ═══ 投资（5 条） ═══
  {
    l1Category: '投资', l2Name: '学习新技能',
    energyCost: { physical: 2, mental: 8, emotional: 4, creative: 6 },
    activityLabel: { enjoyment: 7, typicalDuration: 60, interruptTolerance: 'medium', environment: ['安静', '电脑', '笔记本'], location: ['家', '图书馆'], parallelizable: false },
    synonyms: ['学习', '上课', '学课程', '练习', '练琴', '背单词'],
  },
  {
    l1Category: '投资', l2Name: '阅读',
    energyCost: { physical: 1, mental: 6, emotional: 2, creative: 4 },
    activityLabel: { enjoyment: 8, typicalDuration: 30, interruptTolerance: 'medium', environment: ['安静', '柔和灯光'], location: ['家', '图书馆', '咖啡厅'], parallelizable: false },
    synonyms: ['看书', '读书', '看文章', '看文档', '翻书'],
  },
  {
    l1Category: '投资', l2Name: '写作',
    energyCost: { physical: 2, mental: 7, emotional: 5, creative: 8 },
    activityLabel: { enjoyment: 6, typicalDuration: 45, interruptTolerance: 'low', environment: ['安静', '电脑'], location: ['家', '咖啡厅'], parallelizable: false },
    synonyms: ['写文章', '写博客', '写日记', '写笔记', '记录'],
  },
  {
    l1Category: '投资', l2Name: '复盘反思',
    energyCost: { physical: 1, mental: 5, emotional: 6, creative: 5 },
    activityLabel: { enjoyment: 5, typicalDuration: 15, interruptTolerance: 'low', environment: ['安静', '笔记本'], location: ['家'], parallelizable: false },
    synonyms: ['复盘', '反思', '总结', '自省'],
  },
  {
    l1Category: '投资', l2Name: '知识整理',
    energyCost: { physical: 1, mental: 6, emotional: 2, creative: 5 },
    activityLabel: { enjoyment: 5, typicalDuration: 30, interruptTolerance: 'medium', environment: ['电脑'], location: ['办公室', '家'], parallelizable: false },
    synonyms: ['整理笔记', '归档资料', '做卡片', '写文档'],
  },

  // ═══ 关系（4 条） ═══
  {
    l1Category: '关系', l2Name: '陪伴家人',
    energyCost: { physical: 2, mental: 2, emotional: 5, creative: 2 },
    activityLabel: { enjoyment: 9, typicalDuration: 120, interruptTolerance: 'low', environment: ['客厅', '户外'], location: ['家', '公园'], parallelizable: false },
    synonyms: ['陪孩子', '陪父母', '亲子', '伴侣时间'],
  },
  {
    l1Category: '关系', l2Name: '社交活动',
    energyCost: { physical: 3, mental: 3, emotional: 6, creative: 3 },
    activityLabel: { enjoyment: 7, typicalDuration: 120, interruptTolerance: 'low', environment: ['社交场合'], location: ['餐厅', '酒吧', '户外'], parallelizable: false },
    synonyms: ['聚会', '聚餐', '和朋友', 'party'],
  },
  {
    l1Category: '关系', l2Name: '团队协作',
    energyCost: { physical: 2, mental: 5, emotional: 5, creative: 6 },
    activityLabel: { enjoyment: 6, typicalDuration: 60, interruptTolerance: 'low', environment: ['会议室', '白板', '电脑'], location: ['办公室'], parallelizable: false },
    synonyms: ['协作', '结对', 'mob', '协同'],
  },
  {
    l1Category: '关系', l2Name: '一对一沟通',
    energyCost: { physical: 2, mental: 4, emotional: 7, creative: 2 },
    activityLabel: { enjoyment: 6, typicalDuration: 30, interruptTolerance: 'low', environment: ['安静', '私密'], location: ['办公室', '咖啡厅'], parallelizable: false },
    synonyms: ['1v1', '谈心', '辅导', '倾听', '私聊'],
  },

  // ═══ 放松（4 条） ═══
  {
    l1Category: '放松', l2Name: '冥想',
    energyCost: { physical: 1, mental: 2, emotional: 2, creative: 1 },
    activityLabel: { enjoyment: 6, typicalDuration: 10, interruptTolerance: 'low', environment: ['安静', '柔和灯光'], location: ['家'], parallelizable: false },
    synonyms: ['打坐', '正念', '静坐', '呼吸练习'],
  },
  {
    l1Category: '放松', l2Name: '散步',
    energyCost: { physical: 3, mental: 1, emotional: 2, creative: 2 },
    activityLabel: { enjoyment: 7, typicalDuration: 30, interruptTolerance: 'high', environment: ['户外', '移动中'], location: ['公园', '街道'], parallelizable: true },
    synonyms: ['走路', '溜达', '漫步', '散步思考'],
  },
  {
    l1Category: '放松', l2Name: '娱乐',
    energyCost: { physical: 1, mental: 2, emotional: 3, creative: 1 },
    activityLabel: { enjoyment: 9, typicalDuration: 60, interruptTolerance: 'high', environment: ['沙发', '屏幕'], location: ['家'], parallelizable: true },
    synonyms: ['看剧', '看电影', '玩游戏', '刷视频', '听播客'],
  },
  {
    l1Category: '放松', l2Name: '午休',
    energyCost: { physical: 1, mental: 1, emotional: 2, creative: 1 },
    activityLabel: { enjoyment: 7, typicalDuration: 20, interruptTolerance: 'medium', environment: ['安静', '暗光'], location: ['家', '办公室'], parallelizable: false },
    synonyms: ['小憩', '打盹', '闭目养神'],
  },

  // ═══ 健康（4 条） ═══
  {
    l1Category: '健康', l2Name: '有氧运动',
    energyCost: { physical: 8, mental: 1, emotional: 3, creative: 1 },
    activityLabel: { enjoyment: 6, typicalDuration: 30, interruptTolerance: 'low', environment: ['运动场', '户外'], location: ['健身房', '公园'], parallelizable: true },
    synonyms: ['跑步', '慢跑', '骑车', '游泳', '跳绳', '椭圆机'],
  },
  {
    l1Category: '健康', l2Name: '力量训练',
    energyCost: { physical: 9, mental: 1, emotional: 3, creative: 1 },
    activityLabel: { enjoyment: 5, typicalDuration: 45, interruptTolerance: 'low', environment: ['健身房'], location: ['健身房'], parallelizable: false },
    synonyms: ['举铁', '健身', '撸铁', '深蹲', '卧推'],
  },
  {
    l1Category: '健康', l2Name: '拉伸恢复',
    energyCost: { physical: 4, mental: 1, emotional: 2, creative: 1 },
    activityLabel: { enjoyment: 5, typicalDuration: 15, interruptTolerance: 'high', environment: ['垫上'], location: ['家', '健身房'], parallelizable: true },
    synonyms: ['拉伸', '瑜伽', '泡沫轴', '柔韧'],
  },
  {
    l1Category: '健康', l2Name: '体能监测',
    energyCost: { physical: 1, mental: 2, emotional: 2, creative: 1 },
    activityLabel: { enjoyment: 4, typicalDuration: 10, interruptTolerance: 'high', environment: ['手机'], location: ['家'], parallelizable: true },
    synonyms: ['称体重', '量血压', '测心率', '体测'],
  },

  // ═══ 浪费（3 条） ═══
  {
    l1Category: '浪费', l2Name: '无目的刷手机',
    energyCost: { physical: 1, mental: 1, emotional: 2, creative: 1 },
    activityLabel: { enjoyment: 6, typicalDuration: 15, interruptTolerance: 'high', environment: ['手机'], location: ['任意'], parallelizable: true },
    synonyms: ['刷微博', '刷抖音', '刷朋友圈', '无目的浏览'],
  },
  {
    l1Category: '浪费', l2Name: '拖延等待',
    energyCost: { physical: 1, mental: 2, emotional: 4, creative: 1 },
    activityLabel: { enjoyment: 2, typicalDuration: 10, interruptTolerance: 'high', environment: ['任意'], location: ['任意'], parallelizable: true },
    synonyms: ['发呆', '磨蹭', '拖延', '走神'],
  },
  {
    l1Category: '浪费', l2Name: '无效会议',
    energyCost: { physical: 1, mental: 3, emotional: 5, creative: 2 },
    activityLabel: { enjoyment: 2, typicalDuration: 45, interruptTolerance: 'low', environment: ['会议室'], location: ['办公室'], parallelizable: false },
    synonyms: ['冗长会议', '无聊会议', '没意义的会'],
  },
]
