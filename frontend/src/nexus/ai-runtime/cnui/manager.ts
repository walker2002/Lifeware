// CnuiManager — 生命周期管理 + 事件处理
import type { CnuiComponentType, CnuiEvent, CnuiSurfaceData } from './types'
import { createSurfaceStore, type SurfaceStore } from './surface-store'
import { createEventBus, type EventBus } from './event-bus'

export interface CnuiManager {
  createCnuiSurface(params: { surfaceType: CnuiComponentType; sessionId?: string; dataModel: Record<string, unknown> }): string
  getSurface(cnuiSurfaceId: string): CnuiSurfaceData | undefined
  handleEvent(event: CnuiEvent): void
  onConfirm(handler: (dataModel: Record<string, unknown>) => void): void
}

export function createCnuiManager(): CnuiManager {
  const store: SurfaceStore = createSurfaceStore()
  const bus: EventBus = createEventBus()
  const confirmHandlers: Array<(dataModel: Record<string, unknown>) => void> = []

  return {
    createCnuiSurface(params) {
      return store.create(params)
    },

    getSurface(cnuiSurfaceId) {
      return store.get(cnuiSurfaceId)
    },

    handleEvent(event) {
      const surface = store.get(event.cnuiSurfaceId)
      if (!surface) return

      if (event.type === 'input_change' && event.field) {
        store.update(event.cnuiSurfaceId, {
          dataModel: { ...surface.dataModel, [event.field]: event.value },
          status: 'interactive',
        })
      }

      if (event.type === 'button_click' && event.action === 'confirm') {
        store.update(event.cnuiSurfaceId, { status: 'completed' })
        for (const handler of confirmHandlers) {
          handler({ ...surface.dataModel })
        }
      }

      bus.emit(event)
    },

    onConfirm(handler) {
      confirmHandlers.push(handler)
    },
  }
}
