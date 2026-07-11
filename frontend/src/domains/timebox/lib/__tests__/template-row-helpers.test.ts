/**
 * @file template-row-helpers.test
 * @brief 行纯函数单元测试（[023-02] / [027-B] 形状重构）
 */
import { describe, it, expect } from 'vitest'
import {
  WEEKDAY_LABELS,
  DEFAULT_SEGMENT_SEED,
  seedTemplateRows,
  newEmptyRow,
  sortRowsByDefaultStart,
  genRowId,
  addMinutesToHHMM,
  hhmmDiffMinutes,
  normalizeTemplateRow,
  validateTemplateRow,
} from '../template-row-helpers'
import type { TemplateRow } from '@/lib/db/schema'

describe('DEFAULT_SEGMENT_SEED', () => {
  it('应有 7 段且为新形状（defaultStart/defaultDuration）', () => {
    expect(DEFAULT_SEGMENT_SEED).toHaveLength(7)
    expect(DEFAULT_SEGMENT_SEED[0]).toEqual({ activityName: '起床', defaultStart: '07:00', defaultDuration: 30 })
    // 睡眠跨午夜 23:00→07:00 = 480 分钟
    expect(DEFAULT_SEGMENT_SEED[6]).toEqual({ activityName: '睡眠', defaultStart: '23:00', defaultDuration: 480 })
  })
})

describe('seedTemplateRows', () => {
  it('默认返回 7 条 custom 新形状行', () => {
    const rows = seedTemplateRows(() => 'fixed')
    expect(rows).toHaveLength(7)
    expect(rows[0]).toMatchObject({ activityName: '起床', defaultStart: '07:00', defaultDuration: 30, source: 'custom' })
    expect(rows[0]).not.toHaveProperty('start')
    expect(rows[0]).not.toHaveProperty('end')
  })
})

describe('newEmptyRow', () => {
  it('返回 custom 行 09:00 / 60 分钟', () => {
    const r = newEmptyRow(() => 'x')
    expect(r).toMatchObject({ id: 'x', source: 'custom', defaultStart: '09:00', defaultDuration: 60, activityName: '' })
    expect(r).not.toHaveProperty('start')
  })
})

describe('sortRowsByDefaultStart', () => {
  it('按 defaultStart 升序，返回新数组', () => {
    const rows: TemplateRow[] = [
      { id: 'a', activityName: 'a', defaultStart: '12:00', defaultDuration: 60, source: 'custom' },
      { id: 'b', activityName: 'b', defaultStart: '08:00', defaultDuration: 60, source: 'custom' },
    ]
    const sorted = sortRowsByDefaultStart(rows)
    expect(sorted.map((r) => r.id)).toEqual(['b', 'a'])
    expect(sorted).not.toBe(rows)
  })
})

describe('addMinutesToHHMM', () => {
  it('跨午夜 23:00 + 120 = 01:00', () => {
    expect(addMinutesToHHMM('23:00', 120)).toBe('01:00')
  })
})

describe('hhmmDiffMinutes', () => {
  it('正常差：09:00→12:00 = 180', () => {
    expect(hhmmDiffMinutes('09:00', '12:00')).toBe(180)
  })
  it('跨午夜：23:00→07:00 = 480', () => {
    expect(hhmmDiffMinutes('23:00', '07:00')).toBe(480)
  })
  it('同时刻 = 0', () => {
    expect(hhmmDiffMinutes('09:00', '09:00')).toBe(0)
  })
})

describe('normalizeTemplateRow', () => {
  it('新形状直通，缺省约束/archetype 置 null', () => {
    const out = normalizeTemplateRow({ id: 'r1', activityName: '晨跑', defaultStart: '06:00', defaultDuration: 30, source: 'habit', sourceId: 'h1' })
    expect(out).toMatchObject({ id: 'r1', defaultStart: '06:00', defaultDuration: 30 })
    expect(out.earliestStart).toBeNull()
    expect(out.latestStart).toBeNull()
    expect(out.shortestDuration).toBeNull()
    expect(out.activityArchetypeId).toBeNull()
  })
  it('旧形状 {start,end} 自愈为 defaultStart + diff', () => {
    const out = normalizeTemplateRow({ id: 'r2', activityName: '睡眠', start: '23:00', end: '07:00', source: 'custom' })
    expect(out.defaultStart).toBe('23:00')
    expect(out.defaultDuration).toBe(480)
    expect(out.activityArchetypeId).toBeNull()
  })
  it('旧形状若带 archetypeId 则保留（OV-A 防御性读取，防部分迁移丢字段）', () => {
    const out = normalizeTemplateRow({ id: 'r3', start: '09:00', end: '10:00', source: 'custom', activityArchetypeId: 'a-1' })
    expect(out.activityArchetypeId).toBe('a-1')
  })
  it('空对象兜底为 custom 09:00/0', () => {
    const out = normalizeTemplateRow({})
    expect(out.source).toBe('custom')
    expect(out.defaultStart).toBe('09:00')
  })
})

describe('validateTemplateRow', () => {
  const ok = (r: Partial<TemplateRow>): string[] => validateTemplateRow({ id: 'x', activityName: '', defaultStart: '09:00', defaultDuration: 60, source: 'custom', ...r })

  it('合法行无错', () => {
    expect(ok({})).toEqual([])
  })
  it('defaultDuration <= 0 报错', () => {
    expect(ok({ defaultDuration: 0 }).some((e) => e.includes('默认时长'))).toBe(true)
  })
  it('defaultStart 格式非法报错', () => {
    expect(ok({ defaultStart: '9:00' }).some((e) => e.includes('默认开始时间'))).toBe(true)
  })
  it('earliestStart 晚于 defaultStart 报错', () => {
    expect(ok({ earliestStart: '10:00', defaultStart: '09:00' }).some((e) => e.includes('最早开始'))).toBe(true)
  })
  it('defaultStart 晚于 latestStart 报错', () => {
    expect(ok({ defaultStart: '09:00', latestStart: '08:00' }).some((e) => e.includes('最迟开始'))).toBe(true)
  })
  it('shortestDuration > defaultDuration 报错', () => {
    expect(ok({ shortestDuration: 120, defaultDuration: 60 }).some((e) => e.includes('最短时长'))).toBe(true)
  })
  it('可选约束留空合法', () => {
    expect(ok({ earliestStart: null, latestStart: null, shortestDuration: null })).toEqual([])
  })
})
