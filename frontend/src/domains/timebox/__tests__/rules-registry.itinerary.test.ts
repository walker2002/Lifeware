/**
 * @file rules-registry.itinerary.test
 * @brief [026] A1.6 itinerary 规则注册表单元测试
 *
 * - realtime check 行为（title / startTime / durationMin 边界）
 * - submit 聚合规则 itinerary_fields_valid（合法 / durationMin<=0 / startTime 过去）
 * - [020] registry rule 自带 meta（check/fields/message）不变式
 *
 * 与既有 timebox 范式（`rules-registry.test.ts`）保持一致：纯单元测试，不依赖 DB，
 * `startTime` 时间相关 case 用 `vi.useFakeTimers().setSystemTime` 模拟 now。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { itineraryRuleRegistry } from '../rules-registry'
import type { DomainRuleRegistry } from '@/nexus/rules'
import type { StructuredIntent } from '@/usom/types/objects'

afterEach(() => vi.useRealTimers())

const { realtime } = itineraryRuleRegistry

/** 构造测试用 StructuredIntent 桩（仅 submit check 需的最小字段） */
const baseIntent = (fields: Record<string, unknown>): StructuredIntent => ({
  id: '1' as any,
  intentionId: 'i1' as any,
  targetDomain: 'timebox',
  action: 'createItinerary',
  fields,
  confidence: 1,
  resolvedBy: 'form',
  createdAt: '',
}) as any

/** submit check 必传 ctx（[020] SubmitCheck 签名 (intent, ctx) => Promise<ValidationResult>） */
const baseCtx = (now: number) => ({ repos: {}, userId: 'u' as any, now })

describe('itinerary_title_required (realtime)', () => {
  const check = realtime.itinerary_title_required.check

  it('非空字符串 → 无错误', () => {
    expect(check('看牙医', {})).toEqual([])
  })

  it('空字符串 → 报错', () => {
    const issues = check('', {})
    expect(issues).toHaveLength(1)
    expect(issues[0]!.field).toBe('title')
  })

  it('纯空白 → 报错', () => {
    const issues = check('   ', {})
    expect(issues).toHaveLength(1)
  })

  it('undefined → 无错误（部分更新语义，submit 兜底）', () => {
    expect(check(undefined, {})).toEqual([])
  })
})

describe('itinerary_start_time_in_future (realtime)', () => {
  const check = realtime.itinerary_start_time_in_future.check

  it('未来 ISO → 无错误', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-01T00:00:00Z'))
    expect(check('2026-07-15T14:00:00Z', {})).toEqual([])
  })

  it('过去 ISO → 报错', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-15T15:00:00Z'))
    const issues = check('2026-07-15T14:00:00Z', {})
    expect(issues).toHaveLength(1)
    expect(issues[0]!.field).toBe('startTime')
  })

  it('无效格式 → 报错', () => {
    expect(check('not-a-date', {})).toHaveLength(1)
  })

  it('undefined / null / 空串 → 无错误（F2 fail-OPEN 缺值，submit 兜底）', () => {
    expect(check(undefined, {})).toEqual([])
    expect(check(null, {})).toEqual([])
    expect(check('', {})).toEqual([])
  })
})

describe('itinerary_duration_positive (realtime)', () => {
  const check = realtime.itinerary_duration_positive.check

  it('正数 → 无错误', () => {
    expect(check(60, {})).toEqual([])
  })

  it('0 → 报错', () => {
    const issues = check(0, {})
    expect(issues).toHaveLength(1)
    expect(issues[0]!.field).toBe('durationMin')
  })

  it('负数 → 报错', () => {
    const issues = check(-30, {})
    expect(issues).toHaveLength(1)
  })

  it('非 number → 报错', () => {
    const issues = check('60', {})
    expect(issues).toHaveLength(1)
    expect(issues[0]!.field).toBe('durationMin')
  })

  it('undefined / null → 无错误（F2 fail-OPEN 缺值，submit 兜底）', () => {
    expect(check(undefined, {})).toEqual([])
    expect(check(null, {})).toEqual([])
  })
})

describe('itinerary_fields_valid (submit — 聚合规则)', () => {
  const check = itineraryRuleRegistry.submit.itinerary_fields_valid.check

  it('合法字段（startTime 在 now 之后） → Passed', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-01T00:00:00Z'))
    const now = Date.parse('2026-07-01T00:00:00Z')
    const result = await check(
      baseIntent({
        title: '看牙医',
        startTime: '2026-07-15T14:00:00Z',
        durationMin: 60,
      }),
      baseCtx(now),
    )
    expect(result.kind).toBe('Passed')
  })

  it('durationMin = 0 → Rejected（durationMin 错）', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-01T00:00:00Z'))
    const now = Date.parse('2026-07-01T00:00:00Z')
    const result = (await check(
      baseIntent({
        title: 'x',
        startTime: '2026-07-15T14:00:00Z',
        durationMin: 0,
      }),
      baseCtx(now),
    )) as any
    expect(result.kind).toBe('Rejected')
    expect((result.errors as string[]).some((e) => e.includes('时长'))).toBe(true)
  })

  it('startTime 在过去 → Rejected（startTime 错）', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-15T15:00:00Z'))
    const now = Date.parse('2026-07-15T15:00:00Z')
    const result = (await check(
      baseIntent({
        title: 'x',
        startTime: '2026-07-15T14:00:00Z',
        durationMin: 60,
      }),
      baseCtx(now),
    )) as any
    expect(result.kind).toBe('Rejected')
    expect((result.errors as string[]).some((e) => e.includes('开始时间'))).toBe(true)
  })

  it('缺 title → Rejected（title 错）', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-07-01T00:00:00Z'))
    const now = Date.parse('2026-07-01T00:00:00Z')
    const result = (await check(
      baseIntent({
        startTime: '2026-07-15T14:00:00Z',
        durationMin: 60,
      }),
      baseCtx(now),
    )) as any
    expect(result.kind).toBe('Rejected')
    expect((result.errors as string[]).some((e) => e.includes('事件名称'))).toBe(true)
  })
})

// ─── [020] registry rule 自带 meta 不变式 ──────────────────────────
describe('[020] itinerary registry rule 自带 meta', () => {
  it('每条 realtime rule 含 check/fields/message 且 fields 恰 1 字段', () => {
    for (const [id, rule] of Object.entries(itineraryRuleRegistry.realtime)) {
      expect(typeof rule.check, `${id} check`).toBe('function')
      expect(Array.isArray(rule.fields), `${id} fields`).toBe(true)
      expect(rule.fields.length, `${id} fields 恰 1 字段`).toBe(1)
      expect(typeof rule.message, `${id} message`).toBe('string')
      expect(rule.message.length, `${id} message 非空`).toBeGreaterThan(0)
    }
  })

  it('submit 聚合规则 itinerary_fields_valid 含 meta', () => {
    const rule = itineraryRuleRegistry.submit.itinerary_fields_valid
    expect(rule).toBeDefined()
    expect(typeof rule.check).toBe('function')
    expect(Array.isArray(rule.fields)).toBe(true)
    expect(rule.message.length).toBeGreaterThan(0)
  })

  it('itinerary_rule_registry 类型契约 = DomainRuleRegistry（[020] SSOT）', () => {
    const r: DomainRuleRegistry = itineraryRuleRegistry
    expect(r.realtime).toBeDefined()
    expect(r.submit).toBeDefined()
  })
})
