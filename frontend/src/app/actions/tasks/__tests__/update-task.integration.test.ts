/**
 * @file update-task.integration
 * @brief updateTask 单事务原子性集成测试（[020] 先修 bug）
 *
 * 对接真实 Docker PostgreSQL，复现并验证 updateTask「逐字段 service.update 无事务」
 * bug 的修复：多字段写含一非法字段时，合法字段也不得落库（整体回滚）。
 *
 * 背景（revisit 存档案题1 实案）：updateTask 曾把批量 input 拆成逐个 service.update
 * 单字段写，无事务包裹——合法字段先落库、非法字段后失败 throw，留下半截改动。
 * 修复后应走 service.execute 单事务（对齐 updateHabit intent.ts:910 模式）。
 *
 * 参照 src/app/actions/habits/__tests__/update-habit.integration.test.ts T4 模式。
 */

import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { TaskRepository } from '@/domains/tasks/repository/task'
import { updateTask } from '@/app/actions/tasks'

/** updateTask 内部硬编码的 MVP 用户 ID（与 tasks.ts 一致）。 */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as const

/** 按 id 清理测试 task */
async function cleanupTask(taskId: string) {
  try {
    await db.delete(s.tasks).where(eq(s.tasks.id, taskId))
  } catch {
    /* 忽略 */
  }
}

describe('updateTask 单事务原子性 — 集成测试（真实 PostgreSQL）', () => {
  it('多字段写含非法字段 → 整体回滚，合法字段也未落库', async () => {
    const repo = new TaskRepository()
    const task = await repo.create(
      { title: '原子性原始标题', threadId: undefined, parentId: undefined },
      MVP_USER_ID,
    )
    try {
      // title（ContentField，合法）+ estimatedDuration=-1（FactField number，
      // field-executor 拒负数）。字面量顺序 title 在前：
      //   现状（逐字段 service.update）：title 先落库 → estimatedDuration 失败 throw
      //     → title 已被改成「不应落库」= bug（半截改动）
      //   修复后（service.execute 单事务）：任一步失败整体回滚，title 保持原值
      await expect(
        updateTask(task.id, { title: '原子性不应落库', estimatedDuration: -1 }),
      ).rejects.toThrow()

      const after = await repo.findById(task.id as any, MVP_USER_ID as any)
      expect(after).not.toBeNull()
      // 关键断言：合法 title 不得落库（事务回滚）。现状此处失败 → RED。
      expect(after!.title).toBe('原子性原始标题')
    } finally {
      await cleanupTask(task.id)
    }
  })
})
