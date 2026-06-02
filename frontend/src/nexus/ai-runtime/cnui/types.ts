/**
 * @file types
 * @brief CN-UI 核心类型定义
 */

/** CN-UI 基础组件类型 */
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

/** CN-UI 领域扩展组件类型 */
export type CnuiDomainComponentType = string

/** CN-UI 组件类型 */
export type CnuiComponentType = CnuiBaseComponentType | CnuiDomainComponentType

/** CN-UI 表面状态 */
export type CnuiSurfaceStatus = 'rendering' | 'interactive' | 'confirming' | 'completed'

/** CN-UI 事件 */
export interface CnuiEvent {
  /** 事件类型 */
  type: 'input_change' | 'button_click' | 'focus' | 'blur'
  /** 表面 ID */
  cnuiSurfaceId: string
  /** 字段名（输入事件） */
  field?: string
  /** 字段值 */
  value?: unknown
  /** 动作名称 */
  action?: string
}

/** CN-UI 表面消息 */
export interface CnuiSurfaceMessage {
  /** 角色 */
  role: string
  /** 内容 */
  content: string
  /** 表面 ID */
  cnuiSurfaceId: string
  /** 表面类型 */
  cnuiSurfaceType: CnuiComponentType
  /** 动作名称 */
  action: string
  /** 数据快照 */
  dataSnapshot?: Record<string, unknown>
}

/** CN-UI 表面数据 */
export interface CnuiSurfaceData {
  /** 表面 ID */
  cnuiSurfaceId: string
  /** 表面类型 */
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
