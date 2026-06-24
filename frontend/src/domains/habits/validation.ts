/**
 * @file validation
 * @brief 习惯字段校验模块
 *
 * 纯函数校验模块 — 客户端/服务端复用，不依赖 React、不依赖数据库。
 * [020] RT1：realtime 单字段规则的 message 在此单源定义（HABIT_RULE_MESSAGES），
 * 供 rules-registry.ts 与本文件 submit 聚合校验共用，防漂移致回填失配。
 */

/** HH:MM 时间格式正则 */
export const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * [020] F1：rule message 单源，registry realtime 与 submit 校验共用，防漂移。
 * 文本逐字取自原 manifest L 区 rules 声明（时间格式 3 条为完整展开文本）。
 */
export const HABIT_RULE_MESSAGES = {
  defaultDurationPositive: '默认时长必须大于 0',
  minDurationPositive: '最短时长必须大于 0',
  frequencyTypeValid: '频率类型必须是 daily/weekly/custom',
  defaultTimeFormat: '默认时间必须是有效的 HH:MM 格式',
  earliestTimeFormat: '最早开始时间必须是有效的 HH:MM 格式',
  latestTimeFormat: '最迟开始时间必须是有效的 HH:MM 格式',
} as const

/**
 * 校验 HH:MM 格式
 *
 * @param value - 待校验值
 * @returns 是否有效
 */
export function isValidHHMM(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return HH_MM_REGEX.test(value)
}

/**
 * 时间字符串转为分钟数
 * 
 * @param time - HH:MM 格式时间
 * @returns 分钟数
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * 校验结果（[018-G3] C1：改名避免与全局 5 变体 ValidationResult 碰撞）
 */
export interface HabitFieldCheckResult {
  /** 是否有效 */
  valid: boolean
  /** 错误列表 */
  errors: string[]
  /** 警告列表 */
  warnings: string[]
}

/**
 * 校验习惯字段
 * 
 * @param fields - 字段映射
 * @param action - 操作类型
 * @returns 校验结果
 */
export function validateHabitFields(
  fields: Record<string, unknown>,
  action: 'createHabit' | 'updateHabit',
): HabitFieldCheckResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 必填校验
  const title = fields['title']
  if (action === 'createHabit' && (!title || (typeof title === 'string' && title.trim() === ''))) {
    errors.push('标题必填')
  }

  // 时间格式校验（仅在字段有值时才校验格式，允许 update 时部分更新）
  // message 引用 HABIT_RULE_MESSAGES 单源常量（与 rules-registry realtime 共用）
  const timeFields = [
    { key: 'defaultTime', message: HABIT_RULE_MESSAGES.defaultTimeFormat },
    { key: 'earliestTime', message: HABIT_RULE_MESSAGES.earliestTimeFormat },
    { key: 'latestStartTime', message: HABIT_RULE_MESSAGES.latestTimeFormat },
  ]
  for (const { key, message } of timeFields) {
    const val = fields[key]
    if (val !== undefined && val !== null && !isValidHHMM(val)) {
      errors.push(message)
    }
  }

  // 时间窗口约束
  const defaultTime = fields['defaultTime'] as string
  const earliestTime = fields['earliestTime'] as string
  const latestStartTime = fields['latestStartTime'] as string
  if (defaultTime && earliestTime && latestStartTime &&
      isValidHHMM(defaultTime) && isValidHHMM(earliestTime) && isValidHHMM(latestStartTime)) {
    const dt = timeToMinutes(defaultTime)
    const et = timeToMinutes(earliestTime)
    const lt = timeToMinutes(latestStartTime)
    if (dt < et || dt > lt) {
      errors.push('默认时间必须在最早开始时间和最迟开始时间之间')
    }
  }

  // 时长校验
  const defaultDuration = fields['defaultDuration']
  if (typeof defaultDuration === 'number') {
    if (defaultDuration <= 0) errors.push(HABIT_RULE_MESSAGES.defaultDurationPositive)
    if (defaultDuration >= 180) warnings.push('默认时长较长（≥180分钟），建议拆分为多个习惯')
  }

  const minDuration = fields['minDuration']
  if (typeof minDuration === 'number') {
    if (minDuration <= 0) errors.push(HABIT_RULE_MESSAGES.minDurationPositive)
  }
  if (typeof minDuration === 'number' && typeof defaultDuration === 'number') {
    if (minDuration > defaultDuration) errors.push('最短时长不能大于默认时长')
  }

  // 频率类型校验
  const frequencyType = fields['frequencyType']
  if (frequencyType !== undefined && typeof frequencyType === 'string') {
    const validTypes = ['daily', 'weekly', 'custom']
    if (!validTypes.includes(frequencyType)) {
      errors.push(HABIT_RULE_MESSAGES.frequencyTypeValid)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}
