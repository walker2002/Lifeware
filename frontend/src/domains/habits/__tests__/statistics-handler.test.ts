import { describe, it, expect, vi } from 'vitest'
import { HabitStatisticsHandler } from '../handlers/statistics-handler'

function makeAIRuntime(response: string) {
  return {
    generate: vi.fn().mockResolvedValue({ content: response, cached: false }),
    stream: vi.fn(),
    gateway: {},
    budget: { record: vi.fn() },
    cache: {},
  }
}

describe('HabitStatisticsHandler', () => {
  it('throws on handle()', async () => {
    const handler = new HabitStatisticsHandler()
    await expect(handler.handle({} as any)).rejects.toThrow(/does not support handle/)
  })

  it('throws on onGenerate()', async () => {
    const handler = new HabitStatisticsHandler()
    await expect(handler.onGenerate!({} as any, {} as any)).rejects.toThrow(/does not support onGenerate/)
  })

  it('onQuery calls AI Runtime and returns text result', async () => {
    const handler = new HabitStatisticsHandler()
    const ai = makeAIRuntime('习惯分析报告：晨跑连续5天...')

    const result = await handler.onQuery!(
      {
        intent: {
          id: 'i1',
          intentionId: 'ii1',
          targetDomain: 'habits',
          action: 'habit_statistics',
          fields: { question: '分析我的习惯' },
          confidence: 1.0,
          resolvedBy: 'ai',
          pathType: 'query',
          createdAt: '2026-05-24T00:00:00Z',
        },
        contexts: {
          habitLogs: [{ habitId: 'h1', date: '2026-05-24', completed: true }],
          habitStreaks: [{
            habitId: 'h1',
            title: '晨跑',
            currentStreak: 5,
            longestStreak: 10,
            completionRate7d: 0.8,
          }],
        },
        sessionId: 's1',
      },
      ai as any,
    )

    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.content).toBe('习惯分析报告：晨跑连续5天...')
    }
    expect(ai.generate).toHaveBeenCalledWith(expect.objectContaining({
      domainId: 'habits',
      action: 'habit_statistics',
      taskType: 'content_generation',
    }))
  })

  it('includes session context info when priorQueries exist', async () => {
    const handler = new HabitStatisticsHandler()
    const ai = makeAIRuntime('分析报告')

    await handler.onQuery!(
      {
        intent: {
          id: 'i1',
          intentionId: 'ii1',
          targetDomain: 'habits',
          action: 'habit_statistics',
          fields: {},
          confidence: 1.0,
          resolvedBy: 'ai',
          pathType: 'query',
          createdAt: '2026-05-24T00:00:00Z',
        },
        contexts: {
          habitLogs: [],
          habitStreaks: [],
        },
        sessionContext: {
          priorQueries: [{
            action: 'list_active_habits',
            resultSummary: { count: 3, objectIds: [], keyMetrics: {} },
            timestamp: new Date().toISOString(),
            relevance: 1.0,
          }],
        },
      },
      ai as any,
    )

    const callArgs = ai.generate.mock.calls[0][0]
    expect(callArgs.systemPrompt).toContain('上下文')
  })
})
