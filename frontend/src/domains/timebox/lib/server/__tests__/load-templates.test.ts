/**
 * @file load-templates.test
 * @brief lib/server/load-templates 直接单测
 *
 * 覆盖契约：
 *  - loadTimeboxTemplates() 用 MVP_USER_ID 调用 repo.findByUser
 *  - repo.findByUser 返回值原样透传
 */
import { describe, it, expect, vi } from 'vitest'

// vi.mock factory 会被 hoist 到文件顶部——所有外部变量必须 vi.hoisted 才能访问。
const { findByUser, TimeboxTemplateRepositoryMock } = vi.hoisted(() => {
  const findByUserFn = vi.fn()
  // 用 function 构造兼容 `new` 调用（mockImplementation 在 new 调用时 this 上下文执行）
  const CtorMock = vi.fn().mockImplementation(function FakeCtor(this: { findByUser: typeof findByUserFn }) {
    this.findByUser = findByUserFn
  })
  return { findByUser: findByUserFn, TimeboxTemplateRepositoryMock: CtorMock }
})

vi.mock('@/lib/db/repositories/timebox-template', () => ({
  TimeboxTemplateRepository: TimeboxTemplateRepositoryMock,
}))

import { loadTimeboxTemplates } from '../load-templates'

// 与 load-templates.ts MVP_USER_ID 字面值一致（多租户落地替换）
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

describe('loadTimeboxTemplates', () => {
  it('构造 TimeboxTemplateRepository 并以 MVP_USER_ID 调用 findByUser', async () => {
    const expected = [
      {
        id: 't-1',
        userId: MVP_USER_ID,
        title: '晨练',
        durationMinutes: 30,
      },
    ]
    findByUser.mockResolvedValueOnce(expected)

    const out = await loadTimeboxTemplates()

    expect(TimeboxTemplateRepositoryMock).toHaveBeenCalledTimes(1)
    expect(findByUser).toHaveBeenCalledTimes(1)
    expect(findByUser).toHaveBeenCalledWith(MVP_USER_ID)
    expect(out).toBe(expected)
  })

  it('返回值直接透传', async () => {
    const expected: unknown[] = []
    findByUser.mockResolvedValueOnce(expected)
    const out = await loadTimeboxTemplates()
    expect(out).toBe(expected)
  })
})
