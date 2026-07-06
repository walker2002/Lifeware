/**
 * @file activity-archetype-repo.test
 * @brief ActivityArchetypeRepository 集成测试（真实 DB）
 *
 * [023.11] 测试 synonyms 字段的 mapper round-trip + create/update 透传。
 * 真实 PostgreSQL 集成，用唯一 l2Name 避免冲突。
 *
 * @see docs/usom-design.md §3.11
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import { ActivityArchetypeRepository } from '@/lib/db/repositories/activity-archetype.repository'
import * as s from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

const USER_ID = '00000000-0000-0000-0000-000000000000' as const
const repo = new ActivityArchetypeRepository()

describe('ActivityArchetypeRepository — [023.11] synonyms 字段集成测试', () => {
  beforeAll(async () => {
    // 确保测试用户存在
    await db.insert(s.users).values({ id: USER_ID, email: 'test@example.com' }).onConflictDoNothing()
  })

  it('[023.11] create 带 synonyms → find 回来含 synonyms', async () => {
    const created = await repo.create(
      {
        l1Category: '工作',
        l2Name: '[023.11] 测试原型',
        energyCost: { physical: 1, mental: 1, emotional: 1, creative: 1 },
        activityLabel: {
          enjoyment: 5,
          typicalDuration: 30,
          interruptTolerance: 'medium',
          environment: [],
          location: [],
          parallelizable: false,
        },
        synonyms: ['写代码', '编程'],
      },
      USER_ID,
    )
    expect(created.synonyms).toEqual(['写代码', '编程'])

    const got = await repo.findById(created.id, USER_ID)
    expect(got?.synonyms).toEqual(['写代码', '编程'])
  })

  it('[023.11] create 不传 synonyms → 默认 []', async () => {
    const created = await repo.create(
      {
        l1Category: '工作',
        l2Name: '[023.11] 无义词原型',
        energyCost: { physical: 1, mental: 1, emotional: 1, creative: 1 },
        activityLabel: {
          enjoyment: 5,
          typicalDuration: 30,
          interruptTolerance: 'medium',
          environment: [],
          location: [],
          parallelizable: false,
        },
      },
      USER_ID,
    )
    expect(created.synonyms).toEqual([])
  })

  it('[023.11] update synonyms 落库 + audit changedFields 含 synonyms', async () => {
    const created = await repo.create(
      {
        l1Category: '工作',
        l2Name: '[023.11] 更新原型',
        energyCost: { physical: 1, mental: 1, emotional: 1, creative: 1 },
        activityLabel: {
          enjoyment: 5,
          typicalDuration: 30,
          interruptTolerance: 'medium',
          environment: [],
          location: [],
          parallelizable: false,
        },
      },
      USER_ID,
    )

    await repo.update(created.id, { synonyms: ['新词'] }, USER_ID)

    const got = await repo.findById(created.id, USER_ID)
    expect(got?.synonyms).toEqual(['新词'])

    // 验证 audit log 记录了 changedFields
    const auditLogs = await db
      .select()
      .from(s.userAuditLog)
      .where(
        and(
          eq(s.userAuditLog.recordId, created.id),
          eq(s.userAuditLog.action, 'update')
        )
      )

    const updateLog = auditLogs.find((log) => log.action === 'update')
    expect(updateLog).toBeDefined()
    expect(updateLog?.changedFields).toContain('synonyms')
  })
})
