import type { AIGenerateRequest, AIGenerateResponse } from '../types'

interface CacheEntry {
  response: AIGenerateResponse
  expiresAt: number
}

export interface ResponseCache {
  get(key: string): AIGenerateResponse | undefined
  set(key: string, response: AIGenerateResponse, ttlMs: number): void
  invalidate(key: string): void
  clear(): void
  generateKey(request: AIGenerateRequest): string
}

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
