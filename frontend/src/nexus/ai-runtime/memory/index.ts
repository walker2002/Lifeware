// Memory Framework 入口
import type { MemoryFramework, MemoryL1Session } from './types'
import type { MemoryL2Episode } from './layers/l2-episode'
import { createMemoryL1 } from './layers/l1-session'
import { createMemoryL2 } from './layers/l2-episode'
import { L1MessageRepository } from '@/lib/db/repositories/l1-message.repository'

let instance: MemoryFramework | null = null

export function createMemoryFramework(): MemoryFramework {
  if (instance) return instance

  const l1Repo = new L1MessageRepository()
  const l1 = createMemoryL1(l1Repo)
  const l2 = createMemoryL2()

  instance = { l1, l2 }
  return instance
}

export function resetMemoryFramework(): void {
  instance = null
}

export type { MemoryFramework, MemoryL1Session, ChatMessageInput } from './types'
export type { MemoryL2Episode, EpisodeData, EpisodeResult } from './layers/l2-episode'
