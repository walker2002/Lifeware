/**
 * @file schedule-rules.test @brief [028] T3 §04 硬规则词典序排序
 *
 * §04 词典序 4 层（design doc P2）：
 *   1. 截止紧迫：NL 明确指定时间的 item（fixedTime）永远排前
 *   2. 能量匹配：archetype-ActivityLabel「中断容忍」标签加权
 *   3. timebox lock：archetype=「饮食」l1Category='生存' + l2Name='饮食' 固定时段
 *   4. OKR 对齐：task 优先级（P0 > P1 > P2 > P3）
 *
 * 严格词典序：层 1 的低优 item 永远排在层 4 的高优前。
 */

import { describe, it, expect } from 'vitest'
import { sortByHardRules } from '../lib/schedule-rules'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

// ─── 工具：构造 fixture ──────────────────────────────────────────

/**
 * 构造一个最小可用 archetype。interruptTolerance 默认 'medium'（非加权），
 * l1Category 默认 '工作'（非饮食/睡眠）。
 */
function makeArchetype(overrides: Partial<ActivityArchetype> = {}): ActivityArchetype {
  return {
    id: overrides.id ?? 'ar-default',
    userId: 'u1' as any,
    l1Category: '工作',
    l2Name: '通用',
    energyCost: { physical: 5, mental: 5, emotional: 5, creative: 5 },
    activityLabel: {
      enjoyment: 5,
      typicalDuration: 60,
      interruptTolerance: 'medium',
      environment: [],
      location: [],
      parallelizable: false,
    },
    synonyms: [],
    isSystem: false,
    createdAt: '2026-01-01T00:00:00Z' as any,
    updatedAt: '2026-01-01T00:00:00Z' as any,
    ...overrides,
  } as ActivityArchetype
}

/**
 * 构造 TimeboxItem-like。允许 partial 字段，缺省按类型兜底。
 */
function makeItem(overrides: Record<string, unknown>) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    title: overrides.title ?? 'item',
    sourceType: overrides.sourceType ?? 'task',
    priority: overrides.priority ?? 'P2',
    durationMinutes: overrides.durationMinutes ?? 60,
    relatedObjectId: overrides.relatedObjectId ?? 'rel-1',
    ...overrides,
  } as any
}

// ─── 测试矩阵 ──────────────────────────────────────────────────

describe('sortByHardRules §04 词典序', () => {
  // ─── 层 1：截止紧迫（NL 明确时间） ─────────────────────────────

  it('层 1 截止紧迫：NL 明确时间的 item（fixedTime）永远排前', () => {
    const items = [
      makeItem({ id: 'a', priority: 'P1', title: '写报告' }),
      makeItem({ id: 'b', priority: 'P3', title: '接娃', fixedTime: { hour: 16 } }),  // NL 指定 16:00
    ]
    const sorted = sortByHardRules(items, {})
    expect(sorted[0].id).toBe('b')  // fixedTime 排前，无视 P3
  })

  it('层 1：多 fixedTime item 按 hour 升序（越早越紧迫）', () => {
    const items = [
      makeItem({ id: 'late', priority: 'P0', fixedTime: { hour: 22 } }),
      makeItem({ id: 'early', priority: 'P3', fixedTime: { hour: 7 } }),
    ]
    const sorted = sortByHardRules(items, {})
    expect(sorted.map(i => i.id)).toEqual(['early', 'late'])
  })

  // ─── 层 2：能量匹配（archetype interruptTolerance 加权） ──────

  it('层 2 能量匹配：archetype interruptTolerance=high 优先于无标签/medium', () => {
    // 同样无 fixedTime、同层 4 P1；archetype high 标签 item 排前
    const items = [
      makeItem({ id: 'normal', priority: 'P1', archetypeId: 'ar-normal' }),
      makeItem({ id: 'flexible', priority: 'P1', archetypeId: 'ar-flex' }),
    ]
    const archetypeMap: Record<string, ActivityArchetype> = {
      'ar-normal': makeArchetype({ id: 'ar-normal' }),                          // medium
      'ar-flex': makeArchetype({
        id: 'ar-flex',
        activityLabel: {
          enjoyment: 5,
          typicalDuration: 60,
          interruptTolerance: 'high',  // 中断容忍高 → 灵活 → 优先
          environment: [],
          location: [],
          parallelizable: false,
        },
      }),
    }
    const sorted = sortByHardRules(items, { archetypeMap })
    expect(sorted[0].id).toBe('flexible')
  })

  it('层 2：archetype interruptTolerance=low 排到 non-archetype 之后', () => {
    // non-archetype = 无法查 archetypeMap（archetypeMap 空），视作「无标签」，中层 2 内排前
    const items = [
      makeItem({ id: 'locked', priority: 'P1', archetypeId: 'ar-locked' }),
      makeItem({ id: 'noarch', priority: 'P1' }),  // 无 archetypeId
    ]
    const archetypeMap: Record<string, ActivityArchetype> = {
      'ar-locked': makeArchetype({
        id: 'ar-locked',
        activityLabel: {
          enjoyment: 5, typicalDuration: 60,
          interruptTolerance: 'low',  // 不可中断 → 排后
          environment: [], location: [], parallelizable: false,
        },
      }),
    }
    const sorted = sortByHardRules(items, { archetypeMap })
    expect(sorted[0].id).toBe('noarch')  // 无 archetype 排前
    expect(sorted[1].id).toBe('locked')
  })

  it('层 2：睡眠 archetype（l1=生存 l2=睡眠）→ 固定时段（rank=0 内部按 hour）', () => {
    // 睡眠 item 标记为「睡眠原型」后，必排到层 2 内首（与中断容忍 high 同层，但睡眠更严）
    // 由设计：睡眠 = 固定时段不可打断 → 优先排前
    const items = [
      makeItem({ id: 'flex', priority: 'P1', archetypeId: 'ar-flex' }),
      makeItem({ id: 'sleep', priority: 'P1', archetypeId: 'ar-sleep' }),
    ]
    const archetypeMap: Record<string, ActivityArchetype> = {
      'ar-flex': makeArchetype({
        id: 'ar-flex',
        activityLabel: {
          enjoyment: 5, typicalDuration: 60, interruptTolerance: 'high',
          environment: [], location: [], parallelizable: false,
        },
      }),
      'ar-sleep': makeArchetype({
        id: 'ar-sleep',
        l1Category: '生存',
        l2Name: '睡眠',
      }),
    }
    const sorted = sortByHardRules(items, { archetypeMap })
    expect(sorted[0].id).toBe('sleep')  // 睡眠固定时段优先
  })

  // ─── 层 3：timebox lock（饮食原型固定时段） ─────────────────

  it('层 3 timebox lock：饮食 archetype（l1=生存 l2=饮食）→ 固定时段', () => {
    // 饮食 item 排在层 3（timebox lock）；同优先级与无 fixedTime 时它优先于层 4 任务
    const items = [
      makeItem({ id: 'task', priority: 'P1' }),  // 层 4 P1
      makeItem({ id: 'meal', priority: 'P1', archetypeId: 'ar-meal' }),
    ]
    const archetypeMap: Record<string, ActivityArchetype> = {
      'ar-meal': makeArchetype({ id: 'ar-meal', l1Category: '生存', l2Name: '饮食' }),
    }
    const sorted = sortByHardRules(items, { archetypeMap })
    expect(sorted[0].id).toBe('meal')  // 层 3（饮食 lock）严格 > 层 4（P1 任务）
  })

  // ─── 层 4：OKR 对齐（同层内按 priority） ──────────────────────

  it('层 4 OKR 对齐：同层内按 priority P0 > P1 > P2 > P3', () => {
    const items = [
      makeItem({ id: 'a', priority: 'P3' }),
      makeItem({ id: 'b', priority: 'P0' }),
      makeItem({ id: 'c', priority: 'P1' }),
    ]
    const sorted = sortByHardRules(items, {})
    expect(sorted.map(i => i.priority)).toEqual(['P0', 'P1', 'P3'])
  })

  it('层 4：priority 同分时按 sourceType 稳定顺序（planned < habit < task < adhoc）', () => {
    // 验证词典序内 layer 4 内同 priority 的次级排序
    const items = [
      makeItem({ id: 'task', priority: 'P1', sourceType: 'task' }),
      makeItem({ id: 'planned', priority: 'P1', sourceType: 'planned' }),
      makeItem({ id: 'habit', priority: 'P1', sourceType: 'habit' }),
    ]
    const sorted = sortByHardRules(items, {})
    expect(sorted.map(i => i.sourceType)).toEqual(['planned', 'habit', 'task'])
  })

  // ─── 严格词典序：层间不容跨越 ─────────────────────────────────

  it('层间严格词典序：层 1 的低优 item 排在层 4 的高优前', () => {
    const items = [
      makeItem({ id: 'a', priority: 'P3', fixedTime: { hour: 16 } }),  // 层 1
      makeItem({ id: 'b', priority: 'P0' }),                            // 层 4 P0
    ]
    const sorted = sortByHardRules(items, {})
    expect(sorted[0].id).toBe('a')  // 层 1 永远 > 层 4，即使 P3 < P0
  })

  it('层间严格词典序：层 3 饮食 lock 排在层 4 P0 任务前', () => {
    const items = [
      makeItem({ id: 'urgent', priority: 'P0' }),                                  // 层 4
      makeItem({ id: 'meal', priority: 'P1', archetypeId: 'ar-meal' }),            // 层 3
    ]
    const archetypeMap: Record<string, ActivityArchetype> = {
      'ar-meal': makeArchetype({ id: 'ar-meal', l1Category: '生存', l2Name: '饮食' }),
    }
    const sorted = sortByHardRules(items, { archetypeMap })
    expect(sorted[0].id).toBe('meal')
  })

  // ─── 鲁棒性 ─────────────────────────────────────────────────

  it('鲁棒性：空数组返回空数组', () => {
    expect(sortByHardRules([], {})).toEqual([])
  })

  it('鲁棒性：缺省字段（无 archetypeId / 无 priority 映射）走 default rank（不抛错）', () => {
    const items = [
      makeItem({ id: 'x', priority: 'P99' as any, sourceType: 'unknown' as any }),
      makeItem({ id: 'y', priority: 'P2', sourceType: 'task' }),
    ]
    const sorted = sortByHardRules(items, {})
    expect(sorted).toHaveLength(2)
    // [028] I-5 polish: 锁死排序（P2 rank < P99 default rank → y 在前）
    expect(sorted.map(i => i.id)).toEqual(['y', 'x'])
  })

  it('鲁棒性：archetypeMap 缺省 = {} 时不查 archetype（不抛错）', () => {
    const items = [
      makeItem({ id: 'a', priority: 'P1', archetypeId: 'missing' }),
      makeItem({ id: 'b', priority: 'P1' }),
    ]
    expect(() => sortByHardRules(items, {})).not.toThrow()
  })

  it('不修改原数组（纯函数）', () => {
    const items = [
      makeItem({ id: 'a', priority: 'P3' }),
      makeItem({ id: 'b', priority: 'P0' }),
    ]
    const original = [...items]
    sortByHardRules(items, {})
    expect(items).toEqual(original)
  })
})