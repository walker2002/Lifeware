/**
 * @file cycle-transitions.test
 * @brief Cycle SM transition 表测试（[023.12] T6 AM3）
 *
 * [023.12] T6 4 态收敛：draft / approved / finished / reviewed。
 * 5 transitions（[AM10]）：null→draft(create) / draft→approved(approve) /
 *   approved→finished(finish) / finished→reviewed(review) /
 *   reviewed→finished(revert, 一致性回退)。terminal_states=[]（无终态，可反复 review）。
 *
 * 旧 4 动作（plan / start / end / overtime）整体退役——
 * 守 AM：所有旧动作对所有 from 状态拒绝。
 *
 * AM3 要求至少 4 case：reviewed→finished (legal), finished→finished (rejected),
 * approved→draft (rejected), finished→approved (rejected)——
 * 本文件覆盖 20+ case 把整张表锁死。
 */

import { describe, it, expect } from 'vitest'
import { cycleTransitions, findTransition } from '../transitions'
import type { CycleStatus } from '@/usom/types/primitives'

/** CycleStatus | null 的 from 校验 */
type AnyStatus = CycleStatus | null

/**
 * 检查「是否在 transitions 表中能匹配一条合法转换」
 * @param from - 源状态（null = 创建）
 * @param action - 动作名
 * @returns true = 该 (from, action) 在表中存在
 */
function canTransition(from: AnyStatus, action: string): boolean {
  return findTransition(cycleTransitions, from as CycleStatus, action) !== null
}

describe('cycleTransitions（[023.12] T6 4 态收敛表）', () => {
  // ─── 表结构断言 ────────────────────────────────────────────────

  it('表含 5 条转换（1 create + 1 approve + 1 finish + 1 review + 1 revert）', () => {
    expect(cycleTransitions).toHaveLength(5)
  })

  it('表不包含 plan / start / end 旧动作', () => {
    const actions = cycleTransitions.map(t => t.action)
    expect(actions).not.toContain('plan')
    expect(actions).not.toContain('start')
    expect(actions).not.toContain('end')
  })

  // ─── 合法转换（[AM3] 必含 case + bonus）────────────────────────

  it('null→draft（create）合法', () => {
    expect(canTransition(null, 'create')).toBe(true)
  })

  it('draft→approved（approve）合法', () => {
    expect(canTransition('draft', 'approve')).toBe(true)
  })

  it('approved→finished（finish）合法', () => {
    expect(canTransition('approved', 'finish')).toBe(true)
  })

  it('finished→reviewed（review）合法', () => {
    expect(canTransition('finished', 'review')).toBe(true)
  })

  // [AM3] 必含 4 case 之一：revert reviewed→finished
  it('reviewed→finished（revert）合法（[AM10] 一致性回退，保留 reviewedAt）', () => {
    expect(canTransition('reviewed', 'revert')).toBe(true)
  })

  // ─── 同态拒绝（[AM3] 必含 case）────────────────────────────────

  // [AM3] 必含 4 case 之一：finished→finished rejected
  it('finished→finished（同态）拒绝', () => {
    expect(canTransition('finished', 'finish')).toBe(false)
  })

  // [AM3] bonus：reviewed→reviewed rejected
  it('reviewed→reviewed（同态）拒绝', () => {
    expect(canTransition('reviewed', 'review')).toBe(false)
  })

  it('draft→draft（同态）拒绝', () => {
    expect(canTransition('draft', 'approve')).toBe(true) // sanity
    expect(canTransition('draft', 'create')).toBe(false)
  })

  it('approved→approved（同态）拒绝', () => {
    expect(canTransition('approved', 'finish')).toBe(true) // sanity
    expect(canTransition('approved', 'approve')).toBe(false)
  })

  // ─── 非法前向/后向（[AM3] 必含 case）──────────────────────────

  // [AM3] 必含 4 case 之一：approved→draft rejected
  // 不能从 approved 直接回 draft（必须先 reviewed→finished→...）。
  // 等等：revert 只能 reviewed→finished。approved→draft 没有合法路径。
  it('approved→draft（非法回退）拒绝（只能经 reviewed→finished 走）', () => {
    // approved 没有任何 from=approved 且 to=draft 的转换
    const fromApproved = cycleTransitions.filter(t => t.from === 'approved')
    for (const t of fromApproved) {
      expect(t.to).not.toBe('draft')
    }
  })

  // [AM3] 必含 4 case 之一：finished→approved rejected
  it('finished→approved（非法回退）拒绝', () => {
    const fromFinished = cycleTransitions.filter(t => t.from === 'finished')
    for (const t of fromFinished) {
      expect(t.to).not.toBe('approved')
    }
  })

  // bonus：draft→finished 跳级拒绝
  it('draft→finished（跳级）拒绝（必须经 approved）', () => {
    const fromDraft = cycleTransitions.filter(t => t.from === 'draft')
    for (const t of fromDraft) {
      expect(t.to).not.toBe('finished')
    }
  })

  // ─── 旧动作拒绝（守 AM7 隐含：旧 plan/start/end 不应在新表里合法）───

  it('旧 plan 动作对所有 from 状态拒绝（plan 已退役）', () => {
    expect(canTransition('draft', 'plan')).toBe(false)
    expect(canTransition('approved', 'plan')).toBe(false)
    expect(canTransition('finished', 'plan')).toBe(false)
    expect(canTransition('reviewed', 'plan')).toBe(false)
  })

  it('旧 start 动作对所有 from 状态拒绝（start 已退役）', () => {
    expect(canTransition('draft', 'start')).toBe(false)
    expect(canTransition('approved', 'start')).toBe(false)
    expect(canTransition('finished', 'start')).toBe(false)
    expect(canTransition('reviewed', 'start')).toBe(false)
  })

  it('旧 end 动作对所有 from 状态拒绝（end 已退役）', () => {
    expect(canTransition('draft', 'end')).toBe(false)
    expect(canTransition('approved', 'end')).toBe(false)
    expect(canTransition('finished', 'end')).toBe(false)
    expect(canTransition('reviewed', 'end')).toBe(false)
  })

  // ─── event_type 验证（事件订阅链路完整性）─────────────────────

  it('revert 转换发 CycleReverted', () => {
    const revertFromReviewed = findTransition(cycleTransitions, 'reviewed', 'revert')
    expect(revertFromReviewed?.eventType).toBe('CycleReverted')
  })

  it('review 转换发 CycleReviewed', () => {
    const reviewFromFinished = findTransition(cycleTransitions, 'finished', 'review')
    expect(reviewFromFinished?.eventType).toBe('CycleReviewed')
  })

  it('所有转换的 eventType 字段非空', () => {
    for (const t of cycleTransitions) {
      expect(t.eventType).toBeTruthy()
    }
  })
})
