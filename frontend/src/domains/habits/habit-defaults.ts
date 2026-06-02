/**
 * @file habit-defaults
 * @brief 习惯默认值自动推断
 * 
 * 根据默认时间和时长计算时间窗口，根据标题推断 trackable
 */

/**
 * 习惯默认值推断输入
 */
interface InferInput {
  /** 默认时间 (HH:MM) */
  defaultTime: string
  /** 默认持续时间（分钟） */
  defaultDuration: number
  /** 习惯标题 */
  title?: string
}

/**
 * 习惯默认值推断输出
 */
interface InferOutput {
  /** 最早开始时间 (HH:MM) */
  earliestTime: string
  /** 最迟开始时间 (HH:MM) */
  latestStartTime: string
  /** 最短持续时间 */
  minDuration: number
  /** 是否可追踪 */
  trackable: boolean
}

/** 不可追踪的习惯关键词 */
const NON_TRACKABLE_KEYWORDS = ['午餐', '晚餐', '早餐', '睡眠', '午休', '吃饭', '用餐']

/**
 * 时间字符串转为分钟数
 * 
 * @param time - HH:MM 格式时间
 * @returns 分钟数
 */
function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * 分钟数转为 HH:MM 格式
 * 
 * @param min - 分钟数
 * @returns HH:MM 格式时间
 */
function toHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * 推断习惯默认值
 * 
 * @param input - 推断输入
 * @returns 推断输出
 */
export function inferHabitDefaults(input: InferInput): InferOutput {
  const { defaultTime, defaultDuration, title } = input

  const earlyMin = Math.max(0, toMin(defaultTime) - 30)
  const lateMin = toMin(defaultTime) + 30
  const minDur = defaultDuration
  const trackable = title
    ? !NON_TRACKABLE_KEYWORDS.some(kw => title.includes(kw))
    : true

  return {
    earliestTime: toHHMM(earlyMin),
    latestStartTime: toHHMM(lateMin),
    minDuration: minDur,
    trackable,
  }
}
