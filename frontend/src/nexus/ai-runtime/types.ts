/**
 * @file types
 * @brief AI 运行时类型定义
 */

import { z } from 'zod'

// ─── AI 任务类型 ──────────────────────────────────────────────

/** AI 任务类型枚举 */
export type AITaskType =
  | 'intent_routing'
  | 'field_extraction'
  | 'content_generation'
  | 'summary'
  | 'cn_ui_revision'

// ─── 聊天消息 ─────────────────────────────────────────────────

/** 聊天消息 */
export interface ChatMessage {
  /** 角色 */
  role: 'system' | 'user' | 'assistant'
  /** 消息内容 */
  content: string
}

// ─── Token 使用量 ─────────────────────────────────────────────

/** Token 使用量统计 */
export interface TokenUsage {
  /** 输入 Token 数 */
  promptTokens: number
  /** 输出 Token 数 */
  completionTokens: number
  /** 总 Token 数 */
  totalTokens: number
}

// ─── 请求与响应 ───────────────────────────────────────────────

/** AI 生成请求 */
export interface AIGenerateRequest {
  /** 领域 ID */
  domainId: string
  /** 动作名称 */
  action: string
  /** 会话 ID（可选） */
  sessionId?: string
  /** 系统提示词 */
  systemPrompt: string
  /** 消息列表 */
  messages: ChatMessage[]
  /** 任务类型 */
  taskType: AITaskType
  /** 最大 Token 数 */
  maxTokens?: number
  /** 温度参数 */
  temperature?: number
  /** 结构化输出 Schema */
  structuredOutput?: z.ZodSchema
  /** 是否流式输出 */
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
