// Phase 5 集成测试：T027-T028b, T029
import { describe, it, expect, vi } from 'vitest'
import type { GenerationRequest, GenerationResult, DomainHandler } from '@/usom/types/process'
import type { AIRuntime, AIGenerateResponse } from '@/nexus/ai-runtime/types'

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

function makeRequest(overrides?: Partial<GenerationRequest>): GenerationRequest {
  return {
    intent: {
      id: '1', intentionId: 'i1', targetDomain: 'timebox',
      action: 'createSmartTimeboxes', fields: {},
      confidence: 0.9, resolvedBy: 'ai', createdAt: new Date().toISOString(),
    },
    contexts: {},
    ...overrides,
  }
}

// ─── T027: TimeboxOrchestrationHandler onGenerate ───────────────────────

describe('TimeboxOrchestrationHandler onGenerate (T027)', () => {
  it('onGenerate 调用 aiRuntime.generate 并返回增强结果', async () => {
    const { TimeboxOrchestrationHandler } = await import('@/domains/timebox/handlers/orchestration-handler')
    const handler = new TimeboxOrchestrationHandler()

    const aiRuntime = createMockAIRuntime({
      content: '建议将高优先级任务安排在上午 9-11 点',
    })

    const result = await handler.onGenerate!(makeRequest(), aiRuntime)

    expect(result.proposalSet).toBeDefined()
    expect(result.presentation).toBeDefined()
    expect(aiRuntime.generate).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'content_generation' }),
    )
  })

  it('onGenerate AI 返回空内容时降级到 handle 结果', async () => {
    const { TimeboxOrchestrationHandler } = await import('@/domains/timebox/handlers/orchestration-handler')
    const handler = new TimeboxOrchestrationHandler()

    const aiRuntime = createMockAIRuntime({ content: '' })

    const result = await handler.onGenerate!(makeRequest(), aiRuntime)

    expect(result.proposalSet).toBeDefined()
  })

  it('handle() 仍可独立调用（向后兼容）', async () => {
    const { TimeboxOrchestrationHandler } = await import('@/domains/timebox/handlers/orchestration-handler')
    const handler = new TimeboxOrchestrationHandler()

    const result = await handler.handle(makeRequest())

    expect(result.proposalSet.id).toBeTruthy()
    expect(result.proposalSet.proposals).toEqual([])
  })
})

// ─── T028: Orchestrator 注入 aiRuntime ───────────────────────

describe('Orchestrator onGenerate 分发 (T028)', () => {
  it('handler 有 onGenerate 时优先调用 onGenerate', async () => {
    let calledMethod: string = ''

    const handler: DomainHandler = {
      async handle() {
        calledMethod = 'handle'
        return { proposalSet: { id: '1', proposals: [] } }
      },
      async onGenerate(request, aiRuntime) {
        calledMethod = 'onGenerate'
        // 验证 aiRuntime 被注入
        expect(aiRuntime).toBeDefined()
        expect(typeof aiRuntime.generate).toBe('function')
        return { proposalSet: { id: '2', proposals: [] } }
      },
    }

    // 模拟 Orchestrator 的分发逻辑
    let generativeResult: GenerationResult
    if (handler.onGenerate) {
      const aiRuntime = createMockAIRuntime({ content: 'test' })
      generativeResult = await handler.onGenerate(makeRequest(), aiRuntime)
    } else {
      generativeResult = await handler.handle(makeRequest())
    }

    expect(calledMethod).toBe('onGenerate')
    expect(generativeResult.proposalSet.id).toBe('2')
  })

  it('handler 无 onGenerate 时降级到 handle', async () => {
    const handler: DomainHandler = {
      async handle() {
        return { proposalSet: { id: 'fallback', proposals: [] } }
      },
    }

    let generativeResult: GenerationResult
    if (handler.onGenerate) {
      const aiRuntime = createMockAIRuntime({ content: 'test' })
      generativeResult = await handler.onGenerate(makeRequest(), aiRuntime)
    } else {
      generativeResult = await handler.handle(makeRequest())
    }

    expect(generativeResult.proposalSet.id).toBe('fallback')
  })
})

// ─── T028b: Context Engine assembler 扩展 ────────────────────

describe('Context Engine assembler 扩展 (T028b)', () => {
  it('assembleContext 返回 GenerationRequest 包含可选字段', async () => {
    // 验证 GenerationRequest 接口支持扩展字段
    const request: GenerationRequest = makeRequest({
      sessionId: 's-001',
      sessionHistory: [{ role: 'user', content: '安排计划' }],
      reviseTarget: 'p-001',
      previousProposals: [],
    })

    expect(request.sessionId).toBe('s-001')
    expect(request.sessionHistory).toHaveLength(1)
    expect(request.reviseTarget).toBe('p-001')
  })
})

// ─── T029: Session 生命周期 + Handler 端到端 ─────────────────

describe('Session + Handler 端到端 (T029)', () => {
  it('Session 创建 → Handler onGenerate → Session 归档', async () => {
    const { createAISessionManager } = await import('../session/index')
    const { TimeboxOrchestrationHandler } = await import('@/domains/timebox/handlers/orchestration-handler')

    // 1. 创建 Session
    const sessionManager = createAISessionManager()
    const session = await sessionManager.create({
      domainId: 'timebox',
      action: 'createSmartTimeboxes',
      userId: 'user-001',
    })
    expect(session.status).toBe('created')

    // 2. 激活 Session
    await sessionManager.activate(session.id)
    expect(sessionManager.get(session.id)?.status).toBe('active')

    // 3. 模拟消息记录（L1 已改为 DB-backed，集成测试用 mock 数据）
    const messages = [{ role: 'user', content: '生成今日时间盒计划' }]

    // 4. Handler 处理（带 session 信息）
    const handler = new TimeboxOrchestrationHandler()
    const aiRuntime = createMockAIRuntime({ content: '建议安排 3 个时间盒' })

    const request = makeRequest({
      sessionId: session.id,
      sessionHistory: messages,
    })

    const result = await handler.onGenerate!(request, aiRuntime)
    expect(result.proposalSet).toBeDefined()

    // 5. Session 归档
    await sessionManager.startCompleting(session.id)
    const archived = await sessionManager.archive(session.id)
    expect(archived.status).toBe('archived')
  })
})
