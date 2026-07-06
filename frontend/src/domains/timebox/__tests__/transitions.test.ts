/**
 * @file transitions.test
 * @brief Timebox SM transition 表测试（T4, AM3）
 *
 * [023.12] T4 新 lifecycle（3 态收敛）：planned / logged / cancelled。
 * 5 transitions：null→planned(create) / planned→logged(log) /
 *                planned→cancelled(cancel) / logged→planned(revert) /
 *                cancelled→planned(revert)。terminal_states=[]（无终态，全部可 revert）。
 *
 * AM3 要求至少 4 case（logged→planned、cancelled→planned、logged→logged 拒绝、planned→planned 拒绝），
 * 本文件覆盖 10+ case 把整张表锁死。
 */

import { describe, it, expect } from 'vitest'
import { timeboxTransitions, findTransition } from '../transitions'
import type { TimeboxStatus } from '@/usom/types/primitives'

/** TimeboxStatus | null 的 from 校验 */
type AnyStatus = TimeboxStatus | null

/**
 * 检查「是否在 transitions 表中能匹配一条合法转换」
 * @param from - 源状态（null = 创建）
 * @param action - 动作名
 * @returns true = 该 (from, action) 在表中存在
 */
function canTransition(from: AnyStatus, action: string): boolean {
  return findTransition(timeboxTransitions, from as TimeboxStatus, action) !== null
}

describe('timeboxTransitions（[023.12] T4 3 态收敛表）', () => {
  // ─── 表结构断言 ────────────────────────────────────────────────

  it('表含 5 条转换（1 create + 1 log + 1 cancel + 2 revert）', () => {
    expect(timeboxTransitions).toHaveLength(5)
  })

  it('表不包含 start / end / overtime 旧动作', () => {
    const actions = timeboxTransitions.map(t => t.action)
    expect(actions).not.toContain('start')
    expect(actions).not.toContain('end')
    expect(actions).not.toContain('overtime')
  })

  // ─── 合法转换（[AM3] 必含 4 case + bonus）─────────────────────

  it('null→planned（create）合法', () => {
    expect(canTransition(null, 'create')).toBe(true)
  })

  it('planned→logged（log）合法', () => {
    expect(canTransition('planned', 'log')).toBe(true)
  })

  it('planned→cancelled（cancel）合法', () => {
    expect(canTransition('planned', 'cancel')).toBe(true)
  })

  // [AM3] 必含 4 case 之一：revert from logged
  it('logged→planned（revert）合法', () => {
    expect(canTransition('logged', 'revert')).toBe(true)
  })

  // [AM3] 必含 4 case 之一：revert from cancelled
  it('cancelled→planned（revert）合法', () => {
    expect(canTransition('cancelled', 'revert')).toBe(true)
  })

  // ─── 同态拒绝（[AM3] 必含 2 case）─────────────────────────────

  // [AM3] 必含 4 case 之一：logged→logged rejected
  it('logged→logged（同态）拒绝', () => {
    expect(canTransition('logged', 'log')).toBe(false)
  })

  it('cancelled→cancelled（同态）拒绝', () => {
    expect(canTransition('cancelled', 'cancel')).toBe(false)
  })

  // [AM3] 必含 4 case 之一：planned→planned rejected
  // 同态 = from 与 to 相同。SM 表中 planned→planned 需 (from=planned, to=planned)；
  // 但表中所有 from=planned 的转换都到 logged/cancelled，无 to=planned。
  // 等价断言：所有 from=planned 的 to 都 ≠ planned。
  it('planned→planned（同态）拒绝（无任何 from=planned 转换的 to 等于 planned）', () => {
    const fromPlanned = timeboxTransitions.filter(t => t.from === 'planned')
    expect(fromPlanned.length).toBeGreaterThan(0) // 表非空
    for (const t of fromPlanned) {
      expect(t.to).not.toBe('planned')
    }
  })

  // ─── 非法 forward（bonus）─────────────────────────────────────

  it('logged→cancelled（非法 forward）拒绝', () => {
    expect(canTransition('logged', 'cancel')).toBe(false)
  })

  it('cancelled→logged（非法 forward）拒绝', () => {
    expect(canTransition('cancelled', 'log')).toBe(false)
  })

  // ─── 旧动作拒绝（bonus 守 AM7 隐含：旧 start/end/overtime 不应在新表里合法）───

  it('旧 start 动作对所有 from 状态拒绝（start 已退役）', () => {
    expect(canTransition('planned', 'start')).toBe(false)
    expect(canTransition('logged', 'start')).toBe(false)
    expect(canTransition('cancelled', 'start')).toBe(false)
  })

  it('旧 end 动作对所有 from 状态拒绝（end 已退役）', () => {
    expect(canTransition('planned', 'end')).toBe(false)
    expect(canTransition('logged', 'end')).toBe(false)
    expect(canTransition('cancelled', 'end')).toBe(false)
  })

  it('旧 overtime 动作对所有 from 状态拒绝（overtime 已退役）', () => {
    expect(canTransition('planned', 'overtime')).toBe(false)
    expect(canTransition('logged', 'overtime')).toBe(false)
    expect(canTransition('cancelled', 'overtime')).toBe(false)
  })

  // ─── event_type 验证（事件订阅链路完整性）─────────────────────

  it('两条 revert 都发 TimeboxReverted（SM 一致）', () => {
    const revertFromLogged = findTransition(timeboxTransitions, 'logged', 'revert')
    const revertFromCancelled = findTransition(timeboxTransitions, 'cancelled', 'revert')
    expect(revertFromLogged?.eventType).toBe('TimeboxReverted')
    expect(revertFromCancelled?.eventType).toBe('TimeboxReverted')
  })

  it('所有转换的 eventType 字段非空', () => {
    for (const t of timeboxTransitions) {
      expect(t.eventType).toBeTruthy()
    }
  })
})