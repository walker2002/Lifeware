// Phase 7: Memory L2 摘要测试 (T048-T052)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AIRuntime, AIGenerateResponse } from '../types'

// Mock db module to avoid real DB connection
vi.mock('@/lib/db/index', () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn() })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(() => Promise.resolve([])) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])) })) })),
  },
}))

function createMockAIRuntime(response: Partial<AIGenerateResponse>): AIRuntime {
  const fullResponse: AIGenerateResponse = {
    content: response.content ?? '',
    tokenUsage: response.tokenUsage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    model: response.model ?? 'test',
    cached: false,
    ...response,
  }
  return {
    generate: vi.fn().mockResolvedValue(fullResponse),
    stream: vi.fn(),
    gateway: {} as never,
    budget: { record: vi.fn(), getDailySummary: vi.fn() },
    cache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn(), clear: vi.fn(), generateKey: vi.fn() },
  } as unknown as AIRuntime
}

// ─── T050: Memory L2 Episode Layer ────────────────────────────

describe('Memory L2 Episode Layer (T050)', () => {
  it('generateSummary 调用 AIRuntime 生成摘要', async () => {
    const { createMemoryL2 } = await import('../memory/layers/l2-episode')
    const l2 = createMemoryL2()
    const aiRuntime = createMockAIRuntime({ content: '用户创建了3个时间盒的智能编排方案' })

    const result = await l2.generateSummary({
      userId: 'user-001',
      sessionId: 'session-001',
      domainId: 'timebox',
      action: 'createSmartTimeboxes',
      messages: [
        { role: 'user', content: '帮我安排今天的计划' },
        { role: 'assistant', content: '好的，已为您安排3个时间盒' },
      ],
    }, aiRuntime)

    expect(result.summary).toBe('用户创建了3个时间盒的智能编排方案')
    expect(result.metadata.messageCount).toBe(2)
    expect(aiRuntime.generate).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'summary' }),
    )
  })

  it('AI 返回空时使用默认摘要', async () => {
    const { createMemoryL2 } = await import('../memory/layers/l2-episode')
    const l2 = createMemoryL2()
    const aiRuntime = createMockAIRuntime({ content: '' })

    const result = await l2.generateSummary({
      userId: 'user-001',
      sessionId: 'session-001',
      domainId: 'timebox',
      action: 'createSmartTimeboxes',
      messages: [],
    }, aiRuntime)

    expect(result.summary).toContain('timebox')
  })

  it('generateTitle 模式返回 suggestedTitle', async () => {
    const { createMemoryL2 } = await import('../memory/layers/l2-episode')
    const l2 = createMemoryL2()
    const aiRuntime = createMockAIRuntime({
      content: JSON.stringify({ summary: '用户安排了今日计划', suggestedTitle: '今日计划安排' }),
    })

    const result = await l2.generateSummary({
      userId: 'user-001',
      sessionId: 'session-001',
      domainId: 'timebox',
      action: 'createSmartTimeboxes',
      messages: [
        { role: 'user', content: '帮我安排今天的计划' },
        { role: 'assistant', content: '已安排3个时间盒' },
      ],
      generateTitle: true,
    }, aiRuntime)

    expect(result.summary).toBe('用户安排了今日计划')
    expect(result.suggestedTitle).toBe('今日计划安排')
  })
})

// ─── T051: Memory Framework L2 集成 ───────────────────────────

describe('Memory Framework L2 集成 (T051)', () => {
  beforeEach(() => {
    // Reset singleton between tests
    vi.resetModules()
  })

  it('createMemoryFramework() 同时持有 l1 和 l2', async () => {
    const { createMemoryFramework } = await import('../memory/index')
    const memory = createMemoryFramework()

    expect(memory.l1).toBeDefined()
    expect(memory.l2).toBeDefined()
    expect(typeof memory.l1.appendMessage).toBe('function')
    expect(typeof memory.l1.getMessages).toBe('function')
    expect(typeof memory.l2.generateSummary).toBe('function')
  })
})

// ─── T052: Memory L1 消息持久化 ──────────────────────────────────

describe('Memory L1 消息持久化 (T052)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('appendMessage 和 getMessages 通过 DB Repository 工作', async () => {
    const { createMemoryFramework } = await import('../memory/index')
    const memory = createMemoryFramework()

    // appendMessage 调用 db.insert
    await memory.l1.appendMessage('session-001', 'user-001', {
      role: 'user',
      content: '安排今天的计划',
    })

    const { db } = await import('@/lib/db/index')
    expect(db.insert).toHaveBeenCalled()
  })
})
