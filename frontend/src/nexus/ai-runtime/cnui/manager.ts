/**
 * @file manager
 * @brief CnuiManager — 生命周期管理 + 事件处理
 */

import type { CnuiComponentType, CnuiEvent, CnuiSurfaceData } from './types'
import { createSurfaceStore, type SurfaceStore } from './surface-store'
import { createEventBus, type EventBus } from './event-bus'

/** CN-UI 管理器接口 */
export interface CnuiManager {
  /**
   * 创建 CN-UI 表面
   * @param params - 表面参数
   * @returns 表面 ID
   */
  createCnuiSurface(params: { surfaceType: CnuiComponentType; sessionId?: string; dataModel: Record<string, unknown> }): string
  /**
   * 获取表面数据
   * @param cnuiSurfaceId - 表面 ID
   * @returns 表面数据或 undefined
   */
  getSurface(cnuiSurfaceId: string): CnuiSurfaceData | undefined
  /**
   * 处理 CN-UI 事件
   * @param event - 事件对象
   */
  handleEvent(event: CnuiEvent): void
  /**
   * 注册确认回调
   * @param handler - 确认处理器
   */
  onConfirm(handler: (dataModel: Record<string, unknown>) => void): void
}

/**
 * 创建 CN-UI 管理器
 * @returns CnuiManager 实例
 */
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
