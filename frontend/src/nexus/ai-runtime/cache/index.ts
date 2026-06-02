/**
 * @file index
 * @brief AI 响应缓存
 * 
 * 基于请求内容的哈希缓存 LLM 响应
 */

import type { AIGenerateRequest, AIGenerateResponse } from '../types'

/** 缓存条目 */
interface CacheEntry {
  /** 响应 */
  response: AIGenerateResponse
  /** 过期时间戳 */
  expiresAt: number
}

/** 响应缓存接口 */
export interface ResponseCache {
  /**
   * 获取缓存项
   * @param key - 缓存键
   * @returns 响应或 undefined
   */
  get(key: string): AIGenerateResponse | undefined
  /**
   * 设置缓存项
   * @param key - 缓存键
   * @param response - 响应
   * @param ttlMs - 过期时间（毫秒）
   */
  set(key: string, response: AIGenerateResponse, ttlMs: number): void
  /**
   * 失效指定键
   * @param key - 缓存键
   */
  invalidate(key: string): void
  /** 清空所有缓存 */
  clear(): void
  /**
   * 生成缓存键
   * @param request - 生成请求
   * @returns 缓存键
   */
  generateKey(request: AIGenerateRequest): string
}

/**
 * 创建响应缓存实例
 * @returns ResponseCache 实例
 */
export function createResponseCache(): ResponseCache {
  const store = new Map<string, CacheEntry>()

  return {
    generateKey(request: AIGenerateRequest): string {
      const raw = JSON.stringify({
        systemPrompt: request.systemPrompt,
        messages: request.messages,
        taskType: request.taskType,
      })
      // Simple synchronous hash for non-browser Node.js
      let h = 0
      for (let i = 0; i < raw.length; i++) {
        const char = raw.charCodeAt(i)
        h = ((h << 5) - h) + char
        h |= 0
      }
      return `${request.taskType}:${h.toString(36)}`
    },

    get(key: string): AIGenerateResponse | undefined {
      const entry = store.get(key)
      if (!entry) return undefined
      if (Date.now() > entry.expiresAt) {
        store.delete(key)
        return undefined
      }
      return entry.response
    },

    set(key: string, response: AIGenerateResponse, ttlMs: number): void {
      store.set(key, { response, expiresAt: Date.now() + ttlMs })
    },

    invalidate(key: string): void {
      store.delete(key)
    },

    clear(): void {
      store.clear()
    },
  }
}
