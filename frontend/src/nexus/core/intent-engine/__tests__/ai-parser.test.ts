// AI Parser 单元测试
// 使用 vi.mock 模拟 AIRuntime 调用

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseWithAI } from '../ai-parser'
import type { AIRuntime, AIGenerateResponse } from '@/nexus/ai-runtime'

// ── Mock AIRuntime ──

function createMockAIRuntime(response: Partial<AIGenerateResponse>): AIRuntime {
  const fullResponse: AIGenerateResponse = {
    content: response.content ?? '',
    tokenUsage: response.tokenUsage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    model: response.model ?? 'test-model',
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

// ─── 测试用例 ──────────────────────────────────────────────────

describe('parseWithAI', () => {
  const intentionId = 'intention-uuid-001'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('有效输入：解析"我今天10:00开始做市场调研报告，花费2小时"', async () => {
    const aiRuntime = createMockAIRuntime({
      content: {
        targetDomain: 'timebox',
        action: 'create_timebox',
        fields: {
          title: '市场调研报告',
          startTime: '2026-05-03T10:00:00+08:00',
          duration: 120,
        },
        confidence: 0.95,
      },
    })

    const result = await parseWithAI(
      '我今天10:00开始做市场调研报告，花费2小时',
      intentionId,
      aiRuntime,
    )

    expect(result.success).toBe(true)
    expect(result.intent).toBeDefined()
    expect(result.intent!.targetDomain).toBe('timebox')
    expect(result.intent!.action).toBe('create_timebox')
    expect(result.intent!.fields.title).toBe('市场调研报告')
    expect(result.intent!.fields.duration).toBe(120)
    expect(result.intent!.fields.startTime).toContain('10:00')
    expect(result.intent!.confidence).toBeGreaterThanOrEqual(0.5)
    expect(result.intent!.resolvedBy).toBe('ai')
    expect(result.intent!.intentionId).toBe(intentionId)
    expect(result.intent!.id).toBeTruthy()
    expect(result.intent!.createdAt).toBeTruthy()
  })

  it('低置信度输入：返回错误并建议使用表单模式', async () => {
    const aiRuntime = createMockAIRuntime({
      content: {
        targetDomain: 'unknown',
        action: 'unknown',
        fields: {},
        confidence: 0.3,
      },
    })

    const result = await parseWithAI('随便说点什么', intentionId, aiRuntime)

    expect(result.success).toBe(false)
    expect(result.error).toContain('表单')
    expect(result.intent).toBeUndefined()
  })

  it('无效 JSON 响应（纯字符串）：返回解析错误', async () => {
    const aiRuntime = createMockAIRuntime({
      content: '这不是有效的 JSON 内容',
    })

    const result = await parseWithAI('测试输入', intentionId, aiRuntime)

    expect(result.success).toBe(false)
    expect(result.error).toContain('JSON')
  })

  it('响应缺少必需字段：返回验证错误', async () => {
    const aiRuntime = createMockAIRuntime({
      content: {
        targetDomain: 'timebox',
        // 缺少 action
        fields: { title: '测试' },
        confidence: 0.8,
      },
    })

    const result = await parseWithAI('创建一个时间盒', intentionId, aiRuntime)

    expect(result.success).toBe(false)
    expect(result.error).toContain('action')
  })

  it('非时间盒意图"帮我写代码"：返回低置信度错误', async () => {
    const aiRuntime = createMockAIRuntime({
      content: {
        targetDomain: 'code',
        action: 'write_code',
        fields: {},
        confidence: 0.2,
      },
    })

    const result = await parseWithAI('帮我写代码', intentionId, aiRuntime)

    expect(result.success).toBe(false)
    expect(result.error).toContain('表单')
  })

  it('LLM 返回包含 markdown 代码块的 JSON：能正确提取', async () => {
    const aiRuntime = createMockAIRuntime({
      content: '```json\n{"targetDomain":"timebox","action":"create_timebox","fields":{"title":"读书","startTime":"2026-05-03T14:00:00+08:00","duration":60},"confidence":0.9}\n```',
    })

    const result = await parseWithAI(
      '我今天下午2点读书1小时',
      intentionId,
      aiRuntime,
    )

    expect(result.success).toBe(true)
    expect(result.intent!.fields.title).toBe('读书')
    expect(result.intent!.fields.duration).toBe(60)
  })

  it('LLM 调用异常：返回错误信息', async () => {
    const aiRuntime = {
      generate: vi.fn().mockRejectedValue(new Error('API 连接超时')),
    } as unknown as AIRuntime

    const result = await parseWithAI('测试输入', intentionId, aiRuntime)

    expect(result.success).toBe(false)
    expect(result.error).toContain('API')
  })
})
