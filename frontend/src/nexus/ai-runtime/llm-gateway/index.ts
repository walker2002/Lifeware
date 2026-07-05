import type { AITaskType, ChatMessage } from '../types'
import { AIRuntimeError } from '../types'
import { DEFAULT_ROUTING, type ProviderRoute } from './config'
import { callWithOpenAI, type LLMCallRequest, type LLMCallResponse } from './providers/openai-compatible'
import { callWithAnthropic } from './providers/anthropic'
import { callWithOllama } from './providers/ollama'
// [023.08] T1: 加 mock 分支 — dev 默认，不依赖外部 API
import { callWithMock } from './providers/mock'

export interface LLMGateway {
  route(taskType: AITaskType): ProviderRoute
  call(request: LLMGatewayRequest): Promise<LLMCallResponse>
}

export interface LLMGatewayRequest {
  taskType: AITaskType
  model?: string
  messages: ChatMessage[]
  systemPrompt: string
  maxTokens?: number
  temperature?: number
  structuredOutput?: unknown
}

const ANTHROPIC_PROVIDERS = new Set(['anthropic'])
const OLLAMA_PROVIDERS = new Set(['ollama'])
const MOCK_PROVIDERS = new Set(['mock'])

function selectProvider(providerId: string): (req: LLMCallRequest) => Promise<LLMCallResponse> {
  if (MOCK_PROVIDERS.has(providerId)) {
    return callWithMock
  }
  if (ANTHROPIC_PROVIDERS.has(providerId)) {
    return callWithAnthropic
  }
  if (OLLAMA_PROVIDERS.has(providerId)) {
    return callWithOllama
  }
  // Default: OpenAI-compatible (dashscope, deepseek, zhipu, openai)
  return (req) => callWithOpenAI(providerId, req)
}

export function createLLMGateway(): LLMGateway {
  return {
    route(taskType: AITaskType): ProviderRoute {
      const route = DEFAULT_ROUTING[taskType]
      if (!route) {
        throw new AIRuntimeError(
          `No route configured for taskType: ${taskType}`,
          'PROVIDER_UNAVAILABLE',
        )
      }
      return route
    },

    async call(request: LLMGatewayRequest): Promise<LLMCallResponse> {
      const route = this.route(request.taskType)

      const llmRequest: LLMCallRequest = {
        model: request.model || route.model,
        messages: request.messages,
        systemPrompt: request.systemPrompt,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        structuredOutput: request.structuredOutput,
        // [023.08] T1 [F7 fix]: 透传 taskType 让 mock 按任务类型分支
        taskType: request.taskType,
      }

      try {
        const caller = selectProvider(route.provider)
        return await caller(llmRequest)
      } catch (err) {
        // Try fallback if available
        if (route.fallback) {
          try {
            const fallbackCaller = selectProvider(route.fallback.provider)
            return await fallbackCaller({
              ...llmRequest,
              model: route.fallback.model,
            })
          } catch {
            // Fallback also failed
          }
        }

        if (err instanceof AIRuntimeError) throw err
        throw new AIRuntimeError(
          err instanceof Error ? err.message : 'LLM call failed',
          'PROVIDER_UNAVAILABLE',
          route.provider,
          true,
        )
      }
    },
  }
}
