// Memory Framework 入口
import type { MemoryFramework, MemoryL1Session } from './types'
import type { MemoryL2Episode } from './layers/l2-episode'
import { createMemoryL2 } from './layers/l2-episode'

export function createMemoryFramework(): MemoryFramework {
  const l1: MemoryL1Session = {
    recordMessage(sessionId, message) {
      const store = getMessageStore()
      const messages = store.get(sessionId) ?? []
      messages.push({ ...message, timestamp: new Date().toISOString() })
      store.set(sessionId, messages)
    },

    getMessages(sessionId) {
      const store = getMessageStore()
      return store.get(sessionId) ?? []
    },

    onSessionArchive(sessionId) {
      getMessageStore().delete(sessionId)
    },
  }

  const l2 = createMemoryL2()

  return { l1, l2 }
}

const messageStore = new Map<string, Array<{ role: string; content: string; timestamp: string }>>()
function getMessageStore() {
  return messageStore
}

export type { MemoryFramework, MemoryL1Session } from './types'
export type { MemoryL2Episode, EpisodeData, EpisodeResult } from './layers/l2-episode'
