/**
 * @file cycle-repo
 * @brief CycleRepository 真实 PG 集成测试
 *
 * [022] 1A-T4：Cycle 仓储 save→findById 回环、findByUserAndStatus 过滤。
 * 依赖真实 PostgreSQL（容器 lifeware-postgres-1）。
 * [023.12] T6：fixture status in_progress→approved（[AM6] 同步）。
 */
import { describe, it, expect } from 'vitest'
import { CycleRepository } from '../repository/cycle'

/** MVP 用户 ID（与 app/actions/okr.ts 保持一致的现状来源） */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as const

describe('CycleRepository', () => {
  it('save 后 findById 能取回，且 name/cycleType/period 正确', async () => {
    const repo = new CycleRepository()
    // [023.12] T6：in_progress→approved
    const cycle = {
      id: crypto.randomUUID(),
      cycleType: 'quarterly' as const,
      name: '2026-Q2',
      period: { start: '2026-04-01', end: '2026-06-30' },
      status: 'approved' as const,
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    }
    const saved = await repo.save(cycle, MVP_USER_ID as any)
    // [022] 1A-T8：save 按自然键 upsert，返回实际持久化的 Cycle
    const got = await repo.findById(saved.id as any, MVP_USER_ID as any)
    expect(got?.name).toBe('2026-Q2')
    expect(got?.cycleType).toBe('quarterly')
    expect(got?.period.start).toBe('2026-04-01')
  })

  it('findByUserAndStatus 按状态过滤', async () => {
    const repo = new CycleRepository()
    // [023.12] T6：in_progress→approved
    const list = await repo.findByUserAndStatus('approved', MVP_USER_ID as any)
    expect(list.every((c) => c.status === 'approved')).toBe(true)
  })
})
