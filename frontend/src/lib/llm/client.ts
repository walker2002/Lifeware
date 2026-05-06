import type OpenAI from 'openai'
import type { ModelRole } from './config'
import { createClient, resolveModel } from './config'

export interface ChatOptions {
  role?: ModelRole
  model?: string
  provider?: string
  temperature?: number
  maxTokens?: number
}

export async function chat(
  messages: OpenAI.ChatCompletionMessageParam[],
  options?: ChatOptions,
) {
  const provider = options?.provider
  const client = createClient(provider)
  const model = options?.model || resolveModel(options?.role || 'default', provider)

  return client.chat.completions.create({
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens,
  })
}
