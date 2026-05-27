// 纯函数校验模块 — 客户端/服务端复用
// 不依赖 React、不依赖数据库

const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

function isValidHHMM(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return HH_MM_REGEX.test(value)
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

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

  // 时间格式校验（仅在校验传入时有效时校验格式）
  if (!isValidHHMM(fields['defaultTime'])) {
    errors.push('默认时间必须是有效的 HH:MM 格式')
  }
  if (!isValidHHMM(fields['earliestTime'])) {
    errors.push('最早开始时间格式无效')
  }
  if (!isValidHHMM(fields['latestStartTime'])) {
    errors.push('最迟开始时间格式无效')
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
  if (typeof minDuration === 'number' && typeof defaultDuration === 'number') {
    if (minDuration <= 0) errors.push('最短时长必须大于 0')
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
