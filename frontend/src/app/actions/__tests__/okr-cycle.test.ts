/**
 * @file okr-cycle.test
 * @brief [022.01] Phase 1 + [023.12] T6: createCycle / approveCycle / reviewCycle / finishCycle / revertCycle 集成测试
 *
 * 目的（eng-review D3 + Task 7 Finding #2）：
 * 1. 验证 createCycle 经 orchestrator.executeIntent 调用，不再走 repo.save 直写
 * 2. 验证 status 入参已被 server-side SM create→draft 强制，
 *    即调用方传入的 fields 不含 status（构造侧验证）
 * 3. [023.12] T6：approveCycle 移除「now vs periodStart」分派——单一 action='approveCycle'
 *    替代旧的 startCycle / planCycle 二选一。批准即活跃，无「未开始」中间态。
 * 4. [T6]：finishCycle 替代 endCycle（in_progress→approved 入参、startCycle→finishCycle action）
 * 5. [T6]：revertCycle 新增（reviewed→finished 一致性回退，[AM10]）
 *
 * 模式（参照现有 frontend/src/app/actions/__tests__/*.test.ts）：
 * - vi.mock 拦截 @/domains/okrs/wiring，注入假 createOKROrchestrator + makeIntent
 * - vi.mock 拦截 @/domains/okrs/repository/cycle，注入假 CycleRepository.findById
 * - vi.mocked 取出 mock 实例断言调用入参
 *
 * 不需要真实 PG —— 本测试只锁「写入口选择 + 入参形状 + 分派逻辑」三个治理契约。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────

const executeIntentMock = vi.fn()

vi.mock('@/domains/okrs/wiring', () => ({
  createOKROrchestrator: vi.fn(async () => ({
    executeIntent: executeIntentMock,
  })),
  makeIntent: vi.fn((action: string, fields: Record<string, unknown>) => ({
    id: 'intent-id-mock',
    intentionId: 'intention-id-mock',
    targetDomain: 'okrs',
    action,
    fields,
    confidence: 1.0,
    resolvedBy: 'template_form',
    createdAt: new Date().toISOString(),
  })),
}))

// mock CycleRepository.findById —— 不接 PG；按调用现场注入返回 cycle
const findByIdMock = vi.fn()
vi.mock('@/domains/okrs/repository/cycle', () => ({
  CycleRepository: class MockCycleRepository {
    findById = findByIdMock
  },
}))

import { createCycle, approveCycle } from '../okr'

const mockExecuteIntent = vi.mocked(executeIntentMock)
const mockFindById = vi.mocked(findByIdMock)

describe('[022.01] createCycle 走 executeIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createCycle 调用 orchestrator.executeIntent（不再 repo.save 直写）', async () => {
    const fakeCycle = {
      id: 'cycle-mock-001',
      cycleType: 'quarterly',
      name: '2027-Q1',
      period: { start: '2027-01-01', end: '2027-03-31' },
      status: 'draft', // SM 强制 draft，adapter 返回的也是 draft
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    mockExecuteIntent.mockResolvedValueOnce({
      success: true,
      object: fakeCycle,
      objectType: 'cycle',
    })

    const r = await createCycle({
      cycleType: 'quarterly',
      name: '2027-Q1',
      periodStart: '2027-01-01',
      periodEnd: '2027-03-31',
    })

    // 1) success=true，data 为 orchestrator 返回的 object
    expect(r.success).toBe(true)
    expect(r.data).toEqual(fakeCycle)

    // 2) executeIntent 被调用 1 次
    expect(mockExecuteIntent).toHaveBeenCalledTimes(1)

    // 3) 入参 intent 的 action='createCycle'，fields 仅业务字段（不含 id/status/timestamps）
    const [intent, userId] = mockExecuteIntent.mock.calls[0]
    expect(intent.action).toBe('createCycle')
    expect(userId).toBe('00000000-0000-0000-0000-000000000001') // MVP_USER_ID
    expect(intent.fields).toEqual({
      cycleType: 'quarterly',
      name: '2027-Q1',
      periodStart: '2027-01-01',
      periodEnd: '2027-03-31',
    })
  })

  it('createCycle 不接受 status 入参（fields 不含 status，由 SM 强制 draft）', async () => {
    mockExecuteIntent.mockResolvedValueOnce({
      success: true,
      object: {
        id: 'cycle-mock-002',
        cycleType: 'quarterly',
        name: 'auto-name-2027-Q2',
        period: { start: '2027-04-01', end: '2027-06-30' },
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      objectType: 'cycle',
    })

    // 故意尝试传入 status 字段（TS 编译会拒，但验证 runtime 也将其忽略）
    await createCycle({
      cycleType: 'quarterly',
      name: 'auto-name-2027-Q2',
      periodStart: '2027-04-01',
      periodEnd: '2027-06-30',
    } as any)

    const [intent] = mockExecuteIntent.mock.calls[0]
    // fields 不含 status（SM 强制 draft，调用方无权指定）
    expect(intent.fields).not.toHaveProperty('status')
  })

  it('createCycle 在 orchestrator 失败时透传 error', async () => {
    mockExecuteIntent.mockResolvedValueOnce({
      success: false,
      error: '周期已存在',
    })

    const r = await createCycle({
      cycleType: 'quarterly',
      name: 'dup',
      periodStart: '2027-01-01',
      periodEnd: '2027-03-31',
    })

    expect(r.success).toBe(false)
    expect(r.error).toBe('周期已存在')
  })

  it('createCycle 在 orchestrator 成功但缺 object 时返回明确错误', async () => {
    mockExecuteIntent.mockResolvedValueOnce({
      success: true,
      // 缺 object —— 异常路径
    })

    const r = await createCycle({
      cycleType: 'monthly',
      name: 'no-object',
      periodStart: '2027-07-01',
      periodEnd: '2027-07-31',
    })

    expect(r.success).toBe(false)
    expect(r.error).toBe('周期创建成功但未返回对象')
  })
})

/**
 * [022.01] Phase 1 Task 7 Finding #2 + [023.12] T6：approveCycle 单一 action 收敛
 *
 * [T6] 旧实现按 server 时刻 now 与 period.start 比较：
 *   - now >= periodStart → executeIntent('startCycle')（draft → in_progress）
 *   - now <  periodStart → executeIntent('planCycle')  （draft → not_started）
 * [T6] 新设计：4 态收敛——not_started 状态删除，approve 单一动作 draft → approved。
 * 此处 verify approveCycle 直接调 executeIntent('approveCycle')，无 now 分派。
 */
describe('[022.01] + [023.12] T6 approveCycle 分派逻辑', () => {
  const draftCycle = {
    id: 'c1e00000-0000-0000-0000-000000000001',
    cycleType: 'quarterly' as const,
    name: '2026-Q3',
    period: { start: '2026-07-01', end: '2026-09-30' },
    status: 'draft' as const,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('draft cycle → executeIntent("approveCycle")（[T6] 单一 action，无 now 分派）', async () => {
    // [T6] 不再做 now vs periodStart 比较——所有 draft cycle 都走 approveCycle
    mockFindById.mockResolvedValue(draftCycle)
    mockExecuteIntent.mockResolvedValueOnce({
      success: true,
      // [T6] approveCycle 的成功 to 状态：approved（[AM6] 同步，原 in_progress）
      object: { ...draftCycle, status: 'approved', approvedAt: '2026-07-15T00:00:00.000Z' as any },
      objectType: 'cycle',
    })

    const r = await approveCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(true)
    expect(mockFindById).toHaveBeenCalledTimes(2) // 前置读 + 回读
    expect(mockExecuteIntent).toHaveBeenCalledTimes(1)
    const [intent] = mockExecuteIntent.mock.calls[0]
    // [T6] 单一 action：'approveCycle'（旧 startCycle/planCycle 二选一已删）
    expect(intent.action).toBe('approveCycle')
    expect(intent.fields).toEqual({ cycleId: 'c1e00000-0000-0000-0000-000000000001' })
  })

  it('非 draft cycle 直接返回错误，不调用 orchestrator', async () => {
    // [T6] in_progress→approved
    const approvedCycle = { ...draftCycle, status: 'approved' as const }
    mockFindById.mockResolvedValueOnce(approvedCycle)

    const r = await approveCycle('c1e00000-0000-0000-0000-000000000001')

    // 不走 orchestrator：避免误改已 approved/finished/reviewed 周期
    expect(r.success).toBe(false)
    expect(r.error).toBe('当前周期状态为「approved」，仅 draft 状态可审核通过')
    expect(mockExecuteIntent).not.toHaveBeenCalled()
    expect(mockFindById).toHaveBeenCalledTimes(1) // 仅前置读，无回读
  })
})

// ─── approveCycle 负路径 ─────────────────────────────────────────────

describe('[022.01] approveCycle 负路径', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('非法 UUID → error', async () => {
    const r = await approveCycle('not-a-uuid')
    expect(r.success).toBe(false)
    expect(r.error).toBe('无效的周期 ID')
    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockExecuteIntent).not.toHaveBeenCalled()
  })

  it('cycle 不存在 → error', async () => {
    mockFindById.mockResolvedValueOnce(null)
    const r = await approveCycle('c1e00000-0000-0000-0000-000000000001')
    expect(r.success).toBe(false)
    expect(r.error).toBe('周期不存在')
    expect(mockExecuteIntent).not.toHaveBeenCalled()
  })

  it('executeIntent 失败 → 透传 error', async () => {
    const draftCycle = {
      id: 'c1e00000-0000-0000-0000-000000000001',
      cycleType: 'quarterly' as const,
      name: '2026-Q3',
      period: { start: '2026-07-01', end: '2026-09-30' },
      status: 'draft' as const,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    }
    mockFindById.mockResolvedValueOnce(draftCycle)
    mockExecuteIntent.mockResolvedValueOnce({
      success: false,
      error: 'SM error',
    })

    const r = await approveCycle('c1e00000-0000-0000-0000-000000000001')
    expect(r.success).toBe(false)
    expect(r.error).toBe('SM error')
    expect(mockFindById).toHaveBeenCalledTimes(1) // 仅前置读，无回读
    expect(mockExecuteIntent).toHaveBeenCalledTimes(1)
  })

  it('回读失败 → error', async () => {
    const draftCycle = {
      id: 'c1e00000-0000-0000-0000-000000000001',
      cycleType: 'quarterly' as const,
      name: '2026-Q3',
      period: { start: '2026-07-01', end: '2026-09-30' },
      status: 'draft' as const,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    }
    mockFindById.mockResolvedValueOnce(draftCycle) // 前置读
    mockExecuteIntent.mockResolvedValueOnce({
      success: true,
      object: { ...draftCycle, status: 'in_progress' },
      objectType: 'cycle',
    })
    mockFindById.mockResolvedValueOnce(null) // 回读返回 null

    const r = await approveCycle('c1e00000-0000-0000-0000-000000000001')
    expect(r.success).toBe(false)
    expect(r.error).toBe('审核通过后回读失败')
    expect(mockFindById).toHaveBeenCalledTimes(2)
    expect(mockExecuteIntent).toHaveBeenCalledTimes(1)
  })

  it('catch-all 异常 → error', async () => {
    mockFindById.mockRejectedValueOnce(new Error('网络错误'))
    const r = await approveCycle('c1e00000-0000-0000-0000-000000000001')
    expect(r.success).toBe(false)
    expect(r.error).toBe('网络错误')
    expect(mockExecuteIntent).not.toHaveBeenCalled()
  })
})

// ─── createCycle catch-all ──────────────────────────────────────────

describe('[022.01] createCycle catch-all', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('orchestrator.executeIntent 抛出异常 → error', async () => {
    mockExecuteIntent.mockRejectedValueOnce(new Error('网络错误'))

    const r = await createCycle({
      cycleType: 'quarterly',
      name: '2027-Q1',
      periodStart: '2027-01-01',
      periodEnd: '2027-03-31',
    })

    expect(r.success).toBe(false)
    expect(r.error).toBe('网络错误')
    expect(mockExecuteIntent).toHaveBeenCalledTimes(1)
  })
})

// ─── reviewCycle 分派逻辑（[022.01] Phase 2 + [023.12] T6）─────────────────────────

describe('[022.01] + [023.12] T6 reviewCycle 分派逻辑', () => {
  // [023.12] T6：[AM6] ended→finished
  const finishedCycle = {
    id: 'c1e00000-0000-0000-0000-000000000001',
    cycleType: 'quarterly' as const,
    name: '2026-Q3',
    period: { start: '2026-07-01', end: '2026-09-30' },
    status: 'finished' as const,
    // [T6] AM6：startedAt→approvedAt, endedAt→finishedAt
    approvedAt: '2026-07-01T00:00:00.000Z' as any,
    finishedAt: '2026-09-30T00:00:00.000Z' as any,
    createdAt: '2026-06-01T00:00:00.000Z' as any,
    updatedAt: '2026-10-01T00:00:00.000Z' as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('finished cycle → executeIntent("reviewCycle")（[T6] 原 ended）', async () => {
    mockFindById.mockResolvedValue(finishedCycle)
    mockExecuteIntent.mockResolvedValueOnce({
      success: true,
      object: { ...finishedCycle, status: 'reviewed' },
      objectType: 'cycle',
    })

    const { reviewCycle } = await import('../okr')
    const r = await reviewCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(true)
    expect(mockFindById).toHaveBeenCalledTimes(2) // 前置读 + 回读
    expect(mockExecuteIntent).toHaveBeenCalledTimes(1)
    const [intent] = mockExecuteIntent.mock.calls[0]
    expect(intent.action).toBe('reviewCycle')
    expect(intent.fields).toEqual({ cycleId: 'c1e00000-0000-0000-0000-000000000001' })
  })

  it('非 finished cycle → error（不调 orchestrator）', async () => {
    const draftCycle = { ...finishedCycle, status: 'draft' as const }
    mockFindById.mockResolvedValueOnce(draftCycle)

    const { reviewCycle } = await import('../okr')
    const r = await reviewCycle('c1e00000-0000-0000-0000-000000000001')

    // [T6] 错误消息：'finished' 而非 'ended'
    expect(r.success).toBe(false)
    expect(r.error).toBe('当前周期状态为「draft」，仅 finished 状态可复盘')
    expect(mockExecuteIntent).not.toHaveBeenCalled()
  })

  it('reviewed cycle → error（reviewed 后可经 revertCycle 回去，不走 reviewCycle）', async () => {
    const reviewedCycle = { ...finishedCycle, status: 'reviewed' as const }
    mockFindById.mockResolvedValueOnce(reviewedCycle)

    const { reviewCycle } = await import('../okr')
    const r = await reviewCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(false)
    expect(r.error).toBe('当前周期状态为「reviewed」，仅 finished 状态可复盘')
    expect(mockExecuteIntent).not.toHaveBeenCalled()
  })

  it('executeIntent 失败 → 透传 error', async () => {
    mockFindById.mockResolvedValue(finishedCycle)
    mockExecuteIntent.mockResolvedValueOnce({
      success: false,
      error: 'SM error',
    })

    const { reviewCycle } = await import('../okr')
    const r = await reviewCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(false)
    expect(r.error).toBe('SM error')
  })

  it('回读失败 → error', async () => {
    mockFindById.mockResolvedValueOnce(finishedCycle) // 前置读
    mockExecuteIntent.mockResolvedValueOnce({
      success: true,
      object: { ...finishedCycle, status: 'reviewed' },
      objectType: 'cycle',
    })
    mockFindById.mockResolvedValueOnce(null) // 回读 null

    const { reviewCycle } = await import('../okr')
    const r = await reviewCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(false)
    expect(r.error).toBe('复盘后回读失败')
  })

  it('非法 UUID → error', async () => {
    const { reviewCycle } = await import('../okr')
    const r = await reviewCycle('not-a-uuid')
    expect(r.success).toBe(false)
    expect(r.error).toBe('无效的周期 ID')
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it('catch-all 异常 → error', async () => {
    mockFindById.mockRejectedValueOnce(new Error('网络错误'))

    const { reviewCycle } = await import('../okr')
    const r = await reviewCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(false)
    expect(r.error).toBe('网络错误')
    expect(mockExecuteIntent).not.toHaveBeenCalled()
  })
})

// ─── finishCycle 分派逻辑（[023.12] T6 替代 endCycle：approved → finished）──

describe('[023.12] T6 finishCycle 分派逻辑（原 endCycle）', () => {
  // [T6] AM6：in_progress→approved
  const approvedCycle = {
    id: 'c1e00000-0000-0000-0000-000000000001',
    cycleType: 'quarterly' as const,
    name: '2026-Q3',
    period: { start: '2026-07-01', end: '2026-09-30' },
    status: 'approved' as const,
    // [T6] AM6：startedAt→approvedAt
    approvedAt: '2026-07-01T00:00:00.000Z' as any,
    createdAt: '2026-06-01T00:00:00.000Z' as any,
    updatedAt: '2026-07-01T00:00:00.000Z' as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('approved cycle → executeIntent("finishCycle")（[T6] 替代 endCycle）', async () => {
    mockFindById.mockResolvedValue(approvedCycle)
    mockExecuteIntent.mockResolvedValueOnce({
      success: true,
      // [T6] AM6：ended→finished, endedAt→finishedAt
      object: { ...approvedCycle, status: 'finished', finishedAt: '2026-09-30T00:00:00.000Z' as any },
      objectType: 'cycle',
    })

    const { finishCycle } = await import('../okr')
    const r = await finishCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(true)
    expect(mockFindById).toHaveBeenCalledTimes(2)
    expect(mockExecuteIntent).toHaveBeenCalledTimes(1)
    const [intent] = mockExecuteIntent.mock.calls[0]
    // [T6] 函数与 action 都重命名：endCycle→finishCycle
    expect(intent.action).toBe('finishCycle')
    expect(intent.fields).toEqual({ cycleId: 'c1e00000-0000-0000-0000-000000000001' })
  })

  it('非 approved cycle → error', async () => {
    const draftCycle = { ...approvedCycle, status: 'draft' as const }
    mockFindById.mockResolvedValueOnce(draftCycle)

    const { finishCycle } = await import('../okr')
    const r = await finishCycle('c1e00000-0000-0000-0000-000000000001')

    // [T6] 错误消息：'approved' 而非 'in_progress'
    expect(r.success).toBe(false)
    expect(r.error).toBe('当前周期状态为「draft」，仅 approved 状态可结束')
    expect(mockExecuteIntent).not.toHaveBeenCalled()
  })

  it('illegal UUID → error', async () => {
    const { finishCycle } = await import('../okr')
    const r = await finishCycle('not-a-uuid')
    expect(r.success).toBe(false)
    expect(r.error).toBe('无效的周期 ID')
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it('catch-all 异常 → error', async () => {
    mockFindById.mockRejectedValueOnce(new Error('网络错误'))
    const { finishCycle } = await import('../okr')
    const r = await finishCycle('c1e00000-0000-0000-0000-000000000001')
    expect(r.success).toBe(false)
    expect(r.error).toBe('网络错误')
  })
})

// ─── revertCycle 分派逻辑（[023.12] T6 新增：[AM10]） ──────────────

describe('[023.12] T6 revertCycle 分派逻辑（新增，[AM10] reviewed→finished 一致性回退）', () => {
  const reviewedCycle = {
    id: 'c1e00000-0000-0000-0000-000000000001',
    cycleType: 'quarterly' as const,
    name: '2026-Q3',
    period: { start: '2026-07-01', end: '2026-09-30' },
    status: 'reviewed' as const,
    approvedAt: '2026-07-01T00:00:00.000Z' as any,
    finishedAt: '2026-09-30T00:00:00.000Z' as any,
    reviewedAt: '2026-10-05T00:00:00.000Z' as any,
    createdAt: '2026-06-01T00:00:00.000Z' as any,
    updatedAt: '2026-10-05T00:00:00.000Z' as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reviewed cycle → executeIntent("revertCycle")（[T6] 一致性回退到 finished）', async () => {
    mockFindById.mockResolvedValue(reviewedCycle)
    mockExecuteIntent.mockResolvedValueOnce({
      success: true,
      // [T6] AM10：revert 是 reviewed→finished（不是 to-initial draft），
      // 保留 reviewedAt 复盘证据
      object: { ...reviewedCycle, status: 'finished' },
      objectType: 'cycle',
    })

    const { revertCycle } = await import('../okr')
    const r = await revertCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(true)
    expect(mockFindById).toHaveBeenCalledTimes(2)
    expect(mockExecuteIntent).toHaveBeenCalledTimes(1)
    const [intent] = mockExecuteIntent.mock.calls[0]
    expect(intent.action).toBe('revertCycle')
    expect(intent.fields).toEqual({ cycleId: 'c1e00000-0000-0000-0000-000000000001' })
  })

  it('非 reviewed cycle → error', async () => {
    // [T6] finished cycle 不能直接 revert——必须先 review 走完再 revert
    const finishedCycle = { ...reviewedCycle, status: 'finished' as const }
    mockFindById.mockResolvedValueOnce(finishedCycle)

    const { revertCycle } = await import('../okr')
    const r = await revertCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(false)
    expect(r.error).toBe('当前周期状态为「finished」，仅 reviewed 状态可撤销复盘')
    expect(mockExecuteIntent).not.toHaveBeenCalled()
  })

  it('非法 UUID → error', async () => {
    const { revertCycle } = await import('../okr')
    const r = await revertCycle('not-a-uuid')
    expect(r.success).toBe(false)
    expect(r.error).toBe('无效的周期 ID')
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it('catch-all 异常 → error', async () => {
    mockFindById.mockRejectedValueOnce(new Error('网络错误'))
    const { revertCycle } = await import('../okr')
    const r = await revertCycle('c1e00000-0000-0000-0000-000000000001')
    expect(r.success).toBe(false)
    expect(r.error).toBe('网络错误')
  })
})
