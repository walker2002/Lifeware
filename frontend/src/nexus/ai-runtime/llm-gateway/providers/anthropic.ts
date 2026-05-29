import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import type { ChatMessage, TokenUsage } from '../../types'
import type { LLMCallRequest, LLMCallResponse } from './openai-compatible'

export async function callWithAnthropic(
  request: LLMCallRequest,
): Promise<LLMCallResponse> {
  const model = anthropic(request.model)

  const result = await generateText({
    model,
    system: request.systemPrompt,
    messages: request.messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    temperature: request.temperature,
  })

  return {
    content: result.text,
    tokenUsage: {
      promptTokens: (result.usage as any)?.promptTokens ?? 0,
      completionTokens: (result.usage as any)?.completionTokens ?? 0,
      totalTokens: ((result.usage as any)?.promptTokens ?? 0) + ((result.usage as any)?.completionTokens ?? 0),
    },
    model: request.model,
  }
}
