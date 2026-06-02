/**
 * @file validation
 * @brief 习惯字段校验模块
 * 
 * 纯函数校验模块 — 客户端/服务端复用
 * 不依赖 React、不依赖数据库
 */

/** HH:MM 时间格式正则 */
export const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

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
 * 校验结果
 */
export interface ValidationResult {
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
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 必填校验
  const title = fields['title']
  if (action === 'createHabit' && (!title || (typeof title === 'string' && title.trim() === ''))) {
    errors.push('标题必填')
  }

  // 时间格式校验（仅在字段有值时才校验格式，允许 update 时部分更新）
  const timeFields = [
    { key: 'defaultTime', label: '默认时间' },
    { key: 'earliestTime', label: '最早开始时间' },
    { key: 'latestStartTime', label: '最迟开始时间' },
  ]
  for (const { key, label } of timeFields) {
    const val = fields[key]
    if (val !== undefined && val !== null && !isValidHHMM(val)) {
      errors.push(`${label}必须是有效的 HH:MM 格式`)
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
    if (defaultDuration <= 0) errors.push('默认时长必须大于 0')
    if (defaultDuration >= 180) warnings.push('默认时长较长（≥180分钟），建议拆分为多个习惯')
  }

  const minDuration = fields['minDuration']
  if (typeof minDuration === 'number') {
    if (minDuration <= 0) errors.push('最短时长必须大于 0')
  }
  if (typeof minDuration === 'number' && typeof defaultDuration === 'number') {
    if (minDuration > defaultDuration) errors.push('最短时长不能大于默认时长')
  }

  // 频率类型校验
  const frequencyType = fields['frequencyType']
  if (frequencyType !== undefined && typeof frequencyType === 'string') {
    const validTypes = ['daily', 'weekly', 'custom']
    if (!validTypes.includes(frequencyType)) {
      errors.push('频率类型必须是 daily/weekly/custom')
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}
