/**
 * @file activity-archetype.test
 * @brief [023.11] matchArchetypeForTitle server action 单测（命中/未命中/空 title/错误路径）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/nexus/ai-runtime', () => ({ createAIRuntime: vi.fn(() => ({})) }))
vi.mock('@/lib/db/repositories/activity-archetype.repository', () => ({ ActivityArchetypeRepository: vi.fn() }))
vi.mock('@/domains/timebox/lib/archetype-matcher', () => ({ matchArchetypesForTitles: vi.fn() }))

import { matchArchetypeForTitle } from '../activity-archetype'
import { ActivityArchetypeRepository } from '@/lib/db/repositories/activity-archetype.repository'
import { matchArchetypesForTitles } from '@/domains/timebox/lib/archetype-matcher'

const MockedRepo = vi.mocked(ActivityArchetypeRepository)
const mockMatch = vi.mocked(matchArchetypesForTitles)

beforeEach(() => {
  vi.clearAllMocks()
  MockedRepo.mockImplementation(function () {
    return { findByUser: vi.fn().mockResolvedValue([{ id: 'a1' }]) } as unknown as InstanceType<typeof ActivityArchetypeRepository>
  })
})

describe('[023.11] matchArchetypeForTitle', () => {
  it('matcher 命中 → { matched: true, archetypeId }', async () => {
    mockMatch.mockResolvedValueOnce([{ archetypeId: 'a1', confidence: 0.9, source: 'rule' }])
    expect(await matchArchetypeForTitle('深度专注')).toEqual({ matched: true, archetypeId: 'a1' })
  })

  it('matcher 未命中 → { matched: false }', async () => {
    mockMatch.mockResolvedValueOnce([null])
    expect(await matchArchetypeForTitle('未知活动')).toEqual({ matched: false })
  })

  it('空 title → { matched: false } 且不查 DB / 不调 matcher', async () => {
    expect(await matchArchetypeForTitle('   ')).toEqual({ matched: false })
    expect(mockMatch).not.toHaveBeenCalled()
  })

  it('[错误路径] repo.findByUser 抛错 → { matched: false }（catch 兜底）', async () => {
    MockedRepo.mockImplementationOnce(function () {
      return { findByUser: vi.fn().mockRejectedValue(new Error('db down')) } as unknown as InstanceType<typeof ActivityArchetypeRepository>
    })
    expect(await matchArchetypeForTitle('写代码')).toEqual({ matched: false })
  })
})
