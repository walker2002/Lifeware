/**
 * @file update-thread.integration
 * @brief updateThread 单事务原子性集成测试（[020] updateThread 同病修复）
 *
 * 对接真实 Docker PostgreSQL，复现并验证 updateThread「逐字段 service.update 无事务」
 * bug 的修复：多字段写含一非法字段时，合法字段也不得落库（整体回滚）。
 *
 * 背景（revisit 存档案题1 实案，与 updateTask 同病）：updateThread 曾把批量 input
 * 拆成逐个 service.update 单字段写，无事务包裹——合法字段先落库、非法字段后失败 throw，
 * 留下半截改动。修复后应走 service.execute 单事务（对齐 updateTask tasks.ts:110）。
 *
 * 参照 src/app/actions/tasks/__tests__/update-task.integration.test.ts 模式。
 */

import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ThreadRepository } from '@/domains/tasks/repository/thread'
import { updateThread } from '@/app/actions/tasks'

/** updateThread 内部硬编码的 MVP 用户 ID（与 tasks.ts 一致）。 */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as const

/** 按 id 清理测试 thread */
async function cleanupThread(threadId: string) {
  try {
    await db.delete(s.threads).where(eq(s.threads.id, threadId))
  } catch {
    /* 忽略 */
  }
}

describe('updateThread 单事务原子性 — 集成测试（真实 PostgreSQL）', () => {
  it('多字段写含非法字段 → 整体回滚，合法字段也未落库', async () => {
    const repo = new ThreadRepository()
    const thread = await repo.create(
      { name: '原子性原始名称' },
      MVP_USER_ID,
    )
    try {
      // name（ContentField，合法）+ priority='invalid-enum'（FactField enum
      // [critical,high,medium,low]，field-executor 拒非法枚举）。字面量顺序 name 在前：
      //   现状（逐字段 service.update）：name 先落库 → priority 失败 throw
      //     → name 已被改成「不应落库」= bug（半截改动）
      //   修复后（service.execute 单事务）：任一步失败整体回滚，name 保持原值
      await expect(
        updateThread(thread.id, { name: '原子性不应落库', priority: 'invalid-enum' as never }),
      ).rejects.toThrow()

      const after = await repo.findById(thread.id as never, MVP_USER_ID as never)
      expect(after).not.toBeNull()
      // 关键断言：合法 name 不得落库（事务回滚）。现状此处失败 → RED。
      expect(after!.name).toBe('原子性原始名称')
    } finally {
      await cleanupThread(thread.id)
    }
  })
})
