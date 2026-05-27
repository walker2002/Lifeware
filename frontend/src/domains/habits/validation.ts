/**
 * 习惯校验工具函数
 */

export interface HabitFields {
  title?: string
  defaultTime?: string
  earliestTime?: string
  latestStartTime?: string
  defaultDuration?: number
  minDuration?: number
}

export type ValidationMode = 'createHabit' | 'updateHabit'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/** 校验 HH:MM 格式 (00:00–23:59) */
function isValidTimeFormat(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
}

/** 将 HH:MM 转为分钟数用于比较 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function validateHabitFields(
  fields: HabitFields,
  mode: ValidationMode
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const title = fields.title ?? ''
  const defaultTime = fields.defaultTime ?? ''
  const earliestTime = fields.earliestTime ?? ''
  const latestStartTime = fields.latestStartTime ?? ''
  const defaultDuration = fields.defaultDuration ?? 0
  const minDuration = fields.minDuration ?? 0

  // 标题校验（仅 createHabit 时必填）
  if (mode === 'createHabit' && title.trim() === '') {
    errors.push('标题必填')
  }

  // 时间格式校验
  const timeFields = [
    { value: defaultTime, label: '默认时间' },
    { value: earliestTime, label: '最早开始时间' },
    { value: latestStartTime, label: '最迟开始时间' },
  ]

  for (const { value, label } of timeFields) {
    if (value && !isValidTimeFormat(value)) {
      errors.push(`${label}必须是有效的 HH:MM 格式`)
      break // 只报告第一个无效时间字段
    }
  }

  // 时间窗口校验
  if (
    defaultTime &&
    earliestTime &&
    latestStartTime &&
    isValidTimeFormat(defaultTime) &&
    isValidTimeFormat(earliestTime) &&
    isValidTimeFormat(latestStartTime)
  ) {
    const dMin = timeToMinutes(defaultTime)
    const eMin = timeToMinutes(earliestTime)
    const lMin = timeToMinutes(latestStartTime)

    if (dMin < eMin || dMin > lMin) {
      errors.push('默认时间必须在最早开始时间和最迟开始时间之间')
    }
  }

  // 默认时长校验（仅在明确传入时校验，undefined 表示未提供）
  if (fields.defaultDuration !== undefined) {
    if (defaultDuration <= 0) {
      errors.push('默认时长必须大于 0')
    }
    if (defaultDuration >= 180) {
      warnings.push('默认时长较长（≥180分钟），建议拆分为多个习惯')
    }
  }

  // 最短时长 <= 默认时长（仅在两者都明确传入时校验）
  if (fields.minDuration !== undefined && fields.defaultDuration !== undefined) {
    if (minDuration > 0 && defaultDuration > 0 && minDuration > defaultDuration) {
      errors.push('最短时长不能大于默认时长')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
