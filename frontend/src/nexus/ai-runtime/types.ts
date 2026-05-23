import { z } from 'zod'

// ── AITaskType ──

export type AITaskType =
  | 'intent_routing'
  | 'field_extraction'
  | 'content_generation'
  | 'summary'
  | 'cn_ui_revision'

// ── Chat Message ──

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ── Token Usage ──

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

// ── Request / Response ──

export interface AIGenerateRequest {
  domainId: string
  action: string
  sessionId?: string
  systemPrompt: string
  messages: ChatMessage[]
  taskType: AITaskType
  maxTokens?: number
  temperature?: number
  structuredOutput?: z.ZodSchema
  stream?: boolean
}

export interface AIGenerateResponse {
  content: string | Record<string, unknown>
  tokenUsage: TokenUsage
  model: string
  cached: boolean
  sessionId?: string
}

// ── Errors ──

export type AIRuntimeErrorCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'TIMEOUT'

export class AIRuntimeError extends Error {
  constructor(
    message: string,
    public readonly code: AIRuntimeErrorCode,
    public readonly provider?: string,
    public readonly retryable: boolean = false,
  ) {
    super(message)
    this.name = 'AIRuntimeError'
  }
}

export class CNUISchemaError extends AIRuntimeError {
  constructor(
    message: string,
    public readonly schemaErrors: z.ZodError,
  ) {
    super(message, 'SCHEMA_VALIDATION_FAILED')
    this.name = 'CNUISchemaError'
  }
}
