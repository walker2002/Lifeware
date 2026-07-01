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

  it('应正确解析含空格标题的多任务（全角分号分隔）', async () => {
    const { parseMultiTask } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime({
      generate: {
        content: { tasks: [
          { title: 'OKR 季度计划', startTime: '2026-07-01T10:30:00+08:00', duration: 120, confidence: 0.92 },
          { title: '带孩子出去玩', startTime: '2026-07-01T16:00:00+08:00', duration: 120, confidence: 0.9 },
        ] },
      },
    })
    const result = await parseMultiTask('上午10:30-12:30 OKR 季度计划；下午16:00-18:00 带孩子出去玩', 'intention-456', aiRuntime)
    expect(result.success).toBe(true)
    expect(result.intents).toHaveLength(2)
    expect(result.intents[0].fields.title).toBe('OKR 季度计划')
    expect(result.intents[1].fields.title).toBe('带孩子出去玩')
  })

  // [023-01+] 模糊时间默认值回归（问题2）：
  //   之前 LLM 收到"上午完成OKR计划"返回 startTime=null/incomplete，
  //   parseMultiTask line 419 过滤掉 → 报"任务标题必填"
  //   强化 prompt 后：LLM 给出默认 09:00 + 120 分钟
  it('应解析模糊时间"上午"为默认 09:00-11:00 + 标题含空格', async () => {
    const { parseMultiTask } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime({
      generate: {
        content: { tasks: [
          { title: '完成OKR计划', startTime: '2026-07-01T09:00:00+08:00', duration: 120, confidence: 0.85 },
        ] },
      },
    })
    const result = await parseMultiTask('上午完成OKR计划', 'intention-789', aiRuntime)
    expect(result.success).toBe(true)
    expect(result.intents).toHaveLength(1)
    expect(result.intents[0].fields.title).toBe('完成OKR计划')
    expect(result.intents[0].fields.startTime).toBe('2026-07-01T09:00:00+08:00')
    expect(result.intents[0].fields.duration).toBe(120)
    // endTime 由 parseMultiTask 内部按 UTC 计算（line 423: new Date + setMinutes + toISOString）
    expect(result.intents[0].fields.endTime).toBe('2026-07-01T03:00:00.000Z')
  })

  // [023-01+] 显式时间区间 + 标题含空格（问题3 真实场景）
  it('应解析"10:30-12:30 完成OKR计划"为单条任务，title 含空格', async () => {
    const { parseMultiTask } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime({
      generate: {
        content: { tasks: [
          { title: '完成OKR计划', startTime: '2026-07-01T10:30:00+08:00', duration: 120, confidence: 0.92 },
        ] },
      },
    })
    const result = await parseMultiTask('10:30-12:30 完成OKR计划', 'intention-790', aiRuntime)
    expect(result.success).toBe(true)
    expect(result.intents).toHaveLength(1)
    expect(result.intents[0].fields.title).toBe('完成OKR计划')
  })

  // [023-01+ v2] RC-2：显式区间场景，LLM 给了 startTime+endTime 但没给 duration
  //   之前：filter `!task.duration` → 丢弃 → intents 空 → "所有子任务信息不完整"
  //   修复：缺 duration 时从 (endTime - startTime) 反推
  it('LLM 返回 startTime+endTime 但无 duration → 反推 duration，不丢弃', async () => {
    const { parseMultiTask } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime({
      generate: {
        content: { tasks: [
          // 显式区间 21:00-23:00 = 120 分钟，但 LLM 没回 duration
          { title: '外出看电影', startTime: '2026-07-01T21:00:00+08:00', endTime: '2026-07-01T23:00:00+08:00', confidence: 0.9 },
        ] },
      },
    })
    const result = await parseMultiTask('晚上 21:00-23:00 外出看电影', 'intention-791', aiRuntime)
    expect(result.success).toBe(true)
    expect(result.intents).toHaveLength(1)
    expect(result.intents[0].fields.title).toBe('外出看电影')
    // 反推 duration = 120 分钟
    expect(result.intents[0].fields.duration).toBe(120)
  })

  // [023-01+] prompt 内容断言：模糊时间默认值已写入 MULTI_TASK_PROMPT
  //   防止未来 prompt 改动无意间丢失规则
  it('MULTI_TASK_PROMPT 应包含模糊时间默认值规则', async () => {
    const { parseMultiTask } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime()
    await parseMultiTask('test input', 'intention-000', aiRuntime)
    const callArg = (aiRuntime.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArg.systemPrompt).toContain('"上午"')
    expect(callArg.systemPrompt).toContain('"下午"')
    expect(callArg.systemPrompt).toContain('"晚上"')
    expect(callArg.systemPrompt).toContain('duration = 120')
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
