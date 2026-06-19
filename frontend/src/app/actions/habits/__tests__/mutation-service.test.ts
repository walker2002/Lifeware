/**
 * @file mutation-service.test
 * @brief [018-G1] G1-F T2 — habits mutation-service 工厂 dispatch 路由测试
 *
 * 验证 createHabitsMutationService() 产出的 service.dispatch 行为正确：
 *  - FactField 字段（frequencyType）→ 走字段执行器路径（executor.execute 被调用）
 *  - ContentField 字段（title）→ 直走 repo.updateFields 路径（executor 不被调用）
 *
 * 用真实 habits manifest（getFieldMetadata 解析真实 mutation_mode 分类）+
 * mock 字段执行器 + mock HabitRepository，断言「走的路径」而非落库细节。
 *
 * 参照 tasks 模板对应测试（app/actions/tasks/__tests__/migration.test.ts）的
 * 「断言路径而非数据」风格。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock 字段执行器（拦截 FactField 路径，观察是否被调用） ───────────
const executorExecuteMock = vi.fn()
vi.mock('@/nexus/field-executor', () => ({
  createFieldExecutor: () => ({
    execute: executorExecuteMock,
  }),
}))

// ─── Mock HabitRepository（拦截 ContentField 路径，观察 updateFields） ─
const habitUpdateFieldsMock = vi.fn()
const habitRepoInstance = {
  findById: vi.fn(),
  save: vi.fn(),
  create: vi.fn(),
  updateStatus: vi.fn(),
  updateFields: habitUpdateFieldsMock,
}
vi.mock('@/domains/habits/repository/habit', () => ({
  HabitRepository: vi.fn(function (this: any) {
    return habitRepoInstance
  }),
}))

// ─── Mock HabitLogRepository（避免触达 DB；execute 路径未在本测试覆盖） ─
vi.mock('@/domains/habits/repository/habit-log', () => ({
  HabitLogRepository: vi.fn(function (this: any) {
    return {}
  }),
}))

// ─── Mock SystemEventRepository（避免触达 DB） ────────────────────────
vi.mock('@/lib/db/repositories/system-event.repository', () => ({
  SystemEventRepository: vi.fn(function (this: any) {
    return {}
  }),
}))

// ─── Mock db（transaction / 直接 import 在 update() 路径不触发） ───────
vi.mock('@/lib/db', () => ({
  db: {},
}))

import { createHabitsMutationService } from '../mutation-service'

describe('[018-G1] G1-F createHabitsMutationService — dispatch 路由', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 字段执行器默认返回通过
    executorExecuteMock.mockResolvedValue({ kind: 'Passed' })
    // ContentField 路径默认成功
    habitUpdateFieldsMock.mockResolvedValue({ id: 'habit-1', title: '新标题' })
  })

  it('FactField 字段（frequencyType）走字段执行器路径', async () => {
    const service = createHabitsMutationService()

    // frequencyType 在 habits manifest 标为 FactField（G1-M1）
    const result = await service.update(
      'habit-1',
      'frequencyType',
      'daily',
      'user-1',
      'habits',
      'habit',
    )

    expect(result.success).toBe(true)
    // 字段执行器被调用
    expect(executorExecuteMock).toHaveBeenCalledTimes(1)
    const [id, field, value, userId, ctx] = executorExecuteMock.mock.calls[0]
    expect(id).toBe('habit-1')
    expect(field).toBe('frequencyType')
    expect(value).toBe('daily')
    expect(userId).toBe('user-1')
    expect(ctx.objectType).toBe('habit')
    // F-6：事件名透传为 per-domain 的 HabitFieldUpdated
    expect(ctx.fieldUpdatedEventType).toBe('HabitFieldUpdated')
    // FactField 路径不直走 repo.updateFields
    expect(habitUpdateFieldsMock).not.toHaveBeenCalled()
  })

  it('ContentField 字段（title）直走 repo.updateFields，不调用字段执行器', async () => {
    const service = createHabitsMutationService()

    // title 在 habits manifest 标为 ContentField（G1-M1）
    const result = await service.update(
      'habit-1',
      'title',
      '新标题',
      'user-1',
      'habits',
      'habit',
    )

    expect(result.success).toBe(true)
    // 直走仓储 updateFields（ContentField）
    expect(habitUpdateFieldsMock).toHaveBeenCalledTimes(1)
    const [id, fields, userId] = habitUpdateFieldsMock.mock.calls[0]
    expect(id).toBe('habit-1')
    expect(fields).toEqual({ title: '新标题' })
    expect(userId).toBe('user-1')
    // 字段执行器不被调用
    expect(executorExecuteMock).not.toHaveBeenCalled()
  })

  it('Repository 按 objectType=habit 路由（未知 objectType 抛错）', async () => {
    const service = createHabitsMutationService()

    // 未知 objectType：getRepository 在 update() 路由阶段抛错（早于 try/catch）
    await expect(
      service.update(
        'habit-1',
        'title',
        '新标题',
        'user-1',
        'habits',
        'unknown-type',
      ),
    ).rejects.toThrow(/未找到 Habits 仓储/)
  })
})
