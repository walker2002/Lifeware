/**
 * @file timebox-templates.test
 * @brief fetchSubscriptionSources 带 activityArchetypeId（[027-B]）
 *
 * mock 三个仓储，断言 habits/tasks 项携带来源对象的原型 id；threads 不带。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/domains/habits/repository/habit', () => ({
  HabitRepository: vi.fn(function () {
    return {
      findByUserId: vi.fn().mockResolvedValue([
        { id: 'h1', title: '晨跑', defaultTime: '06:00', defaultDuration: 60, activityArchetypeId: 'a-run' },
      ]),
    }
  }),
}))
vi.mock('@/domains/tasks/repository/task', () => ({
  TaskRepository: vi.fn(function () {
    return {
      findByUserId: vi.fn().mockResolvedValue([
        { id: 't1', title: '写周报', activityArchetypeId: 'a-write' },
      ]),
    }
  }),
}))
vi.mock('@/domains/tasks/repository/thread', () => ({
  ThreadRepository: vi.fn(function () {
    return {
      findByUserId: vi.fn().mockResolvedValue([{ id: 'th1', name: 'OKR' }]),
    }
  }),
}))

const { fetchSubscriptionSources } = await import('../timebox-templates')

describe('fetchSubscriptionSources — archetypeId', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  it('habits 项带 activityArchetypeId + start/duration', async () => {
    const r = await fetchSubscriptionSources()
    expect(r.success).toBe(true)
    expect(r.data?.habits[0]).toMatchObject({ id: 'h1', activityArchetypeId: 'a-run', start: '06:00', end: '07:00' })
  })
  it('tasks 项带 activityArchetypeId', async () => {
    const r = await fetchSubscriptionSources()
    expect(r.data?.tasks[0]).toMatchObject({ id: 't1', activityArchetypeId: 'a-write' })
  })
  it('threads 项不带 activityArchetypeId', async () => {
    const r = await fetchSubscriptionSources()
    expect(r.data?.threads[0]).toMatchObject({ id: 'th1' })
    expect(r.data?.threads[0]).not.toHaveProperty('activityArchetypeId')
  })
})