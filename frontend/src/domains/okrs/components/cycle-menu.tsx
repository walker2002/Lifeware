/**
 * @file cycle-menu
 * @brief [022.01] Phase 1 Task 7: Cycle 操作菜单（审核通过）
 *
 * 提供 CycleApproveMenuItem 组件：
 * - 仅 draft 状态显示（其他状态返回 null）
 * - 点击触发二次确认 Dialog
 * - 确认后调用 approveCycle server action（按 now vs periodStart 分派 startCycle / planCycle）
 *
 * 设计要点：
 * - 渲染为单个 dropdown 行（不是 DropdownMenu 容器），便于宿主（okr-directory）的 ⋯
 *   DropdownMenuContent 直接嵌套 children。
 * - 文件头注释遵循 docs/code-commenting-guide.md；规避任何 Tailwind 默认颜色类（仅用 UI token）。
 */

"use client"

import { useState } from "react"
import { approveCycle } from "@/app/actions/okr"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

/**
 * CycleApproveMenuItem 入参
 */
interface CycleApproveMenuItemProps {
  /** 待审核通过的 Cycle 摘要（仅需 id / status / period.start / period.end） */
  cycle: {
    id: string
    status: string
    period: { start: string; end: string }
  }
  /** 审核成功后回调（用于刷新列表等） */
  onApproved?: () => void
}

/**
 * "审核通过" 菜单项——仅 draft cycle 可见。
 *
 * 点击后弹出二次确认 Dialog；确认即调用 approveCycle server action。
 * 文案根据 now vs periodStart / periodEnd 给出提示（普通/未到开始/已过期）。
 */
export function CycleApproveMenuItem({ cycle, onApproved }: CycleApproveMenuItemProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // 仅 draft 显示；其他状态返回 null（由宿主 DropdownMenu 自然隐藏）
  if (cycle.status !== "draft") return null

  const now = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const willStart = now >= cycle.period.start
  const isExpired = now > cycle.period.end

  async function handleApprove() {
    setLoading(true)
    try {
      const result = await approveCycle(cycle.id)
      if (!result.success) {
        // server 异常：以弹窗方式提示（保持 UI 体感一致，避免 alert 阻塞）
        window.alert(result.error ?? "审核失败")
        return
      }
      setOpen(false)
      onApproved?.()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded outline-hidden"
      >
        审核通过
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>审核通过此周期？</DialogTitle>
            <DialogDescription>
              {willStart
                ? "审核通过后周期将立即启动，目标变为可见。"
                : "周期尚未到开始日期，审核通过后将进入「未开始」状态。"}
              {isExpired && " 注意：此周期已过期，审核通过后将自动标记为已结束。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              取消
            </Button>
            <Button onClick={handleApprove} disabled={loading}>
              {loading ? "处理中..." : "确认通过"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
