/**
 * @file cycle-menu
 * @brief [022.01] Phase 1 Task 7 + Phase 2 Task 3 + Task 3.5: Cycle 操作菜单（审核通过 / 结束 / 复盘）
 *
 * 提供三个并列的菜单项组件：
 * - CycleApproveMenuItem：仅 draft cycle 可见，确认后调用 approveCycle server action
 * - CycleEndMenuItem：仅 in_progress cycle 可见，确认后调用 endCycle server action
 * - CycleReviewMenuItem：仅 ended cycle 可见，确认后调用 reviewCycle server action
 *
 * 设计要点：
 * - 三个组件保持独立（不抽取共享抽象）——它们的 status 守卫、文案、回调命名、加载文案
 *   各自不同（draft→startCycle/planCycle vs in_progress→ended vs ended→reviewed），
 *   强行抽象会引入仅为统一而存在的条件分支；保持独立更直白、更易读、更易删。
 * - 渲染为单个 dropdown 行（不是 DropdownMenu 容器），便于宿主（okr-directory）的 ⋯
 *   DropdownMenuContent 直接嵌套 children。
 * - 文件头注释遵循 docs/code-commenting-guide.md；规避任何 Tailwind 默认颜色类（仅用 UI token）。
 */

"use client"

import { useState } from "react"
import { toast } from "sonner"
import { approveCycle, reviewCycle, endCycle } from "@/app/actions/okr"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { Cycle } from "@/usom/types/objects"

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
 * 文案根据 now vs periodStart 给出提示（立即启动 / 未开始）。
 */
export function CycleApproveMenuItem({ cycle, onApproved }: CycleApproveMenuItemProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // 仅 draft 显示；其他状态返回 null（由宿主 DropdownMenu 自然隐藏）
  if (cycle.status !== "draft") return null

  const now = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const willStart = now >= cycle.period.start

  async function handleApprove() {
    setLoading(true)
    try {
      const result = await approveCycle(cycle.id)
      if (!result.success) {
        toast.error(result.error ?? "审核失败")
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
        className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded outline-hidden focus-visible:outline-2 focus-visible:outline-ring"
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

/**
 * CycleReviewMenuItem 入参
 *
 * [022.01] Phase 2 Task 3 finding #7：cycle.status 类型收窄为 Cycle['status']
 * （而非 string），与 guard.ts assertEditable 的入参类型对齐——避免菜单项
 * 把 status 当 string 后又需要 cast。
 */
interface CycleReviewMenuItemProps {
  /** 待复盘的 Cycle（仅需 id / status） */
  cycle: {
    id: string
    status: Cycle["status"]
  }
  /** 复盘成功后回调 */
  onReviewed?: () => void
}

/**
 * "复盘" 菜单项——仅 ended cycle 可见。
 *
 * 点击后弹出二次确认 Dialog；确认即调用 reviewCycle server action。
 * 文案说明：复盘后周期将锁定，目标编辑将在后续版本中限制（Phase 2 暂未在
 * 写路径强制锁定——避免对 obj/kr 写路径引入穿透式断言；锁定语义由 Phase 3
 * 接入 obj/kr 写路径时统一实现）。
 */
export function CycleReviewMenuItem({ cycle, onReviewed }: CycleReviewMenuItemProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // 仅 ended 显示；其他状态返回 null（由宿主 DropdownMenu 自然隐藏）
  if (cycle.status !== "ended") return null

  async function handleReview() {
    setLoading(true)
    try {
      const result = await reviewCycle(cycle.id)
      if (!result.success) {
        toast.error(result.error ?? "复盘失败")
        return
      }
      setOpen(false)
      onReviewed?.()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded outline-hidden focus-visible:outline-2 focus-visible:outline-ring"
      >
        复盘
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>复盘此周期？</DialogTitle>
            <DialogDescription>
              复盘后周期将锁定，目标编辑将在后续版本中限制。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              取消
            </Button>
            <Button onClick={handleReview} disabled={loading}>
              {loading ? "处理中..." : "确认复盘"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * CycleEndMenuItem 入参
 *
 * [022.01] Phase 2 Task 3.5：cycle.status 类型收窄为 Cycle['status']
 * （而非 string），与 CycleReviewMenuItem 对齐。
 */
interface CycleEndMenuItemProps {
  /** 待结束的 Cycle（仅需 id / status） */
  cycle: {
    id: string
    status: Cycle["status"]
  }
  /** 结束成功后回调 */
  onEnded?: () => void
}

/**
 * "结束周期" 菜单项——仅 in_progress cycle 可见。
 *
 * 点击后弹出二次确认 Dialog；确认即调用 endCycle server action。
 * 结束后 cycle 转为 ended，下一步可被复盘（reviewCycle）。
 * 此路径填补了 Phase 2 reviewCycle 的前置：没有它，reviewCycle 在 Phase 2
 * 不可达（无 way to reach ended state）。
 */
export function CycleEndMenuItem({ cycle, onEnded }: CycleEndMenuItemProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // 仅 in_progress 显示；其他状态返回 null（由宿主 DropdownMenu 自然隐藏）
  if (cycle.status !== "in_progress") return null

  async function handleEnd() {
    setLoading(true)
    try {
      const result = await endCycle(cycle.id)
      if (!result.success) {
        toast.error(result.error ?? "结束失败")
        return
      }
      setOpen(false)
      onEnded?.()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded outline-hidden focus-visible:outline-2 focus-visible:outline-ring"
      >
        结束周期
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>结束此周期？</DialogTitle>
            <DialogDescription>
              结束后目标删除将在后续版本中限制，当前仍可编辑目标内容。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              取消
            </Button>
            <Button onClick={handleEnd} disabled={loading}>
              {loading ? "处理中..." : "确认结束"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
