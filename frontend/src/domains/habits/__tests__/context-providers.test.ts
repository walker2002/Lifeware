import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @/nexus/context-engine/registry
const registeredCaps = new Map<string, any>()
vi.mock('@/nexus/context-engine/registry', () => ({
  registerContextCapability: (cap: any) => { registeredCaps.set(cap.id, cap) },
  clearRegistry: () => { registeredCaps.clear() },
  resolveContext: vi.fn(),
}))

import { registerHabitProviders } from '../context-providers'

function makeHabitRepo(habits: any[] = []) {
  return {
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findActive: vi.fn().mockResolvedValue(habits),
    findByFrequency: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    archive: vi.fn(),
    checkReferences: vi.fn(),
    calculateStreak: vi.fn(),
    calculateLongestStreak: vi.fn(),
    calculateCompletion7d: vi.fn(),
    updateMetrics: vi.fn(),
  }
}

describe('registerHabitProviders', () => {
  beforeEach(() => {
    registeredCaps.clear()
  })

  it('registers activeHabits provider and returns mapped data', async () => {
    const repo = makeHabitRepo([
      { id: 'h1', title: '晨跑', status: 'active', defaultTime: '07:00', trackable: true, streak: 5, longestStreak: 10, completionRate7d: 0.8 },
    ])
    registerHabitProviders(repo as any)

    const cap = registeredCaps.get('activeHabits')
    expect(cap).toBeDefined()
    expect(cap.description).toBe('活跃习惯列表')

    const result = await cap.provider.provide({}, { userId: 'u1' })
    expect(result).toEqual([{
      id: 'h1',
      title: '晨跑',
      status: 'active',
      defaultTime: '07:00',
      trackable: true,
      streak: 5,
      todayLogged: false,
    }])
  })

  it('registers habitStreaks provider and returns streak data', async () => {
    const repo = makeHabitRepo([
      { id: 'h1', title: '晨跑', status: 'active', defaultTime: '07:00', trackable: true, streak: 5, longestStreak: 10, completionRate7d: 0.8 },
    ])
    registerHabitProviders(repo as any)

    const cap = registeredCaps.get('habitStreaks')
    expect(cap).toBeDefined()
    expect(cap.description).toBe('习惯连续打卡统计')

    const result = await cap.provider.provide({}, { userId: 'u1' })
    expect(result).toEqual([{
      habitId: 'h1',
      title: '晨跑',
      currentStreak: 5,
      longestStreak: 10,
      completionRate7d: 0.8,
    }])
  })

  it('registers habitLogs provider (returns empty until log repo available)', async () => {
    const repo = makeHabitRepo()
    registerHabitProviders(repo as any)

    const cap = registeredCaps.get('habitLogs')
    expect(cap).toBeDefined()
    expect(cap.description).toBe('最近习惯打卡记录')

    const result = await cap.provider.provide({}, { userId: 'u1' })
    expect(result).toEqual([])
  })

  it('handles empty active habits gracefully', async () => {
    const repo = makeHabitRepo([])
    registerHabitProviders(repo as any)

    const cap = registeredCaps.get('activeHabits')
    const result = await cap.provider.provide({}, { userId: 'u1' })
    expect(result).toEqual([])
  })
})
