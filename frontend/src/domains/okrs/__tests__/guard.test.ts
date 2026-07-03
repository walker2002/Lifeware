/**
 * @file guard.test
 * @brief [022.01] Phase 2: assertEditable 权限矩阵测试
 *
 * 覆盖设计 spec §C 全部 5 个 Cycle 状态 × 6 种操作类型的允许/拒绝矩阵。
 * delete_cycle 在 draft 状态的「无目标」前置条件不测（由 okr.ts:deleteCycle 独立负责）。
 *
 * [022.01] Phase 3：补充 checkCycleEditable 单元测试（assertEditable 的布尔版兄弟函数）。
 */
import { describe, it, expect } from 'vitest'
import { assertEditable, checkCycleEditable } from '../guard'
import type { Cycle } from '@/usom/types/objects'

type Operation =
  | 'edit_cycle' | 'delete_cycle'
  | 'edit_objective' | 'delete_objective'
  | 'edit_kr' | 'delete_kr'

function makeCycle(status: Cycle['status']): Cycle {
  return {
    id: 'c-1',
    cycleType: 'quarterly',
    name: '2026 Q3',
    period: { start: '2026-07-01', end: '2026-09-30' },
    status,
    createdAt: '2026-06-01T00:00:00.000Z' as any,
    updatedAt: '2026-06-01T00:00:00.000Z' as any,
  }
}

describe('[022.01] assertEditable 权限矩阵', () => {
  // ─── draft ───
  it('draft：所有操作均允许', () => {
    const cycle = makeCycle('draft')
    const ops: Operation[] = ['edit_cycle', 'delete_cycle', 'edit_objective', 'delete_objective', 'edit_kr', 'delete_kr']
    for (const op of ops) {
      expect(() => assertEditable(cycle, op)).not.toThrow()
    }
  })

  // ─── not_started ───
  it('not_started：禁止改/删 cycle，允许改 obj/kr，禁止删 obj/kr', () => {
    const cycle = makeCycle('not_started')
    expect(() => assertEditable(cycle, 'edit_cycle')).toThrow('not_started')
    expect(() => assertEditable(cycle, 'delete_cycle')).toThrow('not_started')
    expect(() => assertEditable(cycle, 'edit_objective')).not.toThrow()
    expect(() => assertEditable(cycle, 'delete_objective')).toThrow('not_started')
    expect(() => assertEditable(cycle, 'edit_kr')).not.toThrow()
    expect(() => assertEditable(cycle, 'delete_kr')).toThrow('not_started')
  })

  // ─── in_progress ───
  it('in_progress：与 not_started 相同', () => {
    const cycle = makeCycle('in_progress')
    expect(() => assertEditable(cycle, 'edit_cycle')).toThrow('in_progress')
    expect(() => assertEditable(cycle, 'delete_cycle')).toThrow('in_progress')
    expect(() => assertEditable(cycle, 'edit_objective')).not.toThrow()
    expect(() => assertEditable(cycle, 'delete_objective')).toThrow('in_progress')
  })

  // ─── ended ───
  it('ended：与 not_started 相同（仍可编辑 obj/kr）', () => {
    const cycle = makeCycle('ended')
    expect(() => assertEditable(cycle, 'edit_cycle')).toThrow('ended')
    expect(() => assertEditable(cycle, 'delete_cycle')).toThrow('ended')
    expect(() => assertEditable(cycle, 'edit_objective')).not.toThrow()
    expect(() => assertEditable(cycle, 'delete_objective')).toThrow('ended')
  })

  // ─── reviewed ───
  it('reviewed：所有操作均禁止', () => {
    const cycle = makeCycle('reviewed')
    const ops: Operation[] = ['edit_cycle', 'delete_cycle', 'edit_objective', 'delete_objective', 'edit_kr', 'delete_kr']
    for (const op of ops) {
      expect(() => assertEditable(cycle, op)).toThrow('reviewed')
    }
  })
})

/**
 * [022.01] Phase 3：checkCycleEditable 单元测试
 *
 * 验证乐观检查函数：返回 boolean，不抛错；null cycle 视为不可编辑。
 */
describe('[022.01] checkCycleEditable', () => {
  it('valid cycle status → passes', () => {
    // draft + edit_objective → 返回 true（不抛错）
    const cycle = makeCycle('draft')
    expect(checkCycleEditable(cycle, 'edit_objective')).toBe(true)
    // in_progress + edit_kr → 返回 true
    expect(checkCycleEditable(makeCycle('in_progress'), 'edit_kr')).toBe(true)
  })

  it('reviewed cycle → returns false', () => {
    // reviewed + edit_objective → 返回 false（不抛错）
    const cycle = makeCycle('reviewed')
    expect(checkCycleEditable(cycle, 'edit_objective')).toBe(false)
    expect(checkCycleEditable(cycle, 'edit_kr')).toBe(false)
  })

  it('cycle not found (null) → returns false', () => {
    // null cycle → 返回 false（视为「不可编辑」短路）
    expect(checkCycleEditable(null, 'edit_objective')).toBe(false)
    expect(checkCycleEditable(undefined, 'edit_kr')).toBe(false)
  })
})
