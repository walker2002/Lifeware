/**
 * @file cascade-confirm-dialog
 * @brief 级联确认对话框组件
 *
 * [025] ISSUE-003 D4：当任务状态变更/完成命中 cascade 规则（父任务有子任务）
 * 时弹出，让用户确认是否「连带下级」一起变更。
 *
 * 仅两选项：
 * - 「连带下级」（确认，bg-primary 主操作色）—— 以 confirmed=true 重发请求
 * - 「取消」—— 关闭弹窗，不做任何变更
 *
 * 决策#7：不提供「仅本项」选项（会造成父完成/子未完成的业务不一致）。
 *
 * 设计约束：颜色使用 CSS 变量令牌（bg-primary），禁 Tailwind 默认色（UI-DESIGN-SPEC §14）。
 */

'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

/**
 * CascadeConfirmDialog 组件属性
 */
interface CascadeConfirmDialogProps {
  /** 是否打开 */
  open: boolean
  /** 级联确认提示文案（来自 server action 的 confirmationMessage） */
  message: string
  /** 确认回调（连带下级，以 confirmed=true 重发） */
  onConfirm: () => void
  /** 取消回调 */
  onCancel: () => void
}

/**
 * 级联确认对话框
 *
 * @param open - 是否打开
 * @param message - 服务端返回的级联提示文案
 * @param onConfirm - 用户点击「连带下级」
 * @param onCancel - 用户点击「取消」或遮罩/ESC 关闭
 */
export function CascadeConfirmDialog({
  open,
  message,
  onConfirm,
  onCancel,
}: CascadeConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>级联确认</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-primary hover:bg-primary/90"
          >
            连带下级
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
