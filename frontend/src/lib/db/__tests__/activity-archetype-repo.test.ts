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

  it('[023.11] seedDefaults 给新用户插入带 synonyms 的系统条目', async () => {
    const NEW_USER_ID = '11111111-1111-1111-1111-111111111111' as const
    // 确保新用户存在
    await db.insert(s.users).values({ id: NEW_USER_ID, email: 'newuser@example.com' }).onConflictDoNothing()
    // 清理该用户可能存在的旧数据
    await db.delete(s.activityArchetypes).where(eq(s.activityArchetypes.userId, NEW_USER_ID))

    const n = await repo.seedDefaults(NEW_USER_ID)
    expect(n).toBeGreaterThan(0)
    const all = await repo.findByUser(NEW_USER_ID)
    const deep = all.find(a => a.l2Name === '深度专注')
    expect(deep?.synonyms).toContain('写代码')
  })

  it('[023.11] seedDefaults 升级既有空 synonyms 的系统条目（幂等）', async () => {
    const NEW_USER_ID = '22222222-2222-2222-2222-222222222222' as const
    // 确保新用户存在
    await db.insert(s.users).values({ id: NEW_USER_ID, email: 'newuser2@example.com' }).onConflictDoNothing()
    // 清理该用户可能存在的旧数据
    await db.delete(s.activityArchetypes).where(eq(s.activityArchetypes.userId, NEW_USER_ID))

    await repo.seedDefaults(NEW_USER_ID)
    // 模拟既有条目被清空 synonyms（如迁移后状态）
    // 将系统条目的 synonyms 清空
    await db.update(s.activityArchetypes)
      .set({ synonyms: [] })
      .where(and(eq(s.activityArchetypes.userId, NEW_USER_ID), eq(s.activityArchetypes.isSystem, true)))
    const n2 = await repo.seedDefaults(NEW_USER_ID)
    expect(n2).toBeGreaterThan(0) // 应该升级所有空 synonyms 的系统条目

    // 第三次运行应该幂等（无变更）
    const n3 = await repo.seedDefaults(NEW_USER_ID)
    expect(n3).toBe(0) // 已全填，三次 seed 无变更
  })
})
