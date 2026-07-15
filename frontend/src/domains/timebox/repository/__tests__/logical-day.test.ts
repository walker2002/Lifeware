/**
 * @file logical-day.test
 * @brief [029] PR1 LogicalDayRepository 集成测试（真实 PostgreSQL）
 *
 * T5 migration applied → logical_days 表存在 + 唯一约束 (user_id, day_label)。
 * 沿用 src/lib/db/__tests__/activity-archetype-repo.test.ts 模式：
 * - 固定测试 USER_ID + beforeEach/afterAll 清场
 * - 真实 DB（DATABASE_URL from .env.local）
 *
 * 5 cases：懒建 / 幂等 / save 更新 / find null / AC-5 当前逻辑日。
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { LogicalDayRepository } from '../logical-day'
import { formatDateLabel } from '@/lib/logical-day/resolver'

const USER = '00000000-0000-0000-0000-000000000001' as const
const repo = new LogicalDayRepository()

describe('[029] LogicalDayRepository', () => {
  beforeEach(async () => {
    await db.delete(s.logicalDays).where(eq(s.logicalDays.userId, USER as any))
  })
  afterAll(async () => {
    await db.delete(s.logicalDays).where(eq(s.logicalDays.userId, USER as any))
  })

  it('findOrCreateByDate 首次创建空行', async () => {
    const ld = await repo.findOrCreateByDate('2026-07-14', USER as any)
    expect(ld.dayLabel).toBe('2026-07-14')
    expect(ld.energyBaseline).toBeNull()
    expect(ld.reviewRating).toBeNull()
  })

  it('findOrCreateByDate 幂等：再次返回同一行', async () => {
    const a = await repo.findOrCreateByDate('2026-07-14', USER as any)
    const b = await repo.findOrCreateByDate('2026-07-14', USER as any)
    expect(a.id).toBe(b.id)
  })

  it('save 更新复盘字段', async () => {
    const ld = await repo.findOrCreateByDate('2026-07-14', USER as any)
    ld.reviewRating = 4
    ld.reviewNotes = '专注度不错'
    ld.energyBaseline = 7
    await repo.save(ld)
    const got = await repo.findByDate('2026-07-14', USER as any)
    expect(got?.reviewRating).toBe(4)
    expect(got?.reviewNotes).toBe('专注度不错')
    expect(got?.energyBaseline).toBe(7)
  })

  it('findById / findByDate null 当不存在', async () => {
    expect(await repo.findByDate('1999-01-01', USER as any)).toBeNull()
  })

  it('findCurrentByDate (AC-5)', async () => {
    // 种一条 today label 的行
    const ld = await repo.findOrCreateByDate(formatDateLabel(new Date(), 'Asia/Shanghai') as any, USER as any)
    const got = await repo.findCurrentByDate(USER as any, 'Asia/Shanghai')
    expect(got?.id).toBe(ld.id)
  })
})