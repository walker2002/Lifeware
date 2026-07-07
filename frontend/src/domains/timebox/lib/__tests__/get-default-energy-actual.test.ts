/**
 * @file get-default-energy-actual 测试
 * @brief [023.13] 能量默认值 = archetype 4 维均值；无 archetype → undefined
 */
import { describe, it, expect } from 'vitest'
import { getDefaultEnergyActual } from '../get-default-energy-actual'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

const mk = (energyCost: { physical: number; mental: number; emotional: number; creative: number }): Pick<ActivityArchetype, 'energyCost'> =>
  ({ energyCost }) as Pick<ActivityArchetype, 'energyCost'>

describe('getDefaultEnergyActual', () => {
  it('4 维均值四舍五入', () => {
    expect(getDefaultEnergyActual(mk({ physical: 9, mental: 10, emotional: 3, creative: 2 }))).toBe(6) // (9+10+3+2)/4=6
  })
  it('均值 .5 向上取整', () => {
    expect(getDefaultEnergyActual(mk({ physical: 5, mental: 5, emotional: 5, creative: 6 }))).toBe(5) // 21/4=5.25→5
    expect(getDefaultEnergyActual(mk({ physical: 7, mental: 7, emotional: 7, creative: 8 }))).toBe(7) // 29/4=7.25→7
  })
  it('无 archetype → undefined', () => {
    expect(getDefaultEnergyActual(undefined)).toBeUndefined()
  })
})
