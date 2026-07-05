import type { AITaskType } from '../types'

export interface ProviderRoute {
  provider: string
  model: string
  fallback?: { provider: string; model: string }
}

export type RoutingTable = Record<AITaskType, ProviderRoute>

// [023.08] T1 [F2 fix]: 显式 provider enum
// mock | openai | anthropic | dashscope | deepseek | zhipu | ollama
// 未设置 env 默认 mock;设置成非真 provider 名 (allowlist 之外) 也默认 mock
const EXPLICIT_PROVIDER = process.env.LIFEWARE_LLM_PROVIDER ?? 'mock'
const REAL_PROVIDERS = new Set(['openai', 'anthropic', 'dashscope', 'deepseek', 'zhipu', 'ollama'])
const isDevMock = !REAL_PROVIDERS.has(EXPLICIT_PROVIDER)

export const DEFAULT_ROUTING: RoutingTable = {
  intent_routing: isDevMock
    ? { provider: 'mock', model: 'mock-v1' }
    : { provider: 'dashscope', model: 'deepseek-v4-flash', fallback: { provider: 'deepseek', model: 'deepseek-v4-flash' } },
  field_extraction: isDevMock
    ? { provider: 'mock', model: 'mock-v1' }
    : { provider: 'dashscope', model: 'deepseek-v4-flash', fallback: { provider: 'deepseek', model: 'deepseek-v4-flash' } },
  content_generation: isDevMock
    ? { provider: 'mock', model: 'mock-v1' }
    : { provider: 'dashscope', model: 'glm-5.1', fallback: { provider: 'zhipu', model: 'glm-5.1' } },
  summary: isDevMock
    ? { provider: 'mock', model: 'mock-v1' }
    : { provider: 'dashscope', model: 'glm-5.1', fallback: { provider: 'zhipu', model: 'glm-5.1' } },
  cn_ui_revision: isDevMock
    ? { provider: 'mock', model: 'mock-v1' }
    : { provider: 'dashscope', model: 'glm-5.1', fallback: { provider: 'zhipu', model: 'glm-5.1' } },
}