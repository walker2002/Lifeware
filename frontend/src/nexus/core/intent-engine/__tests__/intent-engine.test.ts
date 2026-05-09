// Intent Engine entry 单元测试
// TDD: 验证 parse() 委托给 parseWithAI 并返回结果

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse } from '../index'
import { parseWithAI } from '../ai-parser'
import type { AIParserResult } from '../ai-parser'

// 模拟 ai-parser 模块
vi.mock('../ai-parser', () => ({
  parseWithAI: vi.fn(),
}))

const mockParseWithAI = vi.mocked(parseWithAI)

describe('Intent Engine — parse()', () => {
  const rawInput = '我今天10:00开始做市场调研报告，花费2小时'
  const intentionId = 'intention-uuid-001'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parse() 委托给 parseWithAI 并返回成功结果', async () => {
    // Arrange
    const mockResult: AIParserResult = {
      success: true,
      intent: {
        id: 'intent-id',
        intentionId,
        targetDomain: 'timebox',
        action: 'create_timebox',
        fields: {
          title: '市场调研报告',
          startTime: '2026-05-03T10:00:00+08:00',
          duration: 120,
        },
        confidence: 0.95,
        resolvedBy: 'ai',
        createdAt: '2026-05-03T08:00:00Z',
      },
    }
    mockParseWithAI.mockResolvedValueOnce(mockResult)

    // Act
    const result = await parse(rawInput, intentionId)

    // Assert: 返回值与 ai-parser 返回值一致
    expect(result).toEqual(mockResult)

    // Assert: parseWithAI 被正确调用
    expect(mockParseWithAI).toHaveBeenCalledWith(rawInput, intentionId)
  })

  it('parse() 传递正确的 intentionId', async () => {
    // Arrange
    const customIntentionId = 'custom-intention-id-999'
    mockParseWithAI.mockResolvedValueOnce({
      success: false,
      error: '测试错误',
    })

    // Act
    await parse('测试输入', customIntentionId)

    // Assert: intentionId 正确传递
    expect(mockParseWithAI).toHaveBeenCalledWith('测试输入', customIntentionId)
    expect(mockParseWithAI).toHaveBeenCalledTimes(1)
  })

  it('parse() 透传 parseWithAI 的错误结果', async () => {
    // Arrange
    const errorResult: AIParserResult = {
      success: false,
      error: 'AI 置信度过低',
    }
    mockParseWithAI.mockResolvedValueOnce(errorResult)

    // Act
    const result = await parse('低置信度输入', intentionId)

    // Assert
    expect(result.success).toBe(false)
    expect(result.error).toBe('AI 置信度过低')
    expect(result.intent).toBeUndefined()
  })
})
