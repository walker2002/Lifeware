/**
 * @file client
 * @brief LLM 聊天客户端
 * 
 * 提供统一的聊天接口，支持多提供商
 */

import type OpenAI from 'openai'
import type { ModelRole } from './config'
import { createClient, resolveModel } from './config'

/**
 * 聊天选项
 */
export interface ChatOptions {
  /** 模型角色 */
  role?: ModelRole
  /** 指定模型 */
  model?: string
  /** 提供商 ID */
  provider?: string
  /** 温度参数 */
  temperature?: number
  /** 最大 token 数 */
  maxTokens?: number
}

/**
 * 发送聊天请求
 * @param messages - 聊天消息列表
 * @param options - 聊天选项
 * @returns 聊天完成响应
 */
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
