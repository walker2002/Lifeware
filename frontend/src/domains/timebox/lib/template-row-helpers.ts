/**
 * @file template-row-helpers
 * @brief 时间盒模板行列表的纯函数（[023-02]）
 *
 * 0 React 依赖；可被编辑器、TemplateCard、server action、测试复用。
 * 副作用函数（id 生成）通过参数注入，便于测试时控。
 *
 * DEFAULT_SEGMENT_SEED 与 SQL 迁移 0032 v_default 块语义对齐——
 * 任一处改动必须同步另一边（决议 B.3）。
 */

import type { TemplateRow } from '@/lib/db/schema'

/** 星期标签（0=周日..6=周六，UI 用） */
export const WEEKDAY_LABELS: { value: number; short: string; long: string }[] = [
  { value: 0, short: '日', long: '周日' },
  { value: 1, short: '一', long: '周一' },
  { value: 2, short: '二', long: '周二' },
  { value: 3, short: '三', long: '周三' },
  { value: 4, short: '四', long: '周四' },
  { value: 5, short: '五', long: '周五' },
  { value: 6, short: '六', long: '周六' },
]

/** 新建模板的 7 段默认 seed（[023-02] 决议 B.3 KEEP IN SYNC WITH 0032 SQL v_default） */
export const DEFAULT_SEGMENT_SEED: ReadonlyArray<{ activityName: string; start: string; end: string }> = [
  { activityName: '起床', start: '07:00', end: '07:30' },
  { activityName: '晨间', start: '07:30', end: '09:00' },
  { activityName: '上午上班', start: '09:00', end: '12:00' },
  { activityName: '午间', start: '12:00', end: '13:30' },
  { activityName: '下午上班', start: '13:30', end: '18:00' },
  { activityName: '晚间', start: '18:00', end: '23:00' },
  { activityName: '睡眠', start: '23:00', end: '07:00' },
]

/** 生成行 id（默认用 crypto.randomUUID，测试时可注入） */
export function genRowId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // SSR / 旧环境兜底
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * HH:MM + 分钟数 = HH:MM（跨午夜按 mod 24h 归一）。
 * 纯函数，便于 fetchSubscriptionSources 计算 habit.end 时复用。
 */
export function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = ((h * 60 + m + minutes) % (24 * 60) + 24 * 60) % (24 * 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** 新建模板的 7 段 seed 行（与 SQL 迁移默认 7 段对齐） */
export function seedTemplateRows(idGen: () => string = genRowId): TemplateRow[] {
  return DEFAULT_SEGMENT_SEED.map((seg) => ({
    id: idGen(),
    source: 'custom',
    activityName: seg.activityName,
    start: seg.start,
    end: seg.end,
  }))
}

/** 抽屉内「+ 新增一行」的空白行（[023-02] 决议 E.1：重命名与编辑器内 blankTemplate 区分） */
export function newEmptyRow(idGen: () => string = genRowId): TemplateRow {
  return {
    id: idGen(),
    activityName: '',
    start: '09:00',
    end: '10:00',
    source: 'custom',
  }
}

/** 按 start 升序（HH:MM 字符串字典序即可等价时间序） */
export function sortRowsByStart(rows: TemplateRow[]): TemplateRow[] {
  return [...rows].sort((a, b) => a.start.localeCompare(b.start))
}
