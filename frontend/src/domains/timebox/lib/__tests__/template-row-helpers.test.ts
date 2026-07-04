/**
 * @file template-row-helpers.test
 * @brief 纯函数单元测试（[023-02]）
 */

import { describe, it, expect } from 'vitest'
import {
  WEEKDAY_LABELS,
  DEFAULT_SEGMENT_SEED,
  seedTemplateRows,
  newEmptyRow,
  sortRowsByStart,
  genRowId,
  addMinutesToHHMM,
} from '../template-row-helpers'
import type { TemplateRow } from '@/lib/db/schema'

describe('WEEKDAY_LABELS', () => {
  it('应返回 7 项且 0=周日 .. 6=周六', () => {
    expect(WEEKDAY_LABELS).toHaveLength(7)
    expect(WEEKDAY_LABELS[0]?.value).toBe(0)
    expect(WEEKDAY_LABELS[6]?.value).toBe(6)
  })

  it('每项必须有 short / long 字段', () => {
    for (const w of WEEKDAY_LABELS) {
      expect(typeof w.short).toBe('string')
      expect(typeof w.long).toBe('string')
      expect(w.short.length).toBeGreaterThan(0)
      expect(w.long.length).toBeGreaterThan(0)
    }
  })

  it('short 字段应为单字符「日一二三四五六」', () => {
    expect(WEEKDAY_LABELS.map((w) => w.short).join('')).toBe('日一二三四五六')
  })

  it('long 字段应为「周日/周一/.../周六」', () => {
    expect(WEEKDAY_LABELS.map((w) => w.long).join('/')).toBe('周日/周一/周二/周三/周四/周五/周六')
  })
})

describe('genRowId', () => {
  it('应返回非空字符串', () => {
    const id = genRowId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('两次调用应返回不同 id', () => {
    expect(genRowId()).not.toBe(genRowId())
  })
})

describe('DEFAULT_SEGMENT_SEED', () => {
  it('应有 7 段', () => {
    expect(DEFAULT_SEGMENT_SEED).toHaveLength(7)
  })

  it('第 0 段应是「起床 07:00–07:30」', () => {
    expect(DEFAULT_SEGMENT_SEED[0]?.activityName).toBe('起床')
    expect(DEFAULT_SEGMENT_SEED[0]?.start).toBe('07:00')
    expect(DEFAULT_SEGMENT_SEED[0]?.end).toBe('07:30')
  })
})

describe('seedTemplateRows', () => {
  it('默认应返回 7 条 custom 行，固定时间表', () => {
    const rows = seedTemplateRows()
    expect(rows).toHaveLength(7)
    for (const r of rows) {
      expect(r.source).toBe('custom')
      expect(r.sourceId).toBeUndefined()
    }
    expect(rows[0]?.activityName).toBe('起床')
    expect(rows[0]?.start).toBe('07:00')
    expect(rows[0]?.end).toBe('07:30')
  })

  it('idGen 注入时可自定义 id 生成', () => {
    let n = 0
    const rows = seedTemplateRows(() => `fixed-${++n}`)
    expect(rows.map((r) => r.id)).toEqual(['fixed-1', 'fixed-2', 'fixed-3', 'fixed-4', 'fixed-5', 'fixed-6', 'fixed-7'])
  })

  it('生成的行 id 应全部互不相同（默认 randomUUID）', () => {
    const rows = seedTemplateRows()
    const ids = new Set(rows.map((r) => r.id))
    expect(ids.size).toBe(7)
  })
})

describe('newEmptyRow', () => {
  it('应返回 1 条 custom 09:00–10:00 行', () => {
    const r = newEmptyRow()
    expect(r.source).toBe('custom')
    expect(r.start).toBe('09:00')
    expect(r.end).toBe('10:00')
    expect(r.sourceId).toBeUndefined()
  })

  it('activityName 应默认为空字符串', () => {
    const r = newEmptyRow()
    expect(r.activityName).toBe('')
  })

  it('应可注入 id', () => {
    const r = newEmptyRow(() => 'x')
    expect(r.id).toBe('x')
  })
})

describe('sortRowsByStart', () => {
  it('应按 start 升序', () => {
    const rows: TemplateRow[] = [
      { id: 'a', activityName: 'a', start: '12:00', end: '13:00', source: 'custom' },
      { id: 'b', activityName: 'b', start: '08:00', end: '09:00', source: 'custom' },
      { id: 'c', activityName: 'c', start: '20:00', end: '21:00', source: 'custom' },
    ]
    const sorted = sortRowsByStart(rows)
    expect(sorted.map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })

  it('应返回新数组，不修改原数组', () => {
    const rows: TemplateRow[] = [
      { id: 'a', activityName: 'a', start: '12:00', end: '13:00', source: 'custom' },
    ]
    const sorted = sortRowsByStart(rows)
    expect(sorted).not.toBe(rows)
  })

  it('空数组应返回空数组', () => {
    expect(sortRowsByStart([])).toEqual([])
  })
})

describe('addMinutesToHHMM', () => {
  it('正常加法：06:00 + 60 分钟 = 07:00', () => {
    expect(addMinutesToHHMM('06:00', 60)).toBe('07:00')
  })

  it('跨午夜：23:00 + 120 分钟 = 01:00', () => {
    expect(addMinutesToHHMM('23:00', 120)).toBe('01:00')
  })

  it('24h 倍数归一：06:00 + 1440 分钟 = 06:00', () => {
    expect(addMinutesToHHMM('06:00', 1440)).toBe('06:00')
  })

  it('零加成：06:00 + 0 分钟 = 06:00', () => {
    expect(addMinutesToHHMM('06:00', 0)).toBe('06:00')
  })

  it('边界：00:30 + 30 分钟 = 01:00', () => {
    expect(addMinutesToHHMM('00:30', 30)).toBe('01:00')
  })
})
