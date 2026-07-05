import { createClient, resolveModel } from '@/lib/llm/config'
import type { ChatMessage, TokenUsage, AITaskType } from '../../types'

export interface LLMCallRequest {
  model: string
  messages: ChatMessage[]
  systemPrompt: string
  maxTokens?: number
  temperature?: number
  structuredOutput?: unknown
  // [023.08] T1 F7 fix: 透传 taskType 让 provider 按任务类型分支（mock 必用，其他 provider 忽略）
  taskType?: AITaskType
}

export interface LLMCallResponse {
  content: string | Record<string, unknown>
  tokenUsage: TokenUsage
  model: string
}

export async function callWithOpenAI(
  providerId: string,
  request: LLMCallRequest,
): Promise<LLMCallResponse> {
  const client = createClient(providerId)
  const model = request.model || resolveModel('default', providerId)

  const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: request.systemPrompt },
    ...request.messages,
  ]

  const response = await client.chat.completions.create({
    model,
    messages: openaiMessages,
    temperature: request.temperature ?? 0.7,
    max_tokens: request.maxTokens ?? 4096,
  })

  const choice = response.choices[0]
  const rawContent = choice?.message?.content ?? ''
  const usage = response.usage

  let content: string | Record<string, unknown> = rawContent
  // Try parsing JSON from markdown code blocks or raw JSON
  const jsonMatch = rawContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) ||
    rawContent.match(/^(\{[\s\S]*\}|\[[\s\S]*\])$/)
  if (jsonMatch) {
    try {
      content = JSON.parse(jsonMatch[1])
    } catch {
      // Keep raw string if parse fails
    }
  }

  return {
    content,
    tokenUsage: {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
    model: response.model,
  }
}
