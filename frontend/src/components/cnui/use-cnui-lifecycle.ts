/**
 * @file use-cnui-lifecycle
 * @brief CN-UI 生命周期管理 Hook
 * 
 * 管理 CN-UI 动作面的状态、数据、验证和提交流程
 */

'use client'

import { useState, useCallback } from 'react'
import type { SurfaceState } from '@/usom/types/objects'

export type { SurfaceState }

/**
 * CN-UI 生命周期状态
 */
export interface CnuiLifecycleState {
  /** 各动作面的状态 */
  surfaceStates: Record<string, SurfaceState>
  /** 各动作面的数据 */
  surfaceData: Record<string, Record<string, unknown>>
  /** 当前正在提交的动作面 ID */
  submittingId: string | null
  /** 各动作面的验证错误 */
  validationErrors: Record<string, string[]>
  /** 确认对话框状态 */
  confirmDialog: {
    /** 是否打开 */
    open: boolean
    /** 对话框类型 */
    type: 'save' | 'cancel' | 'save-with-warnings'
    /** 动作面 ID */
    surfaceId: string
    /** 标题 */
    title: string
    /** 消息内容 */
    message: string
    /** 待提交的数据 */
    pendingData?: Record<string, unknown>
    /** 域 ID */
    domainId?: string
    /** 动作名称 */
    action?: string
  }
}

/**
 * CN-UI 生命周期操作
 */
export interface CnuiLifecycleActions {
  /** 请求保存 */
  requestSave: (surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => void
  /** 请求取消 */
  requestCancel: (surfaceId: string) => void
  /** 确认对话框操作 */
  confirmDialogAction: () => void
  /** 关闭对话框 */
  dismissDialog: () => void
  /** 更新数据 */
  updateData: (surfaceId: string, data: Record<string, unknown>) => void
  /** 清除验证错误 */
  clearValidationErrors: (surfaceId: string) => void
}

/**
 * CN-UI 生命周期管理 Hook
 * 
 * @param onSubmit - 提交回调
 * @param initialStates - 初始状态
 * @param onStateChange - 状态变更回调
 * @returns [状态, 操作] 元组
 */
export function useCnuiLifecycle(
  onSubmit: (surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => Promise<void>,
  initialStates?: Record<string, SurfaceState>,
  onStateChange?: (surfaceId: string, state: SurfaceState, data?: Record<string, unknown>) => void,
): [CnuiLifecycleState, CnuiLifecycleActions] {
  const [surfaceStates, setSurfaceStates] = useState<Record<string, SurfaceState>>(initialStates ?? {})
  const [surfaceData, setSurfaceData] = useState<Record<string, Record<string, unknown>>>({})
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({})
  const [confirmDialog, setConfirmDialog] = useState<CnuiLifecycleState['confirmDialog']>({
    open: false,
    type: 'save',
    surfaceId: '',
    title: '',
    message: '',
  })

  const updateData = useCallback((surfaceId: string, data: Record<string, unknown>) => {
    setSurfaceData(prev => ({ ...prev, [surfaceId]: data }))
  }, [])

  const clearValidationErrors = useCallback((surfaceId: string) => {
    setValidationErrors(prev => {
      const next = { ...prev }
      delete next[surfaceId]
      return next
    })
  }, [])

  const requestSave = useCallback((surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => {
    clearValidationErrors(surfaceId)

    setConfirmDialog({
      open: true,
      type: 'save',
      surfaceId,
      title: '确认保存',
      message: '确定要保存吗？',
      pendingData: data,
      domainId,
      action,
    })
  }, [clearValidationErrors])

  const requestCancel = useCallback((surfaceId: string) => {
    setConfirmDialog({
      open: true,
      type: 'cancel',
      surfaceId,
      title: '确认取消',
      message: '确定要取消吗？已填写的内容将不会保存。',
    })
  }, [])

  const confirmDialogAction = useCallback(async () => {
    const { type, surfaceId, pendingData, domainId, action } = confirmDialog

    if (type === 'cancel') {
      setSurfaceStates(prev => ({ ...prev, [surfaceId]: 'cancelled' }))
      onStateChange?.(surfaceId, 'cancelled')
      setConfirmDialog(prev => ({ ...prev, open: false }))
      return
    }

    // save 或 save-with-warnings
    if (!pendingData || !domainId || !action) return

    setConfirmDialog(prev => ({ ...prev, open: false }))
    setSubmittingId(surfaceId)

    try {
      await onSubmit(surfaceId, domainId, action, pendingData)
      setSurfaceStates(prev => ({ ...prev, [surfaceId]: 'saved' }))
      onStateChange?.(surfaceId, 'saved', pendingData)
    } catch {
      setValidationErrors(prev => ({ ...prev, [surfaceId]: ['保存失败，请稍后重试'] }))
    } finally {
      setSubmittingId(null)
    }
  }, [confirmDialog, onSubmit, onStateChange])

  const dismissDialog = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, open: false }))
  }, [])

  const state: CnuiLifecycleState = {
    surfaceStates,
    surfaceData,
    submittingId,
    validationErrors,
    confirmDialog,
  }

  const actions: CnuiLifecycleActions = {
    requestSave,
    requestCancel,
    confirmDialogAction,
    dismissDialog,
    updateData,
    clearValidationErrors,
  }

  return [state, actions]
}
