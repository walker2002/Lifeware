/**
 * @file cycle-repo
 * @brief CycleRepository 真实 PG 集成测试
 *
 * [022] 1A-T4：Cycle 仓储 save→findById 回环、findByUserAndStatus 过滤。
 * 依赖真实 PostgreSQL（容器 lifeware-postgres-1）。
 */
import { describe, it, expect } from 'vitest'
import { CycleRepository } from '../repository/cycle'

/** MVP 用户 ID（与 app/actions/okr.ts 保持一致的现状来源） */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as const

describe('CycleRepository', () => {
  it('save 后 findById 能取回，且 name/cycleType/period 正确', async () => {
    const repo = new CycleRepository()
    const cycle = {
      id: crypto.randomUUID(),
      cycleType: 'quarterly' as const,
      name: '2026-Q2',
      period: { start: '2026-04-01', end: '2026-06-30' },
      status: 'in_progress' as const,
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    }
    await repo.save(cycle, MVP_USER_ID as any)
    const got = await repo.findById(cycle.id as any, MVP_USER_ID as any)
    expect(got?.name).toBe('2026-Q2')
    expect(got?.cycleType).toBe('quarterly')
    expect(got?.period.start).toBe('2026-04-01')
  })

  it('findByUserAndStatus 按状态过滤', async () => {
    const repo = new CycleRepository()
    const list = await repo.findByUserAndStatus('in_progress', MVP_USER_ID as any)
    expect(list.every((c) => c.status === 'in_progress')).toBe(true)
  })
})
