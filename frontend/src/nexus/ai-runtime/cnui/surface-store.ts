// CnuiSurfaceStore — 内存 Map CRUD
import type { CnuiSurfaceData, CnuiComponentType, CnuiSurfaceStatus } from './types'

export interface SurfaceStore {
  create(params: { surfaceType: CnuiComponentType; sessionId?: string; dataModel: Record<string, unknown> }): string
  get(cnuiSurfaceId: string): CnuiSurfaceData | undefined
  update(cnuiSurfaceId: string, patch: Partial<Pick<CnuiSurfaceData, 'dataModel' | 'status'>>): void
  delete(cnuiSurfaceId: string): void
}

export function createSurfaceStore(): SurfaceStore {
  const store = new Map<string, CnuiSurfaceData>()

  return {
    create(params) {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      store.set(id, {
        cnuiSurfaceId: id,
        surfaceType: params.surfaceType,
        sessionId: params.sessionId,
        status: 'rendering',
        dataModel: params.dataModel,
        createdAt: now,
        updatedAt: now,
      })
      return id
    },

    get(cnuiSurfaceId) {
      return store.get(cnuiSurfaceId)
    },

    update(cnuiSurfaceId, patch) {
      const data = store.get(cnuiSurfaceId)
      if (!data) return
      Object.assign(data, patch, { updatedAt: new Date().toISOString() })
    },

    delete(cnuiSurfaceId) {
      store.delete(cnuiSurfaceId)
    },
  }
}
