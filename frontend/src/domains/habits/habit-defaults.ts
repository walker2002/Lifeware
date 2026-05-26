// 习惯默认值自动推断
// 根据默认时间和时长计算时间窗口，根据标题推断 trackable

interface InferInput {
  defaultTime: string // HH:MM
  defaultDuration: number
  title?: string
}

interface InferOutput {
  earliestTime: string // HH:MM
  latestStartTime: string // HH:MM
  minDuration: number
  trackable: boolean
}

const NON_TRACKABLE_KEYWORDS = ['午餐', '晚餐', '早餐', '睡眠', '午休', '吃饭', '用餐']

function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

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
