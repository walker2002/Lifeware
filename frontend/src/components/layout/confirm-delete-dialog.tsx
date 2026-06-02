/**
 * @file confirm-delete-dialog
 * @brief 确认删除对话框组件
 * 
 * 提供删除会话的二次确认功能
 */

'use client'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

/**
 * ConfirmDeleteDialog 组件属性
 */
interface ConfirmDeleteDialogProps {
  /** 是否打开 */
  open: boolean
  /** 会话标题 */
  sessionTitle: string
  /** 确认回调 */
  onConfirm: () => void
  /** 取消回调 */
  onCancel: () => void
}

export function ConfirmDeleteDialog({ open, sessionTitle, onConfirm, onCancel }: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除对话</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除「{sessionTitle}」吗？删除后 60 天内可以恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-error hover:bg-error/90">
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
