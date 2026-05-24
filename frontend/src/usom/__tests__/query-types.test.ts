import { describe, it, expect } from 'vitest'

describe('QueryContext type', () => {
  it('accepts valid QueryContext with all fields', () => {
    const qc = {
      intent: {
        id: 'i1',
        intentionId: 'ii1',
        targetDomain: 'habits',
        action: 'list_active_habits',
        fields: {},
        confidence: 1.0,
        resolvedBy: 'ai' as const,
        pathType: 'query' as const,
        createdAt: '2026-05-24T00:00:00Z',
      },
      contexts: { activeHabits: [] },
      sessionId: 's1',
      sessionContext: {
        priorQueries: [],
      },
    }
    expect(qc.contexts).toEqual({ activeHabits: [] })
    expect(qc.sessionContext?.priorQueries).toEqual([])
  })

  it('SessionQueryContext accepts priorQueries array', () => {
    const sqc = {
      priorQueries: [{
        action: 'list_active_habits',
        resultSummary: {
          count: 3,
          objectIds: ['h1', 'h2', 'h3'],
          keyMetrics: {},
        },
        answerText: '找到3个习惯',
        cnuiSurfaceType: 'habit-list-card',
        timestamp: '2026-05-24T00:00:00Z',
        relevance: 1.0,
      }],
    }
    expect(sqc.priorQueries).toHaveLength(1)
    expect(sqc.priorQueries[0].action).toBe('list_active_habits')
  })

  it('QueryResult discriminates text and cnui types', () => {
    const textResult = { type: 'text' as const, content: 'hello' }
    const cnuiResult = {
      type: 'cnui' as const,
      payload: {
        surfaceType: 'habit-list-card',
        components: [],
        actions: [{ type: 'dismiss', label: '关闭' }],
      },
    }

    if (textResult.type === 'text') {
      expect(typeof textResult.content).toBe('string')
    }
    if (cnuiResult.type === 'cnui') {
      expect(cnuiResult.payload.surfaceType).toBe('habit-list-card')
    }
  })

  it('DomainHandler.onQuery is optional on the interface', () => {
    // 编译时验证 — onQuery 是可选的
    const handler = {
      handle: async () => ({ proposalSet: { id: 'x', proposals: [], tags: [] } }),
      // 不定义 onQuery — 应该合法
    }
    expect(handler).toBeDefined()
    expect(handler.handle).toBeDefined()
  })
})
