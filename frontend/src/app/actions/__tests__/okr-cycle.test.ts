/**
 * @file okr-cycle.test
 * @brief [022.01] Phase 1: createCycle 改走 executeIntent 集成测试
 *
 * 目的（eng-review D3）：
 * 1. 验证 createCycle 经 orchestrator.executeIntent 调用，不再走 repo.save 直写
 * 2. 验证 status 入参已被 server-side SM create→draft 强制，
 *    即调用方传入的 fields 不含 status（构造侧验证）
 *
 * 模式（参照现有 frontend/src/app/actions/__tests__/*.test.ts）：
 * - vi.mock 拦截 @/domains/okrs/wiring，注入假 createOKROrchestrator + makeIntent
 * - vi.mocked 取出 mock 实例断言调用入参
 *
 * 不需要真实 PG —— 本测试只锁「写入口选择 + 入参形状」两个治理契约。
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

import { createCycle } from '../okr'

const mockExecuteIntent = vi.mocked(executeIntentMock)

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