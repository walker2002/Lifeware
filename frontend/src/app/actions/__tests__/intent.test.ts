// parseHabitIntentOnly Server Action — 单元测试
import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock AI 依赖
vi.mock('@/nexus/core/intent-engine/ai-parser', () => ({
  parseHabitWithAI: vi.fn(),
}))

vi.mock('@/nexus/ai-runtime', () => ({
  createAIRuntime: vi.fn(() => ({})),
}))

import { parseHabitIntentOnly, getActionResponse } from '../intent'
import { parseHabitWithAI } from '@/nexus/core/intent-engine/ai-parser'

const mockParseHabitWithAI = vi.mocked(parseHabitWithAI)

describe('parseHabitIntentOnly', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('解析成功时返回 action 和 fields', async () => {
    mockParseHabitWithAI.mockResolvedValueOnce({
      success: true,
      intent: {
        id: 'test-intent-id',
        intentionId: 'test-intention-id',
        targetDomain: 'habits',
        action: 'createHabit',
        fields: {
          title: '读书',
          defaultTime: '22:00',
          defaultDuration: 30,
        },
        confidence: 0.9,
        resolvedBy: 'ai',
        createdAt: new Date().toISOString(),
      },
    })

    const result = await parseHabitIntentOnly('每天晚上10点读书半小时')

    expect(result.success).toBe(true)
    expect(result.action).toBe('createHabit')
    expect(result.fields?.title).toBe('读书')
    expect(result.fields?.defaultTime).toBe('22:00')
    expect(result.fields?.defaultDuration).toBe(30)
  })

  it('AI 解析失败时返回错误', async () => {
    mockParseHabitWithAI.mockResolvedValueOnce({
      success: false,
      error: '无法识别意图',
    })

    const result = await parseHabitIntentOnly('这不是习惯相关的内容')

    expect(result.success).toBe(false)
    expect(result.error).toBe('无法识别意图')
  })

  it('AI 抛出异常时返回错误', async () => {
    mockParseHabitWithAI.mockRejectedValueOnce(new Error('网络超时'))

    const result = await parseHabitIntentOnly('测试输入')

    expect(result.success).toBe(false)
    expect(result.error).toBe('网络超时')
  })

  it('非 Error 异常时返回默认消息', async () => {
    mockParseHabitWithAI.mockRejectedValueOnce('unknown')

    const result = await parseHabitIntentOnly('测试输入')

    expect(result.success).toBe(false)
    expect(result.error).toBe('解析失败')
  })
})

// [023-01] Task 7 smoke test（codex Point 5）：
//   getActionResponse 收紧返回类型为 'cnui' | 'page' | 'text' | 'unimplemented'
//   后，调用方 use-intent-handler.ts 必须能拿到精确的 'page' 字面量以做 narrowing。
//   端到端验证 getActionResponse → manifest-utils.getResponseType 链路不断。
describe('getActionResponse（[023-01] type narrowing smoke）', () => {
  it('viewSchedule 返回 page（依赖 Task 1 显式声明 + Task 6 manifest-utils SSOT）', async () => {
    const result = await getActionResponse('timebox', 'viewSchedule')
    expect(result.responseType).toBe('page')
  })

  it('createTimebox 返回 cnui（manifest 显式声明 cnui_surface）', async () => {
    const result = await getActionResponse('timebox', 'createTimebox')
    expect(result.responseType).toBe('cnui')
  })

  it('未声明 action 返回 unimplemented（manifest-utils fallback）', async () => {
    const result = await getActionResponse('timebox', 'nonExistent')
    expect(result.responseType).toBe('unimplemented')
  })
})
