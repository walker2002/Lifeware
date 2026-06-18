/**
 * @file complete-task.integration
 * @brief completeTask 单事务集成测试（T9）
 *
 * 对接真实 Docker PostgreSQL，验证 tasks.ts completeTask 的单事务落库一致性
 * （字段 actualDuration/notes + 状态 complete 在写入口 execute() 单事务内）。
 *
 * 覆盖场景：
 *  1. 正常路径（纯状态）：in_progress 任务、无额外字段 → completeTask 单事务把状态
 *     转为 completed，DB 落库一致。
 *  2. BUG-002 已修复回归：completeTask 携带 notes / actualDuration，字段落库 + 状态转 completed。
 *
 *   历史（BUG-002）：actualDuration/notes 未在 manifest field_metadata 声明，字段执行器
 *   对「未声明字段」返回 Rejected，驱动事务回滚；现已在 manifest 区块 C 补声明
 *   （actualDuration=FactField、notes=ContentField），completeTask 的核心用途（完成时
 *   记录实际时长/备注）可用。
 *
 * 数据隔离：completeTask 内部硬编码 MVP_USER_ID（...001，T4 用户、已存在）。
 * 测试在该用户下创建独立 task id，finally 按 id 清理，不污染其它测试。
 *
 * 注：不重复 migration.test.ts（mock 路径）与 promote-to-thread.integration（聚合事务）。
 */

import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { TaskRepository } from '@/domains/tasks/repository/task'
import { completeTask } from '@/app/actions/tasks'

/**
 * completeTask 内部硬编码的 MVP 用户 ID（与 tasks.ts 一致）。
 * 测试在该用户下创建/清理独立 task，避免引入新用户。
 */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as const

/** 按 id 清理测试 task */
async function cleanupTask(taskId: string) {
  try {
    await db.delete(s.tasks).where(eq(s.tasks.id, taskId))
  } catch {
    /* 忽略 */
  }
}

describe('completeTask 单事务 — 集成测试（真实 PostgreSQL）', () => {
  it('正常路径（纯状态）：in_progress 任务 completeTask → 单事务落库为 completed', async () => {
    const repo = new TaskRepository()
    // 1. 创建并推进到 in_progress（complete 动作仅 from in_progress，见 task lifecycle）
    const task = await repo.create(
      { title: 'CT 正常路径', threadId: undefined, parentId: undefined },
      MVP_USER_ID,
    )
    await db.update(s.tasks).set({ status: 'in_progress' }).where(eq(s.tasks.id, task.id))

    try {
      // 2. completeTask（无额外字段）→ 单事务状态转换
      const result = await completeTask(task.id)

      // 3. 复查 DB —— 状态已落库为 completed
      expect(result.status).toBe('completed')
      const after = await repo.findById(task.id as any, MVP_USER_ID as any)
      expect(after).not.toBeNull()
      expect(after!.status).toBe('completed')
    } finally {
      await cleanupTask(task.id)
    }
  })

  it('BUG-002 已修复：completeTask 携带 notes → 字段落库 + 状态转 completed', async () => {
    const repo = new TaskRepository()
    const task = await repo.create(
      { title: 'CT notes 回归', threadId: undefined, parentId: undefined },
      MVP_USER_ID,
    )
    await db.update(s.tasks).set({ status: 'in_progress' }).where(eq(s.tasks.id, task.id))

    try {
      // completeTask 携带 notes：notes 已在 manifest field_metadata 声明（ContentField）
      // → 字段落库 + 状态转 completed，单事务原子完成
      const result = await completeTask(task.id, { notes: '完成备注' })

      // 复查 DB —— 状态已 completed、notes 已落库
      expect(result.status).toBe('completed')
      const after = await repo.findById(task.id as any, MVP_USER_ID as any)
      expect(after).not.toBeNull()
      expect(after!.status).toBe('completed')
      expect(after!.notes).toBe('完成备注')
    } finally {
      await cleanupTask(task.id)
    }
  })

  it('BUG-002 已修复：completeTask 携带 actualDuration → 字段落库 + 状态转 completed', async () => {
    const repo = new TaskRepository()
    const task = await repo.create(
      { title: 'CT duration 回归', threadId: undefined, parentId: undefined },
      MVP_USER_ID,
    )
    await db.update(s.tasks).set({ status: 'in_progress' }).where(eq(s.tasks.id, task.id))

    try {
      // completeTask 携带 actualDuration：actualDuration 已在 manifest field_metadata 声明
      // （FactField，影响排程的业务事实）→ 字段落库 + 状态转 completed
      const result = await completeTask(task.id, { actualDuration: 45 })

      // 复查 DB —— 状态已 completed、actualDuration 已落库
      expect(result.status).toBe('completed')
      const after = await repo.findById(task.id as any, MVP_USER_ID as any)
      expect(after).not.toBeNull()
      expect(after!.status).toBe('completed')
      expect((after as any).actualDuration).toBe(45)
    } finally {
      await cleanupTask(task.id)
    }
  })
})
