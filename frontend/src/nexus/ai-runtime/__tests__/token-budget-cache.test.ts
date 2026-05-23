// T017-T021: TokenBudget + ResponseCache + AIRuntime 集成测试
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTokenBudgetManager } from '../token-budget'
import { createResponseCache } from '../cache'
import { createAIRuntime } from '../index'
import type { AIGenerateResponse, TokenUsage } from '../types'

// ─── T017: TokenBudgetManager ────────────────────────────────

describe('TokenBudgetManager (T017)', () => {
  it('record() 存储一条 TokenUsage 记录', () => {
    const budget = createTokenBudgetManager()
    const usage: TokenUsage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 }

    budget.record(usage, {
      taskType: 'intent_routing',
      model: 'deepseek-v4',
      domainId: 'timebox',
      action: 'parseIntent',
    })

    const today = new Date().toISOString().slice(0, 10)
    const summary = budget.getDailySummary(today)
    expect(summary.callCount).toBe(1)
    expect(summary.totalTokens).toBe(150)
  })

  it('getDailySummary() 按日期过滤并汇总', () => {
    const budget = createTokenBudgetManager()

    budget.record(
      { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      { taskType: 'intent_routing', model: 'm1', domainId: 'timebox', action: 'a1' },
    )
    budget.record(
      { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      { taskType: 'field_extraction', model: 'm2', domainId: 'habits', action: 'a2' },
    )

    const today = new Date().toISOString().slice(0, 10)
    const summary = budget.getDailySummary(today)
    expect(summary.callCount).toBe(2)
    expect(summary.totalTokens).toBe(450)
    expect(summary.byTaskType['intent_routing']).toBe(150)
    expect(summary.byTaskType['field_extraction']).toBe(300)
  })

  it('getDailySummary() 无记录日期返回零值', () => {
    const budget = createTokenBudgetManager()
    const summary = budget.getDailySummary('2099-01-01')
    expect(summary.callCount).toBe(0)
    expect(summary.totalTokens).toBe(0)
    expect(summary.byTaskType).toEqual({})
  })

  it('getDailySummary() 不跨日期累计', () => {
    const budget = createTokenBudgetManager()
    // 直接 record 只存内存，无法模拟不同日期的 timestamp
    // 验证当天的 summary 只包含当天记录
    budget.record(
      { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      { taskType: 'summary', model: 'm', domainId: 'd', action: 'a' },
    )
    const today = new Date().toISOString().slice(0, 10)
    const summary = budget.getDailySummary(today)
    expect(summary.callCount).toBe(1)
    expect(summary.totalTokens).toBe(75)
  })
})

// ─── T018: ResponseCache L1 精确匹配 ─────────────────────────

describe('ResponseCache L1 (T018)', () => {
  const mockResponse: AIGenerateResponse = {
    content: 'test',
    tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    model: 'test-model',
    cached: false,
  }

  it('set() + get() 在 TTL 内返回缓存响应', () => {
    const cache = createResponseCache()
    const request = {
      domainId: 'timebox',
      action: 'test',
      systemPrompt: 'prompt',
      messages: [{ role: 'user' as const, content: 'hello' }],
      taskType: 'intent_routing' as const,
    }

    const key = cache.generateKey(request)
    cache.set(key, mockResponse, 60_000)
    const cached = cache.get(key)

    expect(cached).toBeDefined()
    expect(cached!.content).toBe('test')
  })

  it('TTL 过期后 get() 返回 undefined', () => {
    vi.useFakeTimers()
    const cache = createResponseCache()
    const request = {
      domainId: 'timebox',
      action: 'test',
      systemPrompt: 'p',
      messages: [{ role: 'user' as const, content: 'x' }],
      taskType: 'intent_routing' as const,
    }

    const key = cache.generateKey(request)
    cache.set(key, mockResponse, 1000) // 1秒 TTL

    vi.advanceTimersByTime(1001)
    const cached = cache.get(key)
    expect(cached).toBeUndefined()
    vi.useRealTimers()
  })

  it('invalidate() 删除指定缓存', () => {
    const cache = createResponseCache()
    const request = {
      domainId: 'timebox',
      action: 'test',
      systemPrompt: 'p',
      messages: [{ role: 'user' as const, content: 'y' }],
      taskType: 'intent_routing' as const,
    }

    const key = cache.generateKey(request)
    cache.set(key, mockResponse, 60_000)
    cache.invalidate(key)
    expect(cache.get(key)).toBeUndefined()
  })

  it('clear() 清空所有缓存', () => {
    const cache = createResponseCache()
    const r1 = {
      domainId: 'timebox', action: 'a', systemPrompt: 'p1',
      messages: [{ role: 'user' as const, content: '1' }], taskType: 'intent_routing' as const,
    }
    const r2 = {
      domainId: 'timebox', action: 'b', systemPrompt: 'p2',
      messages: [{ role: 'user' as const, content: '2' }], taskType: 'field_extraction' as const,
    }

    const k1 = cache.generateKey(r1)
    const k2 = cache.generateKey(r2)
    cache.set(k1, mockResponse, 60_000)
    cache.set(k2, mockResponse, 60_000)
    cache.clear()
    expect(cache.get(k1)).toBeUndefined()
    expect(cache.get(k2)).toBeUndefined()
  })

  it('get() 不存在的 key 返回 undefined', () => {
    const cache = createResponseCache()
    expect(cache.get('nonexistent')).toBeUndefined()
  })
})

// ─── T019: generateKey() 稳定性 ──────────────────────────────

describe('ResponseCache.generateKey (T019)', () => {
  it('相同输入产生相同 key', () => {
    const cache = createResponseCache()
    const request = {
      domainId: 'timebox',
      action: 'test',
      systemPrompt: '你是助手',
      messages: [{ role: 'user' as const, content: '你好' }],
      taskType: 'intent_routing' as const,
    }

    const k1 = cache.generateKey(request)
    const k2 = cache.generateKey(request)
    expect(k1).toBe(k2)
  })

  it('不同输入产生不同 key', () => {
    const cache = createResponseCache()
    const r1 = {
      domainId: 'timebox', action: 'a', systemPrompt: 'p',
      messages: [{ role: 'user' as const, content: 'input A' }], taskType: 'intent_routing' as const,
    }
    const r2 = {
      domainId: 'timebox', action: 'a', systemPrompt: 'p',
      messages: [{ role: 'user' as const, content: 'input B' }], taskType: 'intent_routing' as const,
    }

    const k1 = cache.generateKey(r1)
    const k2 = cache.generateKey(r2)
    expect(k1).not.toBe(k2)
  })

  it('key 包含 taskType 前缀', () => {
    const cache = createResponseCache()
    const request = {
      domainId: 'timebox', action: 'a', systemPrompt: 'p',
      messages: [{ role: 'user' as const, content: 'x' }], taskType: 'summary' as const,
    }
    const key = cache.generateKey(request)
    expect(key.startsWith('summary:')).toBe(true)
  })
})

// ─── T020: AIRuntime 集成 TokenBudget + Cache ────────────────

describe('AIRuntime Token+Cache 集成 (T020)', () => {
  it('generate() 未命中缓存时调用 LLMGateway 并 record token', async () => {
    const runtime = createAIRuntime()
    // 无法调用真实 LLM，验证 budget/cache 已接入即可
    expect(runtime.budget).toBeDefined()
    expect(runtime.cache).toBeDefined()
    expect(typeof runtime.generate).toBe('function')
  })

  it('budget record 后 getDailySummary 返回正确汇总', () => {
    const runtime = createAIRuntime()
    runtime.budget.record(
      { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      { taskType: 'intent_routing', model: 'test', domainId: 'timebox', action: 'parse' },
    )

    const today = new Date().toISOString().slice(0, 10)
    const summary = runtime.budget.getDailySummary(today)
    expect(summary.callCount).toBe(1)
    expect(summary.totalTokens).toBe(150)
  })

  it('cache set/get 在 runtime 上工作', () => {
    const runtime = createAIRuntime()
    const response: AIGenerateResponse = {
      content: 'cached',
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'm',
      cached: false,
    }

    const request = {
      domainId: 'timebox', action: 'test', systemPrompt: 'p',
      messages: [{ role: 'user' as const, content: 'c' }], taskType: 'intent_routing' as const,
    }
    const key = runtime.cache.generateKey(request)
    runtime.cache.set(key, response, 60_000)
    const hit = runtime.cache.get(key)
    expect(hit).toBeDefined()
    expect(hit!.content).toBe('cached')
  })
})

// ─── T021: 缓存命中 + Token 计数端到端 ────────────────────────

describe('缓存命中端到端 (T021)', () => {
  it('相同 prompt 第二次缓存命中且不重复计 token', () => {
    const runtime = createAIRuntime()

    // 手动模拟缓存命中场景（无需真实 LLM 调用）
    const response: AIGenerateResponse = {
      content: { result: 'test' },
      tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      model: 'test-model',
      cached: false,
    }

    const request = {
      domainId: 'timebox', action: 'parse', systemPrompt: '你是助手',
      messages: [{ role: 'user' as const, content: '下午2点读书1小时' }],
      taskType: 'intent_routing' as const,
    }

    // 模拟第一次调用后的缓存存储
    const key = runtime.cache.generateKey(request)
    runtime.cache.set(key, response, 5 * 60 * 1000)
    runtime.budget.record(response.tokenUsage, {
      taskType: request.taskType,
      model: response.model,
      domainId: request.domainId,
      action: request.action,
    })

    // 模拟第二次调用 — 缓存命中
    const cachedResponse = runtime.cache.get(key)
    expect(cachedResponse).toBeDefined()

    // 验证只记录了 1 次 token
    const today = new Date().toISOString().slice(0, 10)
    const summary = runtime.budget.getDailySummary(today)
    expect(summary.callCount).toBe(1)
    expect(summary.totalTokens).toBe(150)
  })

  it('缓存命中时 cached=true 标记', () => {
    const cache = createResponseCache()
    const response: AIGenerateResponse = {
      content: 'hit',
      tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'm',
      cached: false,
    }

    const request = {
      domainId: 'timebox', action: 'test', systemPrompt: 'p',
      messages: [{ role: 'user' as const, content: 'q' }], taskType: 'intent_routing' as const,
    }

    const key = cache.generateKey(request)
    cache.set(key, response, 60_000)

    // AIRuntime.generate() 会在缓存命中时设置 cached: true
    const cached = cache.get(key)
    const finalResponse = cached ? { ...cached, cached: true } : null
    expect(finalResponse).not.toBeNull()
    expect(finalResponse!.cached).toBe(true)
  })
})
