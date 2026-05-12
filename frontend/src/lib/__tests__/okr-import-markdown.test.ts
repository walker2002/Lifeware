import { describe, it, expect } from 'vitest'
import { parseOKRMarkdown, renderOKRsToMarkdown } from '@/lib/okr-import/markdown-parser'

describe('parseOKRMarkdown', () => {
  it('解析包含单个目标和两个 KR 的 Markdown', () => {
    const md = `## Objective: 提升产品质量
- **类型**: 承诺型
- **优先级**: P1
- **周期类型**: 季
- **周期**: 2026-Q2 (2026-04-01 ~ 2026-06-30)
- **描述**: 通过系统化质量管理提升产品整体质量

### KR 1: 代码覆盖率提升至 85%
- **目标值**: 85
- **单位**: %
- **截止日期**: 2026-06-30

### KR 2: 客户满意度评分达到 4.5
- **目标值**: 4.5
- **单位**: 分
- **截止日期**: 2026-06-30`

    const result = parseOKRMarkdown(md)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('提升产品质量')
    expect(result[0].okrType).toBe('committed')
    expect(result[0].priority).toBe('P1')
    expect(result[0].periodType).toBe('quarterly')
    expect(result[0].periodStart).toBe('2026-04-01')
    expect(result[0].periodEnd).toBe('2026-06-30')
    expect(result[0].description).toBe('通过系统化质量管理提升产品整体质量')
    expect(result[0].keyResults).toHaveLength(2)
    expect(result[0].keyResults[0].title).toBe('代码覆盖率提升至 85%')
    expect(result[0].keyResults[0].targetValue).toBe(85)
    expect(result[0].keyResults[0].unit).toBe('%')
    expect(result[0].keyResults[0].dueDate).toBe('2026-06-30')
    expect(result[0].keyResults[1].title).toBe('客户满意度评分达到 4.5')
    expect(result[0].keyResults[1].targetValue).toBe(4.5)
    expect(result[0].keyResults[1].unit).toBe('分')
  })

  it('解析多个目标（用 --- 分隔）', () => {
    const md = `## Objective: 目标一
- **类型**: 承诺型
- **优先级**: P1
- **周期类型**: 季
- **周期**: 2026-Q2 (2026-04-01 ~ 2026-06-30)

### KR 1: KR一
- **目标值**: 100
- **单位**: 个

---

## Objective: 目标二
- **类型**: 愿景型
- **优先级**: P2
- **周期类型**: 年
- **周期**: 2026 (2026-01-01 ~ 2026-12-31)

### KR 1: KR二
- **目标值**: 50
- **单位**: %`

    const result = parseOKRMarkdown(md)
    expect(result).toHaveLength(2)
    expect(result[0].title).toBe('目标一')
    expect(result[0].okrType).toBe('committed')
    expect(result[1].title).toBe('目标二')
    expect(result[1].okrType).toBe('visionary')
    expect(result[1].priority).toBe('P2')
    expect(result[1].periodType).toBe('annual')
    expect(result[1].periodStart).toBe('2026-01-01')
    expect(result[1].periodEnd).toBe('2026-12-31')
  })

  it('可选字段缺失时返回 undefined', () => {
    const md = `## Objective: 简单目标

### KR 1: 简单KR`

    const result = parseOKRMarkdown(md)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('简单目标')
    expect(result[0].okrType).toBeUndefined()
    expect(result[0].priority).toBeUndefined()
    expect(result[0].periodStart).toBeUndefined()
    expect(result[0].keyResults).toHaveLength(1)
    expect(result[0].keyResults[0].targetValue).toBeUndefined()
  })

  it('空字符串返回空数组', () => {
    expect(parseOKRMarkdown('')).toHaveLength(0)
    expect(parseOKRMarkdown('   ')).toHaveLength(0)
  })
})

describe('renderOKRsToMarkdown', () => {
  it('将 ParsedObjective 数组渲染为规范 Markdown', () => {
    const objectives = [
      {
        title: '提升产品质量',
        okrType: 'committed' as const,
        priority: 'P1' as const,
        periodType: 'quarterly',
        periodStart: '2026-04-01',
        periodEnd: '2026-06-30',
        description: '系统化质量管理',
        keyResults: [
          { title: '代码覆盖率 85%', targetValue: 85, unit: '%' },
        ],
      },
    ]

    const md = renderOKRsToMarkdown(objectives)
    expect(md).toContain('## Objective: 提升产品质量')
    expect(md).toContain('- **类型**: 承诺型')
    expect(md).toContain('- **优先级**: P1')
    expect(md).toContain('- **周期类型**: 季')
    expect(md).toContain('- **周期**: 2026-Q2 (2026-04-01 ~ 2026-06-30)')
    expect(md).toContain('- **描述**: 系统化质量管理')
    expect(md).toContain('### KR 1: 代码覆盖率 85%')
    expect(md).toContain('- **目标值**: 85')
    expect(md).toContain('- **单位**: %')
  })

  it('多个目标之间用 --- 分隔', () => {
    const objectives = [
      { title: '目标A', keyResults: [{ title: 'KR1' }] },
      { title: '目标B', keyResults: [{ title: 'KR2' }] },
    ]
    const md = renderOKRsToMarkdown(objectives)
    expect(md).toContain('---')
    expect(md).toContain('## Objective: 目标A')
    expect(md).toContain('## Objective: 目标B')
  })

  it('roundtrip: render → parse 保持数据一致', () => {
    const original = [
      {
        title: '提升用户留存',
        okrType: 'committed' as const,
        priority: 'P0' as const,
        periodType: 'monthly',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
        keyResults: [
          { title: '留存率达 80%', targetValue: 80, unit: '%', dueDate: '2026-05-31' },
          { title: 'DAU 突破 1万', targetValue: 10000, unit: '人' },
        ],
      },
    ]
    const md = renderOKRsToMarkdown(original)
    const parsed = parseOKRMarkdown(md)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].title).toBe('提升用户留存')
    expect(parsed[0].okrType).toBe('committed')
    expect(parsed[0].priority).toBe('P0')
    expect(parsed[0].periodStart).toBe('2026-05-01')
    expect(parsed[0].keyResults).toHaveLength(2)
    expect(parsed[0].keyResults[0].targetValue).toBe(80)
    expect(parsed[0].keyResults[1].targetValue).toBe(10000)
  })
})
