'use client'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ConfirmDeleteDialogProps {
  open: boolean
  sessionTitle: string
  onConfirm: () => void
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
          <AlertDialogAction onClick={onConfirm} className="bg-red-600 hover:bg-red-700">
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
