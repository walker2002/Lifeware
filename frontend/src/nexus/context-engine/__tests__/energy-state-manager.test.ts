/**
 * @file energy-state-manager.test
 * @brief EnergyStateManager 骨架单元测试（D9 / R6 / R8）
 *
 * MVP 范围（D8/D9/OQ-6）：current() 读时推断 inferredLevel +
 * curve() 静态默认 + trend() 透传。applyEvent 不接线（未来 Scheduler）。
 *
 * R6 修订：current() 推断基础 = calibratedLevel ?? activeLevel（尊重手动校准）
 * R8 修订：补 2 个测试 cases 验证 stale inferredLevel 不会干扰 + calibratedLevel cap
 */
import { describe, it, expect } from 'vitest'
import { createEnergyStateManager, DEFAULT_ENERGY_CURVE } from '@/nexus/context-engine/energy-state-manager'
import type { EnergyState } from '@/usom/types/primitives'

// R6: 工具函数含 calibratedLevel 字段（默认 null）
const baseState = (activeLevel: number, calibratedLevel: number | null = null): EnergyState => ({
  inferredLevel: activeLevel,
  calibratedLevel,
  activeLevel,
  source: 'system',
})

describe('EnergyStateManager.curve()', () => {
  it('返回 DEFAULT_ENERGY_CURVE（MVP 静态）', () => {
    const mgr = createEnergyStateManager()
    expect(mgr.curve()).toEqual(DEFAULT_ENERGY_CURVE)
  })
})

describe('EnergyStateManager.current()', () => {
  it('peak 时段（hour=10）→ inferredLevel = activeLevel + 2（cap 10）', () => {
    const mgr = createEnergyStateManager()
    const result = mgr.current(baseState(6), 10)
    expect(result.inferredLevel).toBe(8)
    expect(result.activeLevel).toBe(6) // activeLevel 不变（D8 单维，手动校准）
  })

  it('peak 时段 cap 10（activeLevel=9 → inferred=10 不溢出）', () => {
    const mgr = createEnergyStateManager()
    expect(mgr.current(baseState(9), 10).inferredLevel).toBe(10)
  })

  it('low 时段（hour=15）→ inferredLevel = activeLevel - 2（floor 1）', () => {
    const mgr = createEnergyStateManager()
    expect(mgr.current(baseState(6), 15).inferredLevel).toBe(4)
  })

  it('low 时段 floor 1（activeLevel=2 → inferred=1 不下溢）', () => {
    const mgr = createEnergyStateManager()
    expect(mgr.current(baseState(2), 15).inferredLevel).toBe(1)
  })

  it('普通时段（hour=20）→ inferredLevel = activeLevel（不调整）', () => {
    const mgr = createEnergyStateManager()
    expect(mgr.current(baseState(6), 20).inferredLevel).toBe(6)
  })

  it('返回新对象，不修改入参 state（纯函数）', () => {
    const mgr = createEnergyStateManager()
    const input = baseState(6)
    const result = mgr.current(input, 10)
    expect(result).not.toBe(input)
    expect(input.inferredLevel).toBe(6) // 入参未被改
  })
})

describe('EnergyStateManager.trend()', () => {
  it('MVP 透传历史快照（未来增强为趋势计算）', () => {
    const mgr = createEnergyStateManager()
    const snapshots = [baseState(5), baseState(6), baseState(7)]
    expect(mgr.trend(snapshots)).toEqual(snapshots)
  })

  it('空快照 → 空数组', () => {
    const mgr = createEnergyStateManager()
    expect(mgr.trend([])).toEqual([])
  })
})

// R8 修订：补 2 个测试 cases 验证 current() 从 base 重算 inferredLevel
describe('EnergyStateManager.current() R8 stale inferredLevel', () => {
  it('input {inferredLevel: 9, calibratedLevel: null, activeLevel: 6} hour=10 → output inferredLevel=8（证明从 activeLevel 重算，不被入参 stale 9 干扰）', () => {
    const mgr = createEnergyStateManager()
    const result = mgr.current({
      inferredLevel: 9,
      calibratedLevel: null,
      activeLevel: 6,
      source: 'system',
    }, 10)
    expect(result.inferredLevel).toBe(8) // peak +2 cap 10
  })

  it('calibratedLevel=8 hour=10 → inferredLevel=10（cap 10，base=calibratedLevel 而非 activeLevel）', () => {
    const mgr = createEnergyStateManager()
    const result = mgr.current({
      inferredLevel: 0,
      calibratedLevel: 8,
      activeLevel: 6,
      source: 'user',
    }, 10)
    expect(result.inferredLevel).toBe(10) // calibratedLevel 8 + 2 = 10
  })
})
