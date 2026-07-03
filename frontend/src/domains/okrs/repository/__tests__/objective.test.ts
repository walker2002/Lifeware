/**
 * @file objective.test
 * @brief ObjectiveRepository 集成测试
 *
 * [022.01] Phase 3：findAll 行为变更测试
 *  - discardedAt 非 NULL 的 objectives 不返回
 *  - archivedAt 非 NULL 的 objectives 不返回
 * 依赖真实 PostgreSQL（容器 lifeware-postgres-1）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { ObjectiveRepository } from '../objective'

const USER_ID = '00000000-0000-0000-0000-000000000001' as const

/** 唯一周期区间，避免与其他测试 fixture 冲突 */
const periodStart = '2025-04-01'
const periodEnd = '2025-06-30'

let cycleId: string

describe('ObjectiveRepository.findAll after Phase 3', () => {
  const repo = new ObjectiveRepository()

  /** 固定 cycleId（一个 cycle 即可，下挂多个 objective 验证过滤） */
  beforeAll(async () => {
    const existing = await db.select().from(s.cycles)
      .where(and(
        eq(s.cycles.userId, USER_ID),
        eq(s.cycles.periodStart, periodStart),
        eq(s.cycles.periodEnd, periodEnd),
      ))
      .limit(1)
    if (existing.length > 0) {
      cycleId = existing[0].id
    } else {
      cycleId = crypto.randomUUID()
      await db.insert(s.cycles).values({
        id: cycleId,
        userId: USER_ID,
        cycleType: 'quarterly',
        name: '2025-Q2-objective-test',
        periodStart,
        periodEnd,
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }
  })

  afterAll(async () => {
    // 清理测试用 obj（discarded / archived / active 三种）
    await db.delete(s.objectives).where(and(
      eq(s.objectives.userId, USER_ID),
      eq(s.objectives.cycleId, cycleId),
    ))
  })

  it('不返回 discardedAt 非 NULL 的 objectives', async () => {
    // 准备：插入 1 active + 1 discarded
    const activeId = crypto.randomUUID()
    const discardedId = crypto.randomUUID()
    await db.insert(s.objectives).values([
      {
        id: activeId, userId: USER_ID, cycleId,
        title: 'P3-测试-active', okrType: 'committed',
        objectiveNumber: '25Q2-O-active', priority: 'P1', tags: [],
        createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: discardedId, userId: USER_ID, cycleId,
        title: 'P3-测试-discarded', okrType: 'committed',
        objectiveNumber: '25Q2-O-discarded', priority: 'P1', tags: [],
        createdAt: new Date(), updatedAt: new Date(),
        discardedAt: new Date(),
      },
    ])

    const all = await repo.findAll(USER_ID)
    const ids = all.map((o) => o.id)
    expect(ids).toContain(activeId)
    expect(ids).not.toContain(discardedId)

    // 清理
    await db.delete(s.objectives).where(and(
      eq(s.objectives.id, activeId),
      eq(s.objectives.userId, USER_ID),
    ))
    await db.delete(s.objectives).where(and(
      eq(s.objectives.id, discardedId),
      eq(s.objectives.userId, USER_ID),
    ))
  })

  it('不返回 archivedAt 非 NULL 的 objectives', async () => {
    // 准备：插入 1 active + 1 archived
    const activeId = crypto.randomUUID()
    const archivedId = crypto.randomUUID()
    await db.insert(s.objectives).values([
      {
        id: activeId, userId: USER_ID, cycleId,
        title: 'P3-测试-active2', okrType: 'committed',
        objectiveNumber: '25Q2-O-active2', priority: 'P1', tags: [],
        createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: archivedId, userId: USER_ID, cycleId,
        title: 'P3-测试-archived', okrType: 'committed',
        objectiveNumber: '25Q2-O-archived', priority: 'P1', tags: [],
        createdAt: new Date(), updatedAt: new Date(),
        archivedAt: new Date(),
      },
    ])

    const all = await repo.findAll(USER_ID)
    const ids = all.map((o) => o.id)
    expect(ids).toContain(activeId)
    expect(ids).not.toContain(archivedId)

    // 清理
    await db.delete(s.objectives).where(and(
      eq(s.objectives.id, activeId),
      eq(s.objectives.userId, USER_ID),
    ))
    await db.delete(s.objectives).where(and(
      eq(s.objectives.id, archivedId),
      eq(s.objectives.userId, USER_ID),
    ))
  })
})