/**
 * @file update-habit.integration
 * @brief [018-G1] G1-H T3/T4/T5 — updateHabit 业务事实写入口集成测试
 *
 * 对接真实 Docker PostgreSQL，验证 updateHabit 从 `habitRepo.update(整对象)`
 * 迁移到 `createHabitsMutationService().execute(聚合 Intent)` 后的三大契约：
 *
 *  - T3（F-1 字段覆盖，CRITICAL）：HabitListPage 同款 12 字段 input，断言全部
 *    落库 + findById 读回一致。若无此测，编辑习惯在生产整体不可用。
 *  - T4（F-3 原子性，HIGH）：input 含一合法字段 + 一非法字段（defaultDuration=-1
 *    被 field-executor number 校验拒），断言整体回滚——合法字段也未落库（DB 不变），
 *    返回 {success:false}。证明用 execute() 单事务而非逐字段非事务。
 *  - T5（F-2 frequency 合并，HIGH）：updateHabit({frequencyType:'weekly'}) 后
 *    findById 断言 habit.frequency.type==='weekly' 且 daysOfWeek 不被清空；
 *    再单写 daysOfWeek 验证对称。frequencyType/daysOfWeek 是平铺列
 *    frequency_type/days_of_week，mapper 总从两列重建 frequency 嵌套对象。
 *
 * 数据隔离：updateHabit 内部硬编码 MVP_USER_ID（...001）。测试在该用户下创建
 * 独立 habit id，finally 按 id 清理，不污染其它测试。
 *
 * 参照 src/app/actions/tasks/__tests__/complete-task.integration.test.ts 模式。
 */

import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { updateHabit } from '@/app/actions/intent'
import type { CreateHabitInput } from '@/usom/interfaces/irepository'

/**
 * updateHabit 内部硬编码的 MVP 用户 ID（与 intent.ts 一致）。
 * 测试在该用户下创建/清理独立 habit，避免引入新用户。
 */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as const

/** 构造一份合法的 CreateHabitInput（满足 schema 所有 notNull 列） */
function makeCreateInput(overrides: Partial<CreateHabitInput> = {}): CreateHabitInput {
  return {
    title: '集成测试习惯',
    description: '初始描述',
    defaultTime: '07:00',
    earliestTime: '06:00',
    latestStartTime: '08:00',
    defaultDuration: 30,
    minDuration: 10,
    trackable: true,
    frequencyType: 'daily',
    startDate: '2026-01-01',
    ...overrides,
  }
}

/** 按 id 清理测试 habit */
async function cleanupHabit(habitId: string) {
  try {
    await db.delete(s.habits).where(
      and(eq(s.habits.id, habitId), eq(s.habits.userId, MVP_USER_ID)),
    )
  } catch {
    /* 忽略 */
  }
}

describe('[018-G1] G1-H updateHabit 单事务 — 集成测试（真实 PostgreSQL）', () => {
  it('T3（F-1 字段覆盖，CRITICAL）：HabitListPage 同款 12 字段全落库 + 读回一致', async () => {
    const repo = new HabitRepository()
    // 1. 创建基础习惯
    const habit = await repo.create(makeCreateInput(), MVP_USER_ID as any)
    try {
      // 2. 构造 HabitListPage handleUpdateHabit 同款 12 字段 input（无 keyResultId/tags）
      const input = {
        title: '更新后标题',
        description: '更新后描述',
        defaultTime: '21:30',
        earliestTime: '20:00',
        latestStartTime: '22:00',
        defaultDuration: 45,
        minDuration: 15,
        trackable: false,
        frequencyType: 'weekly' as const,
        daysOfWeek: [1, 3, 5],
        startDate: '2026-02-01',
        endDate: '2026-12-31',
      }

      const result = await updateHabit(habit.id, input)

      // 3. 断言成功 + 返回更新后的 habit
      expect(result.success).toBe(true)
      expect(result.habit).toBeDefined()

      // 4. 复查 DB —— findById 读回，12 字段全部一致
      const after = await repo.findById(habit.id as any, MVP_USER_ID as any)
      expect(after).not.toBeNull()
      expect(after!.title).toBe('更新后标题')
      expect(after!.description).toBe('更新后描述')
      expect(after!.defaultTime).toBe('21:30')
      expect(after!.earliestTime).toBe('20:00')
      expect(after!.latestStartTime).toBe('22:00')
      expect(after!.defaultDuration).toBe(45)
      expect(after!.minDuration).toBe(15)
      expect(after!.trackable).toBe(false)
      // frequencyType/daysOfWeek 平铺列写后经 mapper 重建 frequency 嵌套对象
      expect(after!.frequency.type).toBe('weekly')
      expect(after!.frequency.daysOfWeek).toEqual([1, 3, 5])
      expect(after!.startDate).toBe('2026-02-01')
      expect(after!.endDate).toBe('2026-12-31')

      // 5. 返回的 result.habit 也应与 DB 一致（同一读回路径）
      expect(result.habit!.title).toBe('更新后标题')
      expect(result.habit!.frequency.type).toBe('weekly')
    } finally {
      await cleanupHabit(habit.id)
    }
  })

  it('T4（F-3 原子性，HIGH）：含非法字段 → 整体回滚，合法字段也未落库', async () => {
    const repo = new HabitRepository()
    const habit = await repo.create(
      makeCreateInput({ title: '原子性原始标题', defaultDuration: 30 }),
      MVP_USER_ID as any,
    )
    try {
      // input 含合法 title + 非法 defaultDuration=-1（field-executor number 校验拒负数）
      const input = {
        title: '原子性不应落库的标题',
        defaultDuration: -1,
      }

      const result = await updateHabit(habit.id, input)

      // 断言失败返回
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.habit).toBeUndefined()

      // 复查 DB —— 整体回滚：合法 title 也未落库，defaultDuration 仍是原值 30
      const after = await repo.findById(habit.id as any, MVP_USER_ID as any)
      expect(after).not.toBeNull()
      expect(after!.title).toBe('原子性原始标题')
      expect(after!.defaultDuration).toBe(30)
    } finally {
      await cleanupHabit(habit.id)
    }
  })

  it('T4b（F-3 原子性，enum 拒绝路径）：frequencyType 非法枚举 → 整体回滚', async () => {
    const repo = new HabitRepository()
    const habit = await repo.create(
      makeCreateInput({ title: 'enum原始标题', frequencyType: 'daily' }),
      MVP_USER_ID as any,
    )
    try {
      // frequencyType='yearly' 不在 manifest options [daily,weekly,custom]，字段执行器 enum 校验拒
      const input = {
        title: 'enum不应落库',
        frequencyType: 'yearly' as any,
      }

      const result = await updateHabit(habit.id, input)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()

      // 整体回滚：title 未落库，frequencyType 仍是 daily
      const after = await repo.findById(habit.id as any, MVP_USER_ID as any)
      expect(after).not.toBeNull()
      expect(after!.title).toBe('enum原始标题')
      expect(after!.frequency.type).toBe('daily')
    } finally {
      await cleanupHabit(habit.id)
    }
  })

  it('T5（F-2 frequency 合并，HIGH）：单写 frequencyType 不破坏 daysOfWeek 读回', async () => {
    const repo = new HabitRepository()
    // 初始 frequencyType=daily, daysOfWeek=[1,3,5]
    const habit = await repo.create(
      makeCreateInput({ frequencyType: 'daily', daysOfWeek: [1, 3, 5] }),
      MVP_USER_ID as any,
    )
    try {
      // 单写 frequencyType=weekly
      const result = await updateHabit(habit.id, { frequencyType: 'weekly' })

      expect(result.success).toBe(true)
      expect(result.habit).toBeDefined()

      // 读回：type 已变 weekly，daysOfWeek 仍为 [1,3,5]（未被清空）
      const after = await repo.findById(habit.id as any, MVP_USER_ID as any)
      expect(after).not.toBeNull()
      expect(after!.frequency.type).toBe('weekly')
      expect(after!.frequency.daysOfWeek).toEqual([1, 3, 5])
    } finally {
      await cleanupHabit(habit.id)
    }
  })

  it('T5b（F-2 frequency 合并，对称）：单写 daysOfWeek 不破坏 frequencyType 读回', async () => {
    const repo = new HabitRepository()
    const habit = await repo.create(
      makeCreateInput({ frequencyType: 'weekly', daysOfWeek: [1, 3, 5] }),
      MVP_USER_ID as any,
    )
    try {
      // 单写 daysOfWeek=[2,4]
      const result = await updateHabit(habit.id, { daysOfWeek: [2, 4] })

      expect(result.success).toBe(true)

      // 读回：daysOfWeek 已变 [2,4]，type 仍为 weekly
      const after = await repo.findById(habit.id as any, MVP_USER_ID as any)
      expect(after).not.toBeNull()
      expect(after!.frequency.type).toBe('weekly')
      expect(after!.frequency.daysOfWeek).toEqual([2, 4])
    } finally {
      await cleanupHabit(habit.id)
    }
  })

  it('T3b（契约保持）：空 input（全部 undefined）直接读回当前习惯，返回 success', async () => {
    const repo = new HabitRepository()
    const habit = await repo.create(
      makeCreateInput({ title: '空输入契约' }),
      MVP_USER_ID as any,
    )
    try {
      // 全部 undefined 字段：无 field step，走 findById 直接读回分支
      const result = await updateHabit(habit.id, {
        title: undefined,
        description: undefined,
      })

      expect(result.success).toBe(true)
      expect(result.habit).toBeDefined()
      expect(result.habit!.title).toBe('空输入契约')
    } finally {
      await cleanupHabit(habit.id)
    }
  })
})
