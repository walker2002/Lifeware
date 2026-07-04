/**
 * @file energy-curve.test
 * @brief EnergyCurve 类型 + DEFAULT_ENERGY_CURVE 常量单元测试（D10 SSOT）
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_ENERGY_CURVE } from '@/nexus/context-engine/energy-state-manager'
import type { EnergyCurve } from '@/usom/types/primitives'

describe('DEFAULT_ENERGY_CURVE', () => {
  it('peakHours 为 [9,10,11]（整合 5 处默认值的 SSOT）', () => {
    expect(DEFAULT_ENERGY_CURVE.peakHours).toEqual([9, 10, 11])
  })

  it('lowHours 为 [14,15,16]（修复 orchestration-handler [13,14] 与 provider [14,15,16] 的不一致）', () => {
    expect(DEFAULT_ENERGY_CURVE.lowHours).toEqual([14, 15, 16])
  })

  it('满足 EnergyCurve 类型契约（number[] × 2）', () => {
    const curve: EnergyCurve = DEFAULT_ENERGY_CURVE
    expect(Array.isArray(curve.peakHours)).toBe(true)
    expect(Array.isArray(curve.lowHours)).toBe(true)
    expect(curve.peakHours.every(h => typeof h === 'number')).toBe(true)
  })
})