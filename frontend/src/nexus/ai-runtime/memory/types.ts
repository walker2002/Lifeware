// Memory Framework 接口定义

export interface ChatMessageInput {
  role: 'user' | 'assistant' | 'system'
  content: string
  intentRef?: string
  cnuiSurface?: Record<string, unknown> | import('../../../usom/types/objects').CnuiSurfaceRef
}

export interface MemoryL1Session {
  appendMessage(sessionId: string, userId: string, message: ChatMessageInput): Promise<void>
  getMessages(sessionId: string, userId: string): Promise<Array<{ role: string; content: string; timestamp: string; id?: string; intentRef?: string; cnuiSurface?: any }>>
  softDeleteMessages(sessionId: string, userId: string): Promise<void>
  restoreMessages(sessionId: string, userId: string): Promise<void>
  hardDeleteExpired(retentionDays: number): Promise<number>
}

export interface MemoryFramework {
  readonly l1: MemoryL1Session
  readonly l2: import('./layers/l2-episode').MemoryL2Episode
}
