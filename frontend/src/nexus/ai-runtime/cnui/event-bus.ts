// CnuiEventBus — emit/on 事件路由
import type { CnuiEvent } from './types'

export interface EventBus {
  on(handler: (event: CnuiEvent) => void): () => void
  emit(event: CnuiEvent): void
}

export function createEventBus(): EventBus {
  const handlers = new Set<(event: CnuiEvent) => void>()

  return {
    on(handler) {
      handlers.add(handler)
      return () => { handlers.delete(handler) }
    },

    emit(event) {
      for (const handler of handlers) {
        handler(event)
      }
    },
  }
}
