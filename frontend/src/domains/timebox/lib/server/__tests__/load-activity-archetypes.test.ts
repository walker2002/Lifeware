/**
 * @file load-activity-archetypes.test
 * @brief lib/server/load-activity-archetypes 直接单测
 *
 * 覆盖契约：
 *  - loadActivityArchetypes() 用 MVP_USER_ID 调用 repo.findByUser
 *  - repo.findByUser 返回值原样透传
 */
import { describe, it, expect, vi } from 'vitest'

// vi.mock factory 会被 hoist 到文件顶部——所有外部变量必须 vi.hoisted 才能访问。
const { findByUser, ActivityArchetypeRepositoryMock } = vi.hoisted(() => {
  const findByUserFn = vi.fn()
  const CtorMock = vi.fn().mockImplementation(function FakeCtor(this: { findByUser: typeof findByUserFn }) {
    this.findByUser = findByUserFn
  })
  return { findByUser: findByUserFn, ActivityArchetypeRepositoryMock: CtorMock }
})

vi.mock('@/lib/db/repositories/activity-archetype.repository', () => ({
  ActivityArchetypeRepository: ActivityArchetypeRepositoryMock,
}))

import { loadActivityArchetypes } from '../load-activity-archetypes'

// 与 load-activity-archetypes.ts MVP_USER_ID 字面值一致（多租户落地替换）
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

describe('loadActivityArchetypes', () => {
  it('构造 ActivityArchetypeRepository 并以 MVP_USER_ID 调用 findByUser', async () => {
    const expected = [
      {
        id: 'aa-1',
        userId: MVP_USER_ID,
        l1Category: 'work',
        l2Name: 'deep-work',
      },
    ]
    findByUser.mockResolvedValueOnce(expected)

    const out = await loadActivityArchetypes()

    expect(ActivityArchetypeRepositoryMock).toHaveBeenCalledTimes(1)
    expect(findByUser).toHaveBeenCalledTimes(1)
    expect(findByUser).toHaveBeenCalledWith(MVP_USER_ID)
    expect(out).toBe(expected)
  })

  it('返回值直接透传', async () => {
    const expected: unknown[] = []
    findByUser.mockResolvedValueOnce(expected)
    const out = await loadActivityArchetypes()
    expect(out).toBe(expected)
  })
})
