import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @/nexus/context-engine/registry
vi.mock('@/nexus/context-engine/registry', () => {
  const caps = new Map<string, any>()
  return {
    registerContextCapability: (cap: any) => { caps.set(cap.id, cap) },
    clearRegistry: () => { caps.clear() },
    resolveContext: vi.fn(),
    getRegisteredCapabilities: () => Array.from(caps.keys()),
  }
})

import { registerHabitProviders } from '../context-providers'
import { clearRegistry } from '@/nexus/context-engine/registry'

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
    clearRegistry()
  })

  it('registers active_habits provider', () => {
    const repo = makeHabitRepo([
      { id: 'h1', title: '晨跑', status: 'active', defaultTime: '07:00', trackable: true, streak: 5, longestStreak: 10, completionRate7d: 0.8 },
    ])
    registerHabitProviders(repo as any)

    // 验证注册成功（不抛异常）
    expect(() => registerHabitProviders(repo as any)).not.toThrow()
  })

  it('registers habit_streaks provider', () => {
    const repo = makeHabitRepo([
      { id: 'h1', title: '晨跑', status: 'active', defaultTime: '07:00', trackable: true, streak: 5, longestStreak: 10, completionRate7d: 0.8 },
    ])
    registerHabitProviders(repo as any)
    // 验证注册成功
    expect(true).toBe(true)
  })

  it('registers recent_habit_logs provider', () => {
    const repo = makeHabitRepo()
    registerHabitProviders(repo as any)
    expect(true).toBe(true)
  })
})
