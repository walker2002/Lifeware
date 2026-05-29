import type { AIGenerateRequest, AIGenerateResponse, AITaskType } from './types'
import { AIRuntimeError } from './types'
import { createLLMGateway, type LLMGateway } from './llm-gateway'
import { createTokenBudgetManager, type TokenBudgetManager } from './token-budget'
import { createResponseCache, type ResponseCache } from './cache'

export interface AIRuntime {
  generate(request: AIGenerateRequest): Promise<AIGenerateResponse>
  stream(request: AIGenerateRequest): AsyncGenerator<string>

  readonly gateway: LLMGateway
  readonly budget: TokenBudgetManager
  readonly cache: ResponseCache
}

const DEFAULT_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export function createAIRuntime(): AIRuntime {
  const gateway = createLLMGateway()
  const budget = createTokenBudgetManager()
  const cache = createResponseCache()

  return {
    gateway,
    budget,
    cache,

    async generate(request: AIGenerateRequest): Promise<AIGenerateResponse> {
      const cacheKey = cache.generateKey(request)

      const cached = cache.get(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }

      // Route through LLMGateway
      const response = await gateway.call({
        taskType: request.taskType,
        messages: request.messages,
        systemPrompt: request.systemPrompt,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        structuredOutput: request.structuredOutput,
      })

      // Record token usage
      budget.record(response.tokenUsage, {
        taskType: request.taskType,
        model: response.model,
        domainId: request.domainId,
        action: request.action,
      })

      // Create AIGenerateResponse for return
      const aiResponse: AIGenerateResponse = {
        content: response.content,
        tokenUsage: response.tokenUsage,
        model: response.model,
        cached: false,
      }

      // Cache the response
      cache.set(cacheKey, aiResponse, DEFAULT_CACHE_TTL)

      return aiResponse
    },

    async *stream(request: AIGenerateRequest): AsyncGenerator<string> {
      // Stream always goes through gateway without caching
      const response = await gateway.call({
        taskType: request.taskType,
        messages: request.messages,
        systemPrompt: request.systemPrompt,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      })

      // For now, yield the complete content as a single chunk
      // True streaming will be implemented per-provider later
      const content = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content)
      yield content

      // Record token usage
      budget.record(response.tokenUsage, {
        taskType: request.taskType,
        model: response.model,
        domainId: request.domainId,
        action: request.action,
      })
    },
  }
}
