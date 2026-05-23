// Memory Framework 接口定义

export interface MemoryL1Session {
  recordMessage(sessionId: string, message: { role: string; content: string }): void
  getMessages(sessionId: string): Array<{ role: string; content: string; timestamp: string }>
  onSessionArchive(sessionId: string): void
}

export interface MemoryFramework {
  readonly l1: MemoryL1Session
  readonly l2: import('./layers/l2-episode').MemoryL2Episode
}
