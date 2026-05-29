import type { L1MessageRepository } from '@/lib/db/repositories/l1-message.repository'
import type { MemoryL1Session, ChatMessageInput } from '../types'

export function createMemoryL1(repo: L1MessageRepository): MemoryL1Session {
  return {
    async appendMessage(sessionId, userId, message) {
      await repo.append({
        sessionId,
        userId,
        role: message.role,
        content: message.content,
        intentRef: message.intentRef,
        cnuiSurface: message.cnuiSurface,
      })
    },

    async getMessages(sessionId, userId) {
      return repo.findBySessionId(sessionId, userId)
    },

    async softDeleteMessages(sessionId, userId) {
      await repo.softDeleteBySessionId(sessionId, userId)
    },

    async restoreMessages(sessionId, userId) {
      await repo.restoreBySessionId(sessionId, userId)
    },

    async hardDeleteExpired(retentionDays) {
      return repo.hardDeleteExpired(retentionDays)
    },
  }
}
