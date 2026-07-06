/**
 * @file guard.test
 * @brief [022.01] Phase 2 + [023.12] T6: assertEditable 权限矩阵测试
 *
 * 覆盖设计 spec §C 全部 4 个 Cycle 状态（[T6] 5→4 收敛）× 6 种操作类型的允许/拒绝矩阵。
 * delete_cycle 在 draft 状态的「无目标」前置条件不测（由 okr.ts:deleteCycle 独立负责）。
 *
 * [022.01] Phase 3：补充 checkCycleEditable 单元测试（assertEditable 的布尔版兄弟函数）。
 * [023.12] T6：fixture 由 not_started/in_progress/ended → approved/finished（4 态）。
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

  // ─── approved ───
  // [023.12] T6：替代原 not_started/in_progress——「已批准即活跃」，权限矩阵相同。
  it('approved：禁止改/删 cycle，允许改 obj/kr，禁止删 obj/kr', () => {
    const cycle = makeCycle('approved')
    expect(() => assertEditable(cycle, 'edit_cycle')).toThrow('approved')
    expect(() => assertEditable(cycle, 'delete_cycle')).toThrow('approved')
    expect(() => assertEditable(cycle, 'edit_objective')).not.toThrow()
    expect(() => assertEditable(cycle, 'delete_objective')).toThrow('approved')
    expect(() => assertEditable(cycle, 'edit_kr')).not.toThrow()
    expect(() => assertEditable(cycle, 'delete_kr')).toThrow('approved')
  })

  // ─── finished ───
  // [023.12] T6：替代原 ended——已结束但未复盘，权限矩阵与 approved 相同。
  it('finished：与 approved 相同（仍可编辑 obj/kr）', () => {
    const cycle = makeCycle('finished')
    expect(() => assertEditable(cycle, 'edit_cycle')).toThrow('finished')
    expect(() => assertEditable(cycle, 'delete_cycle')).toThrow('finished')
    expect(() => assertEditable(cycle, 'edit_objective')).not.toThrow()
    expect(() => assertEditable(cycle, 'delete_objective')).toThrow('finished')
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
 * [023.12] T6：fixture rename（in_progress→approved）。
 */
describe('[022.01] checkCycleEditable', () => {
  it('valid cycle status → passes', () => {
    // draft + edit_objective → 返回 true（不抛错）
    const cycle = makeCycle('draft')
    expect(checkCycleEditable(cycle, 'edit_objective')).toBe(true)
    // [T6] approved + edit_kr → 返回 true
    expect(checkCycleEditable(makeCycle('approved'), 'edit_kr')).toBe(true)
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
