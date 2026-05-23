// Phase 7: Memory L2 摘要测试 (T048-T052)
import { describe, it, expect, vi } from 'vitest'
import type { AIRuntime, AIGenerateResponse } from '../types'

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
      action: 'createSmartSchedule',
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
      action: 'createSmartSchedule',
      messages: [],
    }, aiRuntime)

    expect(result.summary).toContain('timebox')
  })
})

// ─── T051: Memory Framework L2 集成 ───────────────────────────

describe('Memory Framework L2 集成 (T051)', () => {
  it('createMemoryFramework() 同时持有 l1 和 l2', async () => {
    const { createMemoryFramework } = await import('../memory/index')
    const memory = createMemoryFramework()

    expect(memory.l1).toBeDefined()
    expect(memory.l2).toBeDefined()
    expect(typeof memory.l2.generateSummary).toBe('function')
  })
})

// ─── T052: Memory 摘要端到端 ──────────────────────────────────

describe('Memory 摘要端到端 (T052)', () => {
  it('Session 交互 → Memory L1 记录 → L2 生成摘要', async () => {
    const { createMemoryFramework } = await import('../memory/index')
    const { createAISessionManager } = await import('../session/index')
    const memory = createMemoryFramework()
    const sessionManager = createAISessionManager()
    const aiRuntime = createMockAIRuntime({ content: '用户请求并确认了今日智能编排方案' })

    // 1. 创建 Session
    const session = await sessionManager.create({
      domainId: 'timebox',
      action: 'createSmartSchedule',
      userId: 'user-001',
    })

    // 2. 激活
    await sessionManager.activate(session.id)

    // 3. 记录消息
    memory.l1.recordMessage(session.id, { role: 'user', content: '安排今天的计划' })
    memory.l1.recordMessage(session.id, { role: 'assistant', content: '已安排3个时间盒' })

    const messages = memory.l1.getMessages(session.id)
    expect(messages).toHaveLength(2)

    // 4. 生成摘要
    const episode = await memory.l2.generateSummary({
      userId: 'user-001',
      sessionId: session.id,
      domainId: 'timebox',
      action: 'createSmartSchedule',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      metadata: { proposalCount: 3 },
    }, aiRuntime)

    expect(episode.summary).toBeTruthy()
    expect(episode.metadata.proposalCount).toBe(3)

    // 5. 归档 Session
    await sessionManager.startCompleting(session.id)
    await sessionManager.archive(session.id)
    memory.l1.onSessionArchive(session.id)

    expect(memory.l1.getMessages(session.id)).toHaveLength(0)
    expect(sessionManager.get(session.id)?.status).toBe('archived')
  })
})
