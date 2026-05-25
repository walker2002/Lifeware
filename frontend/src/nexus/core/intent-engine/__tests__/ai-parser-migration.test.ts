import { describe, it, expect, vi } from 'vitest'
import type { AIRuntime, AIGenerateResponse } from '@/nexus/ai-runtime'

// ── Mock AIRuntime factory ──

function createMockAIRuntime(overrides?: {
  generate?: Partial<AIGenerateResponse>
}): AIRuntime {
  const defaultResponse: AIGenerateResponse = {
    content: {
      targetDomain: 'timebox',
      action: 'create_timebox',
      fields: {
        title: '深度工作',
        startTime: '2026-05-23T14:00:00+08:00',
        duration: 120,
      },
      confidence: 0.9,
    },
    tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    model: 'test-model',
    cached: false,
  }

  const response = overrides?.generate
    ? { ...defaultResponse, ...overrides.generate }
    : defaultResponse

  return {
    generate: vi.fn().mockResolvedValue(response),
    stream: vi.fn(),
    gateway: {} as never,
    budget: {
      record: vi.fn(),
      getDailySummary: vi.fn(),
    },
    cache: {
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
      invalidate: vi.fn(),
      clear: vi.fn(),
      generateKey: vi.fn().mockReturnValue('test-key'),
    },
  } as unknown as AIRuntime
}

// ── T012: parseWithAI migration ──

describe('parseWithAI (migrated to AIRuntime)', () => {
  it('should call aiRuntime.generate with intent_routing taskType', async () => {
    const { parseWithAI } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime()

    await parseWithAI('今天下午2点到5点安排深度工作', 'intention-123', aiRuntime)

    expect(aiRuntime.generate).toHaveBeenCalledOnce()
    const callArg = (aiRuntime.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArg.taskType).toBe('intent_routing')
    expect(callArg.systemPrompt).toContain('Lifeware 意图解析器')
    expect(callArg.domainId).toBe('system')
  })

  it('should parse structured object response', async () => {
    const { parseWithAI } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime()

    const result = await parseWithAI('安排深度工作', 'intention-123', aiRuntime)

    expect(result.success).toBe(true)
    expect(result.intent!.targetDomain).toBe('timebox')
    expect(result.intent!.action).toBe('create_timebox')
    expect(result.intent!.confidence).toBe(0.9)
  })

  it('should compute endTime from startTime + duration', async () => {
    const { parseWithAI } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime()

    const result = await parseWithAI('安排深度工作', 'intention-123', aiRuntime)

    expect(result.intent!.fields.endTime).toBeDefined()
  })

  it('should handle string content with raw JSON', async () => {
    const { parseWithAI } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime({
      generate: {
        content: '{"targetDomain":"timebox","action":"create_timebox","fields":{"title":"阅读","startTime":"2026-05-23T10:00:00+08:00","duration":60},"confidence":0.85}',
      },
    })

    const result = await parseWithAI('阅读1小时', 'intention-456', aiRuntime)

    expect(result.success).toBe(true)
    expect(result.intent!.fields.title).toBe('阅读')
  })

  it('should handle JSON in markdown code block', async () => {
    const { parseWithAI } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime({
      generate: {
        content: '```json\n{"targetDomain":"timebox","action":"create_timebox","fields":{"title":"跑步","startTime":"2026-05-23T07:00:00+08:00","duration":30},"confidence":0.8}\n```',
      },
    })

    const result = await parseWithAI('跑步', 'intention-789', aiRuntime)

    expect(result.success).toBe(true)
    expect(result.intent!.fields.title).toBe('跑步')
  })

  it('should return error when confidence < 0.5', async () => {
    const { parseWithAI } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime({
      generate: {
        content: { targetDomain: 'timebox', action: 'create_timebox', fields: { title: 'test' }, confidence: 0.3 },
      },
    })

    const result = await parseWithAI('随便说', 'intention-000', aiRuntime)

    expect(result.success).toBe(false)
    expect(result.error).toContain('置信度过低')
  })
})

// ── T013: parseMultiTask migration ──

describe('parseMultiTask (migrated to AIRuntime)', () => {
  it('should call aiRuntime.generate with field_extraction taskType', async () => {
    const { parseMultiTask } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime({
      generate: {
        content: {
          tasks: [
            { title: '深度工作', startTime: '2026-05-23T09:00:00+08:00', duration: 120, confidence: 0.9 },
          ],
        },
      },
    })

    await parseMultiTask('上午9点深度工作2小时', 'intention-123', aiRuntime)

    const callArg = (aiRuntime.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArg.taskType).toBe('field_extraction')
  })

  it('should parse multiple tasks', async () => {
    const { parseMultiTask } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime({
      generate: {
        content: {
          tasks: [
            { title: '深度工作', startTime: '2026-05-23T09:00:00+08:00', duration: 120, confidence: 0.9 },
            { title: '午休', startTime: '2026-05-23T12:00:00+08:00', duration: 60, confidence: 0.85 },
          ],
        },
      },
    })

    const result = await parseMultiTask('9点深度工作，12点午休', 'intention-123', aiRuntime)

    expect(result.success).toBe(true)
    expect(result.intents).toHaveLength(2)
  })
})

// ── T014: parseHabitWithAI migration ──

describe('parseHabitWithAI (migrated to AIRuntime)', () => {
  it('should call aiRuntime.generate with field_extraction taskType', async () => {
    const { parseHabitWithAI } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime({
      generate: {
        content: {
          targetDomain: 'habits',
          action: 'createHabit',
          fields: {
            title: '跑步',
            defaultTime: '07:00',
            defaultDuration: 30,
            trackable: true,
            frequencyType: 'daily',
          },
          confidence: 0.9,
        },
      },
    })

    await parseHabitWithAI('每天早上7点跑步30分钟', 'intention-123', aiRuntime)

    const callArg = (aiRuntime.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArg.taskType).toBe('field_extraction')
    expect(callArg.systemPrompt).toContain('习惯意图解析器')
  })

  it('should auto-fill habit defaults for createHabit', async () => {
    const { parseHabitWithAI } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime({
      generate: {
        content: {
          targetDomain: 'habits',
          action: 'createHabit',
          fields: {
            title: '跑步',
            defaultTime: '07:00',
            defaultDuration: 30,
            trackable: true,
            frequencyType: 'daily',
          },
          confidence: 0.9,
        },
      },
    })

    const result = await parseHabitWithAI('每天早上7点跑步30分钟', 'intention-123', aiRuntime)

    expect(result.success).toBe(true)
    expect(result.intent!.targetDomain).toBe('habits')
    expect(result.intent!.fields.earliestTime).toBeDefined()
    expect(result.intent!.fields.startDate).toBeDefined()
  })
})
