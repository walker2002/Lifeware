// CN-UI 核心类型定义

export type CnuiBaseComponentType =
  | 'text-input'
  | 'select'
  | 'time-picker'
  | 'date-picker'
  | 'slider'
  | 'toggle'
  | 'button'
  | 'text-display'
  | 'list'
  | 'card'

export type CnuiDomainComponentType = string

export type CnuiComponentType = CnuiBaseComponentType | CnuiDomainComponentType

export type CnuiSurfaceStatus = 'rendering' | 'interactive' | 'confirming' | 'completed'

export interface CnuiEvent {
  type: 'input_change' | 'button_click' | 'focus' | 'blur'
  cnuiSurfaceId: string
  field?: string
  value?: unknown
  action?: string
}

export interface CnuiSurfaceMessage {
  role: string
  content: string
  cnuiSurfaceId: string
  cnuiSurfaceType: CnuiComponentType
  action: string
  dataSnapshot?: Record<string, unknown>
}

export interface CnuiSurfaceData {
  cnuiSurfaceId: string
  surfaceType: CnuiComponentType
  sessionId?: string
  status: CnuiSurfaceStatus
  dataModel: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ── CNUI Surface Handler 接口 ──────────────────────────────

export interface CnuiSurfaceHandler {
  open: (action: string) => Promise<CnuiSurfaceOpenResult>
  submit: (action: string, fields: Record<string, unknown>) => Promise<CnuiSurfaceSubmitResult>
}

export interface CnuiSurfaceOpenResult {
  content: string
  dataSnapshot: Record<string, unknown>
}

export interface CnuiSurfaceSubmitResult {
  success: boolean
  error?: string
  data?: Record<string, unknown>
}
