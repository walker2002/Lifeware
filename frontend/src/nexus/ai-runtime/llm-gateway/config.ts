import type { AITaskType } from '../types'

export interface ProviderRoute {
  provider: string
  model: string
  fallback?: { provider: string; model: string }
}

export type RoutingTable = Record<AITaskType, ProviderRoute>

export const DEFAULT_ROUTING: RoutingTable = {
  intent_routing: {
    provider: 'dashscope',
    model: 'deepseek-v4-flash',
    fallback: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  },
  field_extraction: {
    provider: 'dashscope',
    model: 'deepseek-v4-flash',
    fallback: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  },
  content_generation: {
    provider: 'dashscope',
    model: 'glm-5.1',
    fallback: { provider: 'zhipu', model: 'glm-5.1' },
  },
  summary: {
    provider: 'dashscope',
    model: 'glm-5.1',
    fallback: { provider: 'zhipu', model: 'glm-5.1' },
  },
  cn_ui_revision: {
    provider: 'dashscope',
    model: 'glm-5.1',
    fallback: { provider: 'zhipu', model: 'glm-5.1' },
  },
}
