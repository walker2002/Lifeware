import { describe, it, expect, vi, beforeEach } from 'vitest'

// [023.08] T1: 检测是否 dev-mock 模式（默认 / env 未设 → mock）
const isDevMockProvider = !process.env.LIFEWARE_LLM_PROVIDER ||
  !['openai', 'anthropic', 'dashscope', 'deepseek', 'zhipu', 'ollama'].includes(process.env.LIFEWARE_LLM_PROVIDER)

// ── T006: 默认路由配置 ──

describe('LLM Gateway Config', () => {
  it('should export DEFAULT_ROUTING with all 5 task types', async () => {
    const { DEFAULT_ROUTING } = await import('../llm-gateway/config')
    const taskTypes = ['intent_routing', 'field_extraction', 'content_generation', 'summary', 'cn_ui_revision'] as const
    for (const tt of taskTypes) {
      expect(DEFAULT_ROUTING[tt]).toBeDefined()
      expect(DEFAULT_ROUTING[tt].provider).toBeTruthy()
      expect(DEFAULT_ROUTING[tt].model).toBeTruthy()
    }
  })

  it.skipIf(isDevMockProvider)('should have fallback for critical task types', async () => {
    const { DEFAULT_ROUTING } = await import('../llm-gateway/config')
    // intent_routing and field_extraction should have fallback (only in real provider mode)
    expect(DEFAULT_ROUTING.intent_routing.fallback).toBeDefined()
    expect(DEFAULT_ROUTING.field_extraction.fallback).toBeDefined()
  })
})

// ── T007: OpenAI Compatible Provider Adapter ──

describe('OpenAI Compatible Provider', () => {
  it('should export a call function that wraps OpenAI SDK', async () => {
    const mod = await import('../llm-gateway/providers/openai-compatible')
    expect(typeof mod.callWithOpenAI).toBe('function')
  })
})

// ── T008: Anthropic Provider Adapter ──

describe('Anthropic Provider', () => {
  it('should export a call function using Vercel AI SDK', async () => {
    const mod = await import('../llm-gateway/providers/anthropic')
    expect(typeof mod.callWithAnthropic).toBe('function')
  })
})

// ── T009: Ollama Provider Adapter ──

describe('Ollama Provider', () => {
  it('should export a call function using OpenAI compatible interface', async () => {
    const mod = await import('../llm-gateway/providers/ollama')
    expect(typeof mod.callWithOllama).toBe('function')
  })
})

// ── T010: LLMGateway ──

describe('LLMGateway', () => {
  it('should route task types to correct providers', async () => {
    const { createLLMGateway } = await import('../llm-gateway')
    const gateway = createLLMGateway()
    const route = gateway.route('intent_routing')
    expect(route).toBeDefined()
    expect(route.provider).toBeTruthy()
    expect(route.model).toBeTruthy()
  })

  it.skipIf(isDevMockProvider)('should return fallback route info', async () => {
    const { createLLMGateway } = await import('../llm-gateway')
    const gateway = createLLMGateway()
    const route = gateway.route('intent_routing')
    expect(route.fallback).toBeDefined()
    expect(route.fallback!.provider).toBeTruthy()
  })
})

// ── T011: createAIRuntime ──

describe('createAIRuntime', () => {
  it('should return an AIRuntime instance with all sub-modules', async () => {
    const { createAIRuntime } = await import('../index')
    const runtime = createAIRuntime()
    expect(runtime).toBeDefined()
    expect(typeof runtime.generate).toBe('function')
    expect(typeof runtime.stream).toBe('function')
    expect(runtime.budget).toBeDefined()
    expect(runtime.cache).toBeDefined()
    expect(runtime.gateway).toBeDefined()
  })

  it.skipIf(isDevMockProvider)('generate should route through LLMGateway', async () => {
    const { createAIRuntime } = await import('../index')
    const runtime = createAIRuntime()
    const request = {
      domainId: 'test',
      action: 'test',
      systemPrompt: 'test',
      messages: [{ role: 'user' as const, content: 'hello' }],
      taskType: 'intent_routing' as const,
    }
    // generate() should exist and be callable (will fail at network level without API key)
    expect(typeof runtime.generate).toBe('function')
    const result = runtime.generate(request)
    expect(result).toBeInstanceOf(Promise)
    // Expect it to reject with AIRuntimeError (no API key configured in test env)
    await expect(result).rejects.toThrow()
  })
})
