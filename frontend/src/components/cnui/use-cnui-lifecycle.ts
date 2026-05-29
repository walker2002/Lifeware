'use client'

import { useState, useCallback } from 'react'

export type SurfaceState = 'active' | 'saved' | 'cancelled'

export interface CnuiLifecycleState {
  surfaceStates: Record<string, SurfaceState>
  surfaceData: Record<string, Record<string, unknown>>
  submittingId: string | null
  validationErrors: Record<string, string[]>
  confirmDialog: {
    open: boolean
    type: 'save' | 'cancel' | 'save-with-warnings'
    surfaceId: string
    title: string
    message: string
    pendingData?: Record<string, unknown>
    domainId?: string
    action?: string
  }
}

export interface CnuiLifecycleActions {
  requestSave: (surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => void
  requestCancel: (surfaceId: string) => void
  confirmDialogAction: () => void
  dismissDialog: () => void
  updateData: (surfaceId: string, data: Record<string, unknown>) => void
  clearValidationErrors: (surfaceId: string) => void
}

export function useCnuiLifecycle(
  onSubmit: (surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => Promise<void>,
): [CnuiLifecycleState, CnuiLifecycleActions] {
  const [surfaceStates, setSurfaceStates] = useState<Record<string, SurfaceState>>({})
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
    } catch {
      setValidationErrors(prev => ({ ...prev, [surfaceId]: ['保存失败，请稍后重试'] }))
    } finally {
      setSubmittingId(null)
    }
  }, [confirmDialog, onSubmit])

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
