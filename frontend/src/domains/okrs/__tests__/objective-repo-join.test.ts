/**
 * @file objective-repo-join
 * @brief ObjectiveRepository join cycles 真实 PG 集成测试
 *
 * [022] 1A-T6：验证读路径经 join cycle 派生非空 period（FM-4 critical）。
 * 不再用手搓 row，而是真实 save → findById/findAll 回环，断言 period 来自 join。
 * 依赖真实 PostgreSQL（容器 lifeware-postgres-1）。
 */
import { describe, it, expect } from 'vitest'
import { CycleRepository } from '../repository/cycle'
import { ObjectiveRepository } from '../repository/objective'

/** MVP 用户 ID（与 cycle-repo.test / app/actions/okr.ts 保持一致） */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as const

/** 构造一个带 cycleId 的合法 Objective（period 仅供 save 前的对象完整性，派生编号走 cycle） */
function makeObjective(cycleId: string) {
  return {
    id: crypto.randomUUID(),
    status: 'active' as const,
    title: `T-${Math.random().toString(36).slice(2, 8)}`,
    cycleId,
    okrType: 'committed' as const,
    objectiveNumber: '', // 触发派生编号
    priority: 'P1' as const,
    tags: [],
    parentId: undefined,
    createdAt: new Date().toISOString() as any,
    updatedAt: new Date().toISOString() as any,
  } as any
}

describe('ObjectiveRepository join cycles（[022] 1A-T6）', () => {
  it('findById 经 join cycle 返回非空派生 period', async () => {
    const cycleRepo = new CycleRepository()
    const cycle = {
      id: crypto.randomUUID(),
      cycleType: 'quarterly' as const,
      name: '2026-Q2',
      period: { start: '2026-04-01', end: '2026-06-30' },
      status: 'in_progress' as const,
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    }
    // [022] 1A-T8：save 按自然键 upsert，返回实际持久化的 Cycle
    const saved = await cycleRepo.save(cycle, MVP_USER_ID as any)

    const objRepo = new ObjectiveRepository()
    const obj = makeObjective(saved.id)
    await objRepo.save(obj, MVP_USER_ID as any)

    const got = await objRepo.findById(obj.id, MVP_USER_ID as any)
    // 以下 period.* 来自 join，非手搓 row（FM-4 critical 断言）
    expect(got?.period.start).toBe('2026-04-01')
    expect(got?.period.end).toBe('2026-06-30')
    expect(got?.period.type).toBe('quarterly')
    expect(got?.cycleId).toBe(saved.id)
  })

  it('save 从 cycleId 反查 cycle 派生编号（不依赖 objective.period）', async () => {
    const cycleRepo = new CycleRepository()
    const cycle = {
      id: crypto.randomUUID(),
      cycleType: 'annual' as const,
      name: '2026',
      period: { start: '2026-01-01', end: '2026-12-31' },
      status: 'in_progress' as const,
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    }
    // [022] 1A-T8：save 按自然键 upsert，返回实际持久化的 Cycle
    const saved = await cycleRepo.save(cycle, MVP_USER_ID as any)

    const objRepo = new ObjectiveRepository()
    const obj = makeObjective(saved.id)
    await objRepo.save(obj, MVP_USER_ID as any)

    const got = await objRepo.findById(obj.id, MVP_USER_ID as any)
    // 编号格式正确即可（共享测试 DB 已有历史数据，序号不确定）
    expect(got?.objectiveNumber).toMatch(/^26Y-O\d+$/)
    expect(got?.period.type).toBe('annual')
  })

  it('findByPeriod 按 cycles.periodStart 过滤（period 已迁至 cycles 表）', async () => {
    const cycleRepo = new CycleRepository()
    const q3 = {
      id: crypto.randomUUID(),
      cycleType: 'quarterly' as const,
      name: '2026-Q3',
      period: { start: '2026-07-01', end: '2026-09-30' },
      status: 'in_progress' as const,
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
    }
    // [022] 1A-T8：save 按自然键 upsert，返回实际持久化的 Cycle
    const saved = await cycleRepo.save(q3, MVP_USER_ID as any)

    const objRepo = new ObjectiveRepository()
    const obj = makeObjective(saved.id)
    await objRepo.save(obj, MVP_USER_ID as any)

    // Q3 落在 2026 全年范围内
    const list = await objRepo.findByPeriod('2026-01-01' as any, '2026-12-31' as any, MVP_USER_ID as any)
    const found = list.find((o) => o.id === obj.id)
    expect(found).toBeTruthy()
    expect(found?.period.start).toBe('2026-07-01')
    // 缩小范围到 Q1（01-01 ~ 03-31）应排除 Q3 目标
    const q1Only = await objRepo.findByPeriod('2026-01-01' as any, '2026-03-31' as any, MVP_USER_ID as any)
    expect(q1Only.find((o) => o.id === obj.id)).toBeUndefined()
  })
})
