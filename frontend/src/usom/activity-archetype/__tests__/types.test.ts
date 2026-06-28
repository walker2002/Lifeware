/**
 * @file types.test
 * @brief Activity Archetype 类型编译时守卫测试
 */
import { describe, it, expect } from 'vitest'
import { L1_CATEGORIES, L1_CATEGORY_KEYS } from '@/usom/activity-archetype/l1-categories'

describe('L1_CATEGORIES', () => {
  it('应有 7 大类', () => {
    expect(Object.keys(L1_CATEGORIES)).toHaveLength(7)
  })

  it('反向映射 L1_CATEGORY_KEYS 与 L1_CATEGORIES 互逆', () => {
    for (const [key, value] of Object.entries(L1_CATEGORIES)) {
      expect(L1_CATEGORY_KEYS[value]).toBe(key)
    }
  })
})

describe('SEED_ACTIVITY_ARCHETYPES', () => {
  it('所有 seed L1 分类必须有效', async () => {
    const { SEED_ACTIVITY_ARCHETYPES } = await import('@/usom/seed/activity-archetypes')
    const validL1 = new Set(Object.values(L1_CATEGORIES))
    for (const s of SEED_ACTIVITY_ARCHETYPES) {
      expect(validL1.has(s.l1Category), `${s.l2Name} L1 分类 "${s.l1Category}" 无效`).toBe(true)
    }
  })

  it('每条 seed energyCost 4 维在 1-10', async () => {
    const { SEED_ACTIVITY_ARCHETYPES } = await import('@/usom/seed/activity-archetypes')
    for (const s of SEED_ACTIVITY_ARCHETYPES) {
      const { physical, mental, emotional, creative } = s.energyCost
      for (const [dim, val] of Object.entries({ physical, mental, emotional, creative })) {
        expect(val, `${s.l2Name}.energyCost.${dim}=${val} 越界`).toBeGreaterThanOrEqual(1)
        expect(val, `${s.l2Name}.energyCost.${dim}=${val} 越界`).toBeLessThanOrEqual(10)
      }
    }
  })

  it('所有 seed activityLabel 字段合法', async () => {
    const { SEED_ACTIVITY_ARCHETYPES } = await import('@/usom/seed/activity-archetypes')
    for (const s of SEED_ACTIVITY_ARCHETYPES) {
      expect(s.activityLabel.enjoyment).toBeGreaterThanOrEqual(1)
      expect(s.activityLabel.enjoyment).toBeLessThanOrEqual(10)
      expect(s.activityLabel.typicalDuration).toBeGreaterThan(0)
      expect(['low', 'medium', 'high']).toContain(s.activityLabel.interruptTolerance)
      expect(s.activityLabel.environment.length).toBeGreaterThan(0)
      expect(s.activityLabel.location.length).toBeGreaterThan(0)
    }
  })

  it('7 大类全覆盖', async () => {
    const { SEED_ACTIVITY_ARCHETYPES } = await import('@/usom/seed/activity-archetypes')
    const covered = new Set(SEED_ACTIVITY_ARCHETYPES.map(s => s.l1Category))
    const all = new Set(Object.values(L1_CATEGORIES))
    const missing = [...all].filter(c => !covered.has(c))
    expect(missing, `缺失 L1: ${missing.join(', ')}`).toEqual([])
  })
})
