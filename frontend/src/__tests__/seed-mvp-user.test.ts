import { describe, it, expect } from 'vitest'
import { getMvpUserSeed, MVP_USER_ID, MVP_USER_EMAIL } from '../../scripts/seed-mvp-user'

describe('seed-mvp-user: 数据构造', () => {
  it('MVP 用户常量值正确', () => {
    expect(MVP_USER_ID).toBe('00000000-0000-0000-0000-000000000001')
    expect(MVP_USER_EMAIL).toBe('mvp@lifeware.app')
  })

  it('getMvpUserSeed 返回正确的用户对象', () => {
    const user = getMvpUserSeed()

    expect(user.id).toBe(MVP_USER_ID)
    expect(user.email).toBe(MVP_USER_EMAIL)
    // createdAt 和 updatedAt 应为 Date 实例
    expect(user.createdAt).toBeInstanceOf(Date)
    expect(user.updatedAt).toBeInstanceOf(Date)
  })

  it('getMvpUserSeed 返回的对象包含所有必要字段', () => {
    const user = getMvpUserSeed()

    expect(user).toHaveProperty('id')
    expect(user).toHaveProperty('email')
    expect(user).toHaveProperty('createdAt')
    expect(user).toHaveProperty('updatedAt')
  })

  it('多次调用返回相同的 id 和 email', () => {
    const first = getMvpUserSeed()
    const second = getMvpUserSeed()

    expect(first.id).toBe(second.id)
    expect(first.email).toBe(second.email)
  })
})
