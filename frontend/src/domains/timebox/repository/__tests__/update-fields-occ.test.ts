/**
 * @file update-fields-occ
 * @brief TimeboxRepository.updateFields OCC 集成测试（[TD-003] T2）
 *
 * 验证 TimeboxRepository.updateFields 在 WHERE occ_version = expectedOccVersion
 * 谓词下的乐观并发控制语义：
 * - 测试①：fresh row (occVersion=1) UPDATE WHERE occ_version=1 → 1 row affected
 *   + occVersion 自动 +1 → 行内 occVersion=2
 * - 测试②：第一次 UPDATE 让 occVersion=2；第二次仍 expectedOccVersion=1 → 0 rows
 *   → 抛 ConflictError，含 currentOccVersion（= 3：第二次又被前一次 +1 之前就已 +1）
 *
 * 集成测试（真实 PostgreSQL）：与 appointment.test.ts 同模板。docker compose 必须
 * 已在跑，DATABASE_URL 已配。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/lib/db'
import * as s from '@/lib/db/schema'
import { TimeboxRepository } from '@/domains/timebox/repository'
import { ConflictError } from '@/domains/timebox/errors/occ-conflict-error'
import { eq } from 'drizzle-orm'

describe('[TD-003] TimeboxRepository.updateFields OCC', () => {
  const repo = new TimeboxRepository()
  // 使用 dev 已存在的 seed user（UUID 类型 + users FK），与 appointment.test.ts 一致
  const userId = '00000000-0000-0000-0000-000000000001' as any
  let timeboxId: string

  beforeEach(async () => {
    // 清理旧 fixture，避免遗留污染
    await db.delete(s.timeboxes).where(eq(s.timeboxes.userId, userId))
    // 插入一个 occVersion=1 的 timebox
    timeboxId = crypto.randomUUID() as any
    await db.insert(s.timeboxes).values({
      id: timeboxId,
      userId,
      title: 'OCC test',
      startTime: new Date(),
      endTime: new Date(Date.now() + 30 * 60 * 1000),
      occVersion: 1,
      schemaVersion: 1,
      status: 'planned',
    } as any)
  })

  afterEach(async () => {
    await db.delete(s.timeboxes).where(eq(s.timeboxes.id, timeboxId))
  })

  it('① fresh row (occVersion=1) update WHERE occ_version=1 → ok + occVersion=2', async () => {
    const updated = await repo.updateFields(
      timeboxId,
      { title: 'updated title' },
      userId,
      1,
    )
    expect(updated.title).toBe('updated title')
    // 回读验证 occVersion 已 +1
    const [row] = await db.select().from(s.timeboxes).where(eq(s.timeboxes.id, timeboxId))
    expect(row.occVersion).toBe(2)
  })

  it('② stale version (expectedOccVersion=1, current=3) → ConflictError(currentOccVersion=3, attemptedOccVersion=1)', async () => {
    // 第一次 update：occVersion 从 1 → 2
    await repo.updateFields(timeboxId, { title: 'first update' }, userId, 1)
    // 第二次 update：occVersion 从 2 → 3（同时也是 stale 之前的最后一次成功）
    await repo.updateFields(timeboxId, { title: 'second update' }, userId, 2)
    // 第三次 update 仍 expectedOccVersion=1 → 必抛 ConflictError
    await expect(
      repo.updateFields(timeboxId, { title: 'stale update' }, userId, 1),
    ).rejects.toThrow(ConflictError)
    try {
      await repo.updateFields(timeboxId, { title: 'stale again' }, userId, 1)
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError)
      expect((err as ConflictError).currentOccVersion).toBe(3)
      expect((err as ConflictError).attemptedOccVersion).toBe(1)
    }
  })
})