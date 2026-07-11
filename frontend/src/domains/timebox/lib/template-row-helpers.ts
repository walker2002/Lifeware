/**
 * @file template-row-helpers
 * @brief 时间盒模板行列表的纯函数（[023-02] / [027-B] 形状重构）
 *
 * 0 React 依赖；可被编辑器、TemplateCard、server action、仓储、测试复用。
 * 副作用函数（id 生成）通过参数注入，便于测试时控。
 *
 * [027-B]：TemplateRow 从 {start,end} 改为 {defaultStart,defaultDuration,earliestStart,latestStart,shortestDuration,activityArchetypeId}。
 * DEFAULT_SEGMENT_SEED 与历史迁移 0032 v_default 的 7 段活动/时长在**概念上**一致；
 * 0032 的旧字面形状 {start,end} 由 normalizeTemplateRow 读时自愈——不再逐字同步。
 */

import type { TemplateRow, TemplateRowSource } from '@/lib/db/schema'

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

/** 新建模板的 7 段默认 seed（[027-B] 新形状） */
export const DEFAULT_SEGMENT_SEED: ReadonlyArray<{ activityName: string; defaultStart: string; defaultDuration: number }> = [
  { activityName: '起床', defaultStart: '07:00', defaultDuration: 30 },
  { activityName: '晨间', defaultStart: '07:30', defaultDuration: 90 },
  { activityName: '上午上班', defaultStart: '09:00', defaultDuration: 180 },
  { activityName: '午间', defaultStart: '12:00', defaultDuration: 90 },
  { activityName: '下午上班', defaultStart: '13:30', defaultDuration: 270 },
  { activityName: '晚间', defaultStart: '18:00', defaultDuration: 300 },
  { activityName: '睡眠', defaultStart: '23:00', defaultDuration: 480 },
]

/** 生成行 id（默认 crypto.randomUUID，测试可注入） */
export function genRowId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** HH:MM + 分钟数 = HH:MM（跨午夜 mod 24h 归一） */
export function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = ((h * 60 + m + minutes) % (24 * 60) + 24 * 60) % (24 * 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** [027-B] 两 HH:MM 之差（分钟）；end<start 视作跨午夜次日（+24h）。 */
export function hhmmDiffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let diff = eh * 60 + em - (sh * 60 + sm)
  if (diff < 0) diff += 24 * 60
  return diff
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
/** 必填 HH:MM 合法性 */
function isValidHHMM(s: unknown): boolean {
  return typeof s === 'string' && HHMM_RE.test(s)
}
/** 可选 HH:MM 合法性（空值合法） */
function isOptionalHHMM(s: unknown): boolean {
  return s == null || s === '' || isValidHHMM(s)
}

/** 新建模板的 7 段 seed 行 */
export function seedTemplateRows(idGen: () => string = genRowId): TemplateRow[] {
  return DEFAULT_SEGMENT_SEED.map((seg) => ({
    id: idGen(),
    source: 'custom',
    activityName: seg.activityName,
    defaultStart: seg.defaultStart,
    defaultDuration: seg.defaultDuration,
  }))
}

/** 「+ 新增一行」空白行 */
export function newEmptyRow(idGen: () => string = genRowId): TemplateRow {
  return {
    id: idGen(),
    activityName: '',
    defaultStart: '09:00',
    defaultDuration: 60,
    source: 'custom',
  }
}

/** 按 defaultStart 升序（HH:MM 字典序 = 时间序） */
export function sortRowsByDefaultStart(rows: TemplateRow[]): TemplateRow[] {
  return [...rows].sort((a, b) => a.defaultStart.localeCompare(b.defaultStart))
}

/**
 * [027-B] 读时自愈：把任意 rows 元素归一为新形状 TemplateRow。
 * - 新形状（有 defaultStart+defaultDuration）：直通，缺省约束/archetype 置 null。
 * - 旧形状（有 start、无 defaultStart）：defaultStart=start，defaultDuration=hhmmDiffMinutes(start,end)。
 * - 兜底：空对象→custom 09:00/0。
 * 供 TimeboxTemplateRepository.rowToTemplate 用。
 */
export function normalizeTemplateRow(raw: unknown): TemplateRow {
  const r = (raw ?? {}) as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : genRowId()
  const activityName = typeof r.activityName === 'string' ? r.activityName : ''
  const source: TemplateRowSource =
    r.source === 'habit' || r.source === 'task' || r.source === 'thread' || r.source === 'custom'
      ? (r.source as TemplateRowSource)
      : 'custom'
  const sourceId = typeof r.sourceId === 'string' ? r.sourceId : undefined

  if (typeof r.defaultStart === 'string' && typeof r.defaultDuration === 'number') {
    return {
      id, activityName, source, sourceId,
      defaultStart: r.defaultStart,
      defaultDuration: r.defaultDuration,
      earliestStart: typeof r.earliestStart === 'string' ? r.earliestStart : null,
      latestStart: typeof r.latestStart === 'string' ? r.latestStart : null,
      shortestDuration: typeof r.shortestDuration === 'number' ? r.shortestDuration : null,
      activityArchetypeId: typeof r.activityArchetypeId === 'string' ? r.activityArchetypeId : null,
    }
  }
  // 旧形状 {start, end}
  const start = typeof r.start === 'string' ? r.start : '09:00'
  const end = typeof r.end === 'string' ? r.end : start
  return {
    id, activityName, source, sourceId,
    defaultStart: start,
    defaultDuration: hhmmDiffMinutes(start, end),
    earliestStart: null,
    latestStart: null,
    shortestDuration: null,
    // OV-A 防御性读取：旧形状理论上不含 archetypeId（与 defaultStart 同迁移引入），
    // 但若出现部分迁移行（有 start/end 又带 archetypeId），保留而非丢零。
    activityArchetypeId: typeof r.activityArchetypeId === 'string' ? r.activityArchetypeId : null,
  }
}

/**
 * [027-B] 行校验纯函数，返回错误信息数组（空=合法）。
 * - defaultStart 必填 HH:MM；defaultDuration > 0
 * - earliestStart/latestStart/shortestDuration 可选；存在时校验顺序/大小
 */
export function validateTemplateRow(row: TemplateRow): string[] {
  const errors: string[] = []
  if (!isValidHHMM(row.defaultStart)) errors.push('默认开始时间格式应为 HH:MM')
  if (!Number.isFinite(row.defaultDuration) || row.defaultDuration <= 0) errors.push('默认时长须大于 0 分钟')
  if (!isOptionalHHMM(row.earliestStart)) errors.push('最早开始时间格式应为 HH:MM')
  if (!isOptionalHHMM(row.latestStart)) errors.push('最迟开始时间格式应为 HH:MM')
  if (row.shortestDuration != null && (!Number.isFinite(row.shortestDuration) || row.shortestDuration < 0)) {
    errors.push('最短时长须为非负分钟数')
  }
  if (isValidHHMM(row.earliestStart) && (row.earliestStart as string) > row.defaultStart) {
    errors.push('最早开始时间不能晚于默认开始时间')
  }
  if (isValidHHMM(row.latestStart) && row.defaultStart > (row.latestStart as string)) {
    errors.push('默认开始时间不能晚于最迟开始时间')
  }
  if (row.shortestDuration != null && row.shortestDuration > row.defaultDuration) {
    errors.push('最短时长不能大于默认时长')
  }
  return errors
}
