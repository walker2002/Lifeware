// AI Parser 单元测试
// 使用 vi.mock 模拟 LLM 客户端调用

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseWithAI } from '../ai-parser'
import { chat } from '@/lib/llm/client'
import type OpenAI from 'openai'

// 模拟 LLM 客户端
vi.mock('@/lib/llm/client', () => ({
  chat: vi.fn(),
}))

const mockChat = vi.mocked(chat)

// ─── 辅助函数：构造 LLM 返回内容 ───────────────────────────────

function makeLLMResponse(content: string): OpenAI.ChatCompletion {
  return {
    choices: [
      {
        message: { content, role: 'assistant', refusal: null },
        finish_reason: 'stop',
        index: 0,
        logprobs: null,
      },
    ],
    id: 'test-id',
    model: 'test-model',
    object: 'chat.completion',
    created: Date.now(),
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

// ─── 测试用例 ──────────────────────────────────────────────────

describe('parseWithAI', () => {
  const intentionId = 'intention-uuid-001'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('有效输入：解析"我今天10:00开始做市场调研报告，花费2小时"', async () => {
    // 模拟 LLM 返回结构化 JSON
    mockChat.mockResolvedValueOnce(
      makeLLMResponse(
        JSON.stringify({
          targetDomain: 'timebox',
          action: 'create_timebox',
          fields: {
            title: '市场调研报告',
            startTime: '2026-05-03T10:00:00+08:00',
            duration: 120,
          },
          confidence: 0.95,
        }),
      ),
    )

    const result = await parseWithAI(
      '我今天10:00开始做市场调研报告，花费2小时',
      intentionId,
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
    // id 和 createdAt 应自动生成
    expect(result.intent!.id).toBeTruthy()
    expect(result.intent!.createdAt).toBeTruthy()
  })

  it('低置信度输入：返回错误并建议使用表单模式', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse(
        JSON.stringify({
          targetDomain: 'unknown',
          action: 'unknown',
          fields: {},
          confidence: 0.3,
        }),
      ),
    )

    const result = await parseWithAI('随便说点什么', intentionId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('表单')
    expect(result.intent).toBeUndefined()
  })

  it('无效 JSON 响应：返回解析错误', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse('这不是有效的 JSON 内容'),
    )

    const result = await parseWithAI('测试输入', intentionId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('JSON')
  })

  it('响应缺少必需字段：返回验证错误', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse(
        JSON.stringify({
          targetDomain: 'timebox',
          // 缺少 action
          fields: { title: '测试' },
          confidence: 0.8,
        }),
      ),
    )

    const result = await parseWithAI('创建一个时间盒', intentionId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('action')
  })

  it('非时间盒意图"帮我写代码"：返回低置信度错误', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse(
        JSON.stringify({
          targetDomain: 'code',
          action: 'write_code',
          fields: {},
          confidence: 0.2,
        }),
      ),
    )

    const result = await parseWithAI('帮我写代码', intentionId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('表单')
  })

  it('LLM 返回包含 markdown 代码块的 JSON：能正确提取', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse(
        '```json\n{"targetDomain":"timebox","action":"create_timebox","fields":{"title":"读书","startTime":"2026-05-03T14:00:00+08:00","duration":60},"confidence":0.9}\n```',
      ),
    )

    const result = await parseWithAI(
      '我今天下午2点读书1小时',
      intentionId,
    )

    expect(result.success).toBe(true)
    expect(result.intent!.fields.title).toBe('读书')
    expect(result.intent!.fields.duration).toBe(60)
  })

  it('LLM 调用异常：返回错误信息', async () => {
    mockChat.mockRejectedValueOnce(new Error('API 连接超时'))

    const result = await parseWithAI('测试输入', intentionId)

    expect(result.success).toBe(false)
    expect(result.error).toContain('API')
  })
})
