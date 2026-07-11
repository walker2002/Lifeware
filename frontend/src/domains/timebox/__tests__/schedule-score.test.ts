/**
 * @file schedule-score.test
 * @brief [028] T7 rule-based 5 维评分（fold-in T7-fix 数学定义）
 *
 * 设计依据：docs/superpowers/specs/2026-07-09-028-schedule-proposal-design.md §P6
 * + fold-in T7-fix（数学定义 + 归一 + 三态区分）
 *
 * 5 维评分（每维 0-10，等权平均；跳过的维不计入分母）：
 *   1. coverage        — scheduledItems / totalCandidates × 10（空集 guard：跳过）
 *   2. noConflicts     — 无 SCHEDULE_OVERLAP ? 10 : 0
 *   3. energyMatch     — avg(proposal.energyMatch.score) × 10/0.9（空 proposals 跳过）
 *   4. highPriorityHit — scheduledP0P1 / totalP0P1 × 10（空集 guard：跳过）
 *   5. restMeal        — 睡眠/饮食 archetype item 已安排 ? 10 : 0
 *                       archetype 标签缺失 = 数据不可得 → 跳过（不归 0）
 *                       archetype 有但没安排 = 条件不满足 → 0 分
 *
 * handle() 末尾调 scoreSchedule，<6 分返回 warn（不 block）。
 */

import { describe, it, expect } from 'vitest'
import { scoreSchedule } from '../lib/schedule-score'
import type { GeneratedProposal } from '@/usom/types/process'

// ─── Fixtures ─────────────────────────────────────────────────────

function makeProposal(overrides: Partial<GeneratedProposal> = {}): GeneratedProposal {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    action: 'createTimebox',
    payload: {
      title: '写代码',
      date: '2026-07-15',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      sourceObjectId: 'task-1',
      ...overrides.payload,
    },
    sourceType: overrides.sourceType ?? 'task',
    priority: overrides.priority ?? 'P2',
    ...(overrides.energyMatch !== undefined
      ? { energyMatch: overrides.energyMatch }
      : { energyMatch: { required: 'medium', actual: 'medium', score: 0.6 } }),
  }
}

describe('scoreSchedule 5 维（fold-in T7-fix）', () => {
  // ─── 主路径：高分（≥8） ──────────────────────────────────────────

  it('全安排 + 0 冲突 + 高能量匹配 → 高分（≥8）', () => {
    // 3 个候选全安排 → coverage=10；无冲突 → noConflicts=10；3 个 proposal 均 energyMatch=0.9
    // → energyMatch = 0.9 * 10/0.9 = 10
    // 无 P0/P1 → highPriorityHit 跳过
    // 无 archetype → restMeal 跳过（数据不可得）
    // 总分 = avg(10, 10, 10) = 10（3 维等权）
    const proposals = [
      makeProposal({ id: 'p1', energyMatch: { required: 'high', actual: 'high', score: 0.9 } }),
      makeProposal({ id: 'p2', energyMatch: { required: 'high', actual: 'high', score: 0.9 } }),
      makeProposal({ id: 'p3', energyMatch: { required: 'high', actual: 'high', score: 0.9 } }),
    ]

    const r = scoreSchedule(proposals, {
      totalCandidates: 3,
      hasOverlap: false,
      totalP0P1: 0,
      scheduledP0P1: 0,
      hasArchetypeData: false,
      restMealScheduled: false,
    })

    expect(r.score).toBeGreaterThanOrEqual(8)
    expect(r.dimensions).toHaveProperty('coverage')
    expect(r.dimensions).toHaveProperty('noConflicts')
    expect(r.dimensions).toHaveProperty('energyMatch')
    expect(r.dimensions.coverage).toBe(10)
    expect(r.dimensions.noConflicts).toBe(10)
    expect(r.dimensions.energyMatch).toBe(10)
    // highPriorityHit / restMeal 跳过 → 不在 dimensions 内
    expect(r.dimensions).not.toHaveProperty('highPriorityHit')
    expect(r.dimensions).not.toHaveProperty('restMeal')
  })

  // ─── coverage 维 ────────────────────────────────────────────────

  it('coverage：部分安排 → scheduledItems/totalCandidates × 10', () => {
    const proposals = [
      makeProposal({ id: 'p1' }),
      makeProposal({ id: 'p2' }),
    ]
    // 2/4 = 0.5 → 5
    const r = scoreSchedule(proposals, {
      totalCandidates: 4,
      hasOverlap: false,
      totalP0P1: 0,
      scheduledP0P1: 0,
      hasArchetypeData: false,
      restMealScheduled: false,
    })

    expect(r.dimensions.coverage).toBe(5)
  })

  it('coverage 空集 guard：totalCandidates=0 → coverage 跳过（不影响总分，不归 0）', () => {
    // 无候选 → coverage 维不计入分母；noConflicts=10；energyMatch=空 → 跳过
    // 总分 = noConflicts=10（单维）
    const r = scoreSchedule([], {
      totalCandidates: 0,
      hasOverlap: false,
      totalP0P1: 0,
      scheduledP0P1: 0,
      hasArchetypeData: false,
      restMealScheduled: false,
    })

    expect(r.dimensions).not.toHaveProperty('coverage')
    expect(r.score).toBe(10)  // noConflicts 唯一计分维
  })

  // ─── noConflicts 维 ─────────────────────────────────────────────

  it('noConflicts：有 SCHEDULE_OVERLAP → 该维 = 0', () => {
    const r = scoreSchedule([], {
      totalCandidates: 0,
      hasOverlap: true,  // 冲突
      totalP0P1: 0,
      scheduledP0P1: 0,
      hasArchetypeData: false,
      restMealScheduled: false,
    })

    expect(r.dimensions.noConflicts).toBe(0)
  })

  // ─── energyMatch 维（×10/0.9 归一）────────────────────────────

  it('energyMatch score 0.9 → 归一 10（×10/0.9）', () => {
    const proposals = [
      makeProposal({ id: 'p1', energyMatch: { required: 'high', actual: 'high', score: 0.9 } }),
    ]
    const r = scoreSchedule(proposals, {
      totalCandidates: 1,
      hasOverlap: false,
      totalP0P1: 0,
      scheduledP0P1: 0,
      hasArchetypeData: false,
      restMealScheduled: false,
    })

    expect(r.dimensions.energyMatch).toBe(10)  // 0.9 × 10 / 0.9 = 10
  })

  it('energyMatch 归一：score 0.45 → 归一 5（×10/0.9）', () => {
    const proposals = [
      makeProposal({ id: 'p1', energyMatch: { required: 'medium', actual: 'low', score: 0.45 } }),
    ]
    const r = scoreSchedule(proposals, {
      totalCandidates: 1,
      hasOverlap: false,
      totalP0P1: 0,
      scheduledP0P1: 0,
      hasArchetypeData: false,
      restMealScheduled: false,
    })

    expect(r.dimensions.energyMatch).toBeCloseTo(5, 5)
  })

  it('energyMatch：score 0 → 归一 0', () => {
    const proposals = [
      makeProposal({ id: 'p1', energyMatch: { required: 'low', actual: 'low', score: 0 } }),
    ]
    const r = scoreSchedule(proposals, {
      totalCandidates: 1,
      hasOverlap: false,
      totalP0P1: 0,
      scheduledP0P1: 0,
      hasArchetypeData: false,
      restMealScheduled: false,
    })

    expect(r.dimensions.energyMatch).toBe(0)
  })

  it('energyMatch：score > 0.9 → 截断到 10（防 overflow）', () => {
    const proposals = [
      makeProposal({ id: 'p1', energyMatch: { required: 'high', actual: 'high', score: 1.0 } }),
    ]
    const r = scoreSchedule(proposals, {
      totalCandidates: 1,
      hasOverlap: false,
      totalP0P1: 0,
      scheduledP0P1: 0,
      hasArchetypeData: false,
      restMealScheduled: false,
    })

    expect(r.dimensions.energyMatch).toBe(10)  // 1.0 × 10/0.9 = 11.11 → clamped to 10
  })

  it('energyMatch：avg(score) → 多个 proposal 取平均', () => {
    const proposals = [
      makeProposal({ id: 'p1', energyMatch: { required: 'high', actual: 'high', score: 0.9 } }),
      makeProposal({ id: 'p2', energyMatch: { required: 'low', actual: 'low', score: 0.8 } }),
    ]
    // avg = (0.9 + 0.8) / 2 = 0.85 → 0.85 × 10 / 0.9 ≈ 9.444
    const r = scoreSchedule(proposals, {
      totalCandidates: 2,
      hasOverlap: false,
      totalP0P1: 0,
      scheduledP0P1: 0,
      hasArchetypeData: false,
      restMealScheduled: false,
    })

    expect(r.dimensions.energyMatch).toBeCloseTo((0.85 * 10) / 0.9, 5)
  })

  it('energyMatch 空 proposals → 该维跳过（数据不可得，不归 0）', () => {
    // proposals=[] 时 energyMatch 无值可算 → 跳过
    const r = scoreSchedule([], {
      totalCandidates: 0,
      hasOverlap: false,
      totalP0P1: 0,
      scheduledP0P1: 0,
      hasArchetypeData: false,
      restMealScheduled: false,
    })

    expect(r.dimensions).not.toHaveProperty('energyMatch')
  })

  // ─── highPriorityHit 维 ─────────────────────────────────────────

  it('highPriorityHit：totalP0P1>0 且部分命中 → scheduledP0P1/totalP0P1 × 10', () => {
    const r = scoreSchedule(
      [makeProposal({ id: 'p1' })],
      {
        totalCandidates: 5,
        hasOverlap: false,
        totalP0P1: 4,       // 4 个 P0/P1 候选
        scheduledP0P1: 2,   // 命中 2 个
        hasArchetypeData: false,
        restMealScheduled: false,
      },
    )

    expect(r.dimensions.highPriorityHit).toBe(5)  // 2/4 = 0.5 → 5
  })

  it('highPriorityHit 空集 guard：无 P0/P1 → 跳过（不影响总分，不归 0）', () => {
    const r = scoreSchedule([], {
      totalCandidates: 0,
      hasOverlap: false,
      totalP0P1: 0,        // 空集
      scheduledP0P1: 0,
      hasArchetypeData: false,
      restMealScheduled: false,
    })

    expect(r.dimensions).not.toHaveProperty('highPriorityHit')
  })

  // ─── restMeal 维（核心：三态区分） ──────────────────────────────

  it('restMeal 数据不可得：archetype 标签缺失 → 跳过（非 0 分）', () => {
    // hasArchetypeData=false → restMeal 跳过，不计入分母，不影响总分
    const r = scoreSchedule([], {
      totalCandidates: 0,
      hasOverlap: false,
      totalP0P1: 0,
      scheduledP0P1: 0,
      hasArchetypeData: false,  // 数据不可得
      restMealScheduled: false,
    })

    expect(r.dimensions).not.toHaveProperty('restMeal')
  })

  it('restMeal 条件不满足：有 archetype 但没安排睡眠/饮食 → 0 分', () => {
    // hasArchetypeData=true 但 restMealScheduled=false → 0 分（计入分母）
    const r = scoreSchedule([], {
      totalCandidates: 0,
      hasOverlap: false,
      totalP0P1: 0,
      scheduledP0P1: 0,
      hasArchetypeData: true,    // 数据可得
      restMealScheduled: false,  // 但没安排 → 0 分
    })

    expect(r.dimensions.restMeal).toBe(0)
  })

  it('restMeal 条件满足：archetype 已安排睡眠/饮食 → 10 分', () => {
    const r = scoreSchedule([], {
      totalCandidates: 0,
      hasOverlap: false,
      totalP0P1: 0,
      scheduledP0P1: 0,
      hasArchetypeData: true,
      restMealScheduled: true,
    })

    expect(r.dimensions.restMeal).toBe(10)
  })

  // ─── 等权平均（关键数学验证） ──────────────────────────────────

  it('等权平均：跳过维不计入分母（coverage 跳过时不影响其他维权重）', () => {
    // 场景：totalCandidates=0 → coverage 跳过；noConflicts=10；energyMatch 跳过（空 proposals）
    //   restMeal=0（条件不满足）
    // 总分 = avg(10, 0) = 5（仅 2 维计权）
    const r = scoreSchedule([], {
      totalCandidates: 0,         // → coverage 跳过
      hasOverlap: false,          // → noConflicts=10
      totalP0P1: 0,               // → highPriorityHit 跳过
      scheduledP0P1: 0,
      hasArchetypeData: true,     // → restMeal 计权
      restMealScheduled: false,   // → restMeal=0
    })

    expect(r.dimensions).not.toHaveProperty('coverage')
    expect(r.dimensions).not.toHaveProperty('energyMatch')
    expect(r.dimensions).not.toHaveProperty('highPriorityHit')
    expect(r.dimensions.noConflicts).toBe(10)
    expect(r.dimensions.restMeal).toBe(0)
    expect(r.score).toBe(5)  // (10 + 0) / 2 = 5
  })

  it('全维等权：5 维全参与 → 简单平均', () => {
    // coverage=8, noConflicts=10, energyMatch=6, highPriorityHit=4, restMeal=10
    // avg = (8+10+6+4+10)/5 = 7.6
    const r = scoreSchedule(
      [
        makeProposal({
          id: 'p1',
          energyMatch: { required: 'medium', actual: 'medium', score: 0.54 },  // 0.54 × 10/0.9 = 6
        }),
      ],
      {
        totalCandidates: 5,        // 1/5 → coverage = 2? wait — 1/5 * 10 = 2
        hasOverlap: false,
        totalP0P1: 2,
        scheduledP0P1: 2,          // 2/2 = 10
        hasArchetypeData: true,
        restMealScheduled: true,   // 10
      },
    )

    // coverage = 1/5*10 = 2；noConflicts=10；energyMatch=6；highPriorityHit=10；restMeal=10
    // avg = (2+10+6+10+10)/5 = 7.6
    expect(r.dimensions.coverage).toBe(2)
    expect(r.dimensions.noConflicts).toBe(10)
    expect(r.dimensions.energyMatch).toBeCloseTo(6, 5)
    expect(r.dimensions.highPriorityHit).toBe(10)
    expect(r.dimensions.restMeal).toBe(10)
    expect(r.score).toBeCloseTo(7.6, 5)
  })

  // ─── <6 warn 阈值（design doc P6） ──────────────────────────────

  it('<6 分 → handle 需返回 warn（不 block；本测试只验证纯函数行为）', () => {
    // 极差情况：全覆盖但全冲突 + 全低能量
    const proposals = [
      makeProposal({ id: 'p1', energyMatch: { required: 'low', actual: 'low', score: 0 } }),
    ]
    const r = scoreSchedule(proposals, {
      totalCandidates: 1,
      hasOverlap: true,           // → noConflicts=0
      totalP0P1: 0,
      scheduledP0P1: 0,
      hasArchetypeData: true,
      restMealScheduled: false,   // → restMeal=0
    })

    // coverage=10, noConflicts=0, energyMatch=0, restMeal=0
    // avg = (10+0+0+0)/4 = 2.5
    expect(r.score).toBeLessThan(6)
  })

  // ─── 鲁棒性 ──────────────────────────────────────────────────

  it('鲁棒性：opts 缺省字段走 0/skip（不抛错）', () => {
    // 最小 opts：空 proposals + 空 tier0 + 无 archetype data → 4 维 skip，只 noConflicts=10
    const r = scoreSchedule([], {})
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(10)
    // [028] I-5 polish: 锁死 value — 仅 noConflicts 计分（默认值无 overlap → 10），总分 10
    expect(r.dimensions).toEqual({ noConflicts: 10 })
    expect(r.score).toBe(10)
  })

  it('鲁棒性：dimensions 是 plain object（Object.fromEntries 行为）', () => {
    const r = scoreSchedule([], { hasOverlap: false })
    expect(typeof r.dimensions).toBe('object')
    expect(r.dimensions).not.toBeNull()
  })
})
