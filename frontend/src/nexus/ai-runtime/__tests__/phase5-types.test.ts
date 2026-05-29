// Phase 5 类型扩展测试：T024, T025, T026, T026b
import { describe, it, expect } from 'vitest'
import type {
  GenerationRequest,
  DomainHandler,
  GenerationResult,
} from '@/usom/types/process'
import type { AIGenerateResponse } from '@/nexus/ai-runtime/types'

// ─── T026b: GenerationRequest 扩展字段 ────────────────────────

describe('GenerationRequest 扩展 (T026b)', () => {
  it('原有字段仍正常工作（向后兼容）', () => {
    const request: GenerationRequest = {
      intent: {
        id: '1',
        intentionId: 'i1',
        targetDomain: 'timebox',
        action: 'createSmartSchedule',
        fields: {},
        confidence: 0.9,
        resolvedBy: 'ai',
        createdAt: new Date().toISOString(),
      },
      contexts: { existing: 'data' },
    }

    expect(request.intent.targetDomain).toBe('timebox')
    expect(request.contexts).toEqual({ existing: 'data' })
  })

  it('可选 Session 字段可赋值', () => {
    const request: GenerationRequest = {
      intent: {
        id: '1',
        intentionId: 'i1',
        targetDomain: 'timebox',
        action: 'createSmartSchedule',
        fields: {},
        confidence: 0.9,
        resolvedBy: 'ai',
        createdAt: new Date().toISOString(),
      },
      contexts: {},
      sessionId: 'session-001',
      sessionHistory: [
        { role: 'user', content: '安排今天的计划' },
        { role: 'assistant', content: '好的，让我帮你安排' },
      ],
    }

    expect(request.sessionId).toBe('session-001')
    expect(request.sessionHistory).toHaveLength(2)
  })

  it('可选修订字段可赋值', () => {
    const request: GenerationRequest = {
      intent: {
        id: '1',
        intentionId: 'i1',
        targetDomain: 'timebox',
        action: 'createSmartSchedule',
        fields: {},
        confidence: 0.9,
        resolvedBy: 'ai',
        createdAt: new Date().toISOString(),
      },
      contexts: {},
      reviseTarget: 'proposal-001',
      previousProposals: [
        { id: 'p1', action: 'create_timebox', payload: {}, sourceType: 'adhoc', priority: 'high' },
      ],
    }

    expect(request.reviseTarget).toBe('proposal-001')
    expect(request.previousProposals).toHaveLength(1)
  })

  it('所有新字段同时存在时类型正确', () => {
    const request: GenerationRequest = {
      intent: {
        id: '1', intentionId: 'i1', targetDomain: 'timebox',
        action: 'createSmartSchedule', fields: {},
        confidence: 0.9, resolvedBy: 'ai', createdAt: new Date().toISOString(),
      },
      contexts: {},
      sessionId: 's1',
      sessionHistory: [],
      reviseTarget: 'p1',
      previousProposals: [],
      tokenBudget: { totalTokens: 1000, remainingTokens: 500 },
    }

    expect(request.sessionId).toBeDefined()
    expect(request.tokenBudget).toBeDefined()
  })
})

// ─── T026: DomainHandler 可选 onGenerate ─────────────────────

describe('DomainHandler onGenerate (T026)', () => {
  it('传统 handle() 仍可调用（向后兼容）', async () => {
    const handler: DomainHandler = {
      async handle(request) {
        return {
          proposalSet: { id: '1', proposals: [] },
        }
      },
    }

    const result = await handler.handle({
      intent: {
        id: '1', intentionId: 'i1', targetDomain: 'timebox',
        action: 'test', fields: {}, confidence: 0.9,
        resolvedBy: 'ai', createdAt: new Date().toISOString(),
      },
      contexts: {},
    })

    expect(result.proposalSet.id).toBe('1')
  })

  it('onGenerate 可选方法存在时不影响类型', () => {
    const handler: DomainHandler = {
      async handle(request) {
        return { proposalSet: { id: '1', proposals: [] } }
      },
      async onGenerate(request, aiRuntime) {
        return { proposalSet: { id: '2', proposals: [] } }
      },
    }

    expect(typeof handler.onGenerate).toBe('function')
    expect(typeof handler.handle).toBe('function')
  })

  it('无 onGenerate 仍为合法 DomainHandler', () => {
    const handler: DomainHandler = {
      async handle() {
        return { proposalSet: { id: '1', proposals: [] } }
      },
    }

    // TypeScript 编译通过即证明可选
    expect(handler.onGenerate).toBeUndefined()
  })
})

// ─── T024: Memory Framework 接口 ─────────────────────────────

describe('Memory Framework 接口 (T024)', () => {
  it('MemoryFramework 接口持有 l1 实例', async () => {
    // 动态导入验证编译通过
    const { createMemoryFramework } = await import('../memory/index')
    const memory = createMemoryFramework()

    expect(memory.l1).toBeDefined()
    expect(typeof memory.l1.appendMessage).toBe('function')
    expect(typeof memory.l1.getMessages).toBe('function')
  })
})

// ─── T025: AISessionManager 状态机 ────────────────────────────

describe('AISessionManager (T025)', () => {
  it('create() 创建 session 状态为 created', async () => {
    const { createAISessionManager } = await import('../session/index')
    const manager = createAISessionManager()

    const session = await manager.create({
      domainId: 'timebox',
      action: 'createSmartSchedule',
      userId: 'user-001',
    })

    expect(session.status).toBe('created')
    expect(session.id).toBeTruthy()
  })

  it('状态转换 created → active → completing → archived', async () => {
    const { createAISessionManager } = await import('../session/index')
    const manager = createAISessionManager()

    const session = await manager.create({
      domainId: 'timebox',
      action: 'createSmartSchedule',
      userId: 'user-001',
    })

    // created → active (追加首条消息)
    const active = await manager.activate(session.id)
    expect(active.status).toBe('active')

    // active → completing
    const completing = await manager.startCompleting(session.id)
    expect(completing.status).toBe('completing')

    // completing → archived
    const archived = await manager.archive(session.id)
    expect(archived.status).toBe('archived')
  })

  it('created → closed (取消)', async () => {
    const { createAISessionManager } = await import('../session/index')
    const manager = createAISessionManager()

    const session = await manager.create({
      domainId: 'timebox',
      action: 'createSmartSchedule',
      userId: 'user-001',
    })

    const closed = await manager.close(session.id)
    expect(closed.status).toBe('closed')
  })

  it('不合法状态转换抛出错误', async () => {
    const { createAISessionManager } = await import('../session/index')
    const manager = createAISessionManager()

    const session = await manager.create({
      domainId: 'timebox',
      action: 'createSmartSchedule',
      userId: 'user-001',
    })

    // created 状态不能直接 archive
    await expect(manager.archive(session.id)).rejects.toThrow()
  })
})
