/**
 * @file mock-provider.test
 * @brief [023.08] T1 mock LLM provider — dev 默认，生成确定性 schedule 模板
 */
import { describe, it, expect } from 'vitest'
import { callWithMock } from '../llm-gateway/providers/mock'

describe('callWithMock', () => {
  it('returns deterministic schedule proposal for intent_routing task', async () => {
    const result = await callWithMock({
      model: 'mock-v1',
      messages: [{ role: 'user', content: 'createSmartTimeboxes 2026-07-05' }],
      systemPrompt: '你是智能时间编排助手',
      maxTokens: 1000,
    })
    expect(result.content).toContain('createTimebox')
    expect(result.model).toBe('mock-v1')
    expect(result.tokenUsage.totalTokens).toBeGreaterThan(0)
  })

  it('returns mock proposal for content_generation with HH:MM format', async () => {
    const result = await callWithMock({
      model: 'mock-v1',
      messages: [{ role: 'user', content: JSON.stringify({
        proposalSet: { proposals: [{ id: 'p1', payload: { startTime: '08:00' } }] }
      }) }],
      systemPrompt: '优化时间分配',
      taskType: 'content_generation',
    })
    expect(result.content).toMatch(/\d{2}:\d{2}/) // HH:MM present
  })

  it('does not throw on empty messages', async () => {
    const result = await callWithMock({
      model: 'mock-v1',
      messages: [],
      systemPrompt: '',
    })
    expect(result.content).toBeDefined()
  })
})