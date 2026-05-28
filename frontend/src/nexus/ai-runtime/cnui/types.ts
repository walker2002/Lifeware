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

export type CnuiDomainComponentType =
  | 'habit-creation-card'
  | 'timebox-list'
  | 'energy-indicator'
  | 'schedule-proposal'
  | 'review-summary'
  | 'objective-tracker'
  | 'habit-action-panel'
  | 'habit-checkin-panel'

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
