/**
 * @file cnui-confirm-dialog
 * @brief CN-UI 确认对话框组件
 * 
 * 提供通用的确认/取消对话框，用于危险操作的二次确认
 */

'use client'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

/**
 * CnuiConfirmDialog 组件属性
 */
export interface CnuiConfirmDialogProps {
  /** 是否打开对话框 */
  open: boolean
  /** 标题 */
  title: string
  /** 消息内容 */
  message: string
  /** 确认回调 */
  onConfirm: () => void
  /** 取消回调 */
  onCancel: () => void
  /** 确认按钮标签（默认"确认"） */
  confirmLabel?: string
  /** 取消按钮标签（默认"取消"） */
  cancelLabel?: string
}

export function CnuiConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = '确认',
  cancelLabel = '取消',
}: CnuiConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <AlertDialogContent overlayClassName="bg-scrim-cnui">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
