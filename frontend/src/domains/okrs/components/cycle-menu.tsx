/**
 * @file cycle-menu
 * @brief [022.01] Phase 1 Task 7 + Phase 2 Task 3 + Task 3.5 + [023.12] T6: Cycle 操作菜单
 *
 * 提供四个并列的菜单项组件（[023.12] T6 新增 CycleRevertMenuItem）：
 * - CycleApproveMenuItem：仅 draft cycle 可见，确认后调用 approveCycle server action
 * - CycleEndMenuItem：仅 approved cycle 可见（[T6] 原 in_progress），确认后调用 finishCycle server action
 * - CycleReviewMenuItem：仅 finished cycle 可见（[T6] 原 ended），确认后调用 reviewCycle server action
 * - CycleRevertMenuItem（[T6] 新增）：仅 reviewed cycle 可见，确认后调用 revertCycle server action
 *
 * 设计要点：
 * - 四个组件保持独立（不抽取共享抽象）——它们的 status 守卫、文案、回调命名、加载文案
 *   各自不同（draft→approved vs approved→finished vs finished→reviewed vs reviewed→finished），
 *   强行抽象会引入仅为统一而存在的条件分支；保持独立更直白、更易读、更易删。
 * - 渲染为单个 dropdown 行（不是 DropdownMenu 容器），便于宿主（okr-directory）的 ⋯
 *   DropdownMenuContent 直接嵌套 children。
 * - 文件头注释遵循 docs/code-commenting-guide.md；规避任何 Tailwind 默认颜色类（仅用 UI token）。
 * - [023.12] T6 [AM10]：revert 是「reviewed→finished」一步回退，非 to-initial——保留复盘证据。
 */

"use client"

import { useState } from "react"
import { toast } from "sonner"
import { approveCycle, reviewCycle, finishCycle, revertCycle } from "@/app/actions/okr"
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
    status: Cycle['status']
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
              {/* [023.12] T6：移除"未开始"中间态描述——4 态收敛后批准即活跃 */}
              审核通过后周期将立即进入「进行中」状态，目标变为可见。
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
 *
 * [023.12] T6：cycle.status 收窄后的合法值为 draft/approved/finished/reviewed。
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
 * "复盘" 菜单项——仅 finished cycle 可见（[023.12] T6：原 ended）。
 *
 * 点击后弹出二次确认 Dialog；确认即调用 reviewCycle server action。
 * 文案说明：复盘后周期将锁定，目标编辑将在后续版本中限制（Phase 2 暂未在
 * 写路径强制锁定——避免对 obj/kr 写路径引入穿透式断言；锁定语义由 Phase 3
 * 接入 obj/kr 写路径时统一实现）。
 */
export function CycleReviewMenuItem({ cycle, onReviewed }: CycleReviewMenuItemProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // 仅 finished 显示；其他状态返回 null（由宿主 DropdownMenu 自然隐藏）
  if (cycle.status !== "finished") return null

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
 *
 * [023.12] T6：函数内部 endCycle → finishCycle（产品语义「结束」即「完成进入复盘」）。
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
 * "结束周期" 菜单项——仅 approved cycle 可见（[023.12] T6：原 in_progress）。
 *
 * 点击后弹出二次确认 Dialog；确认即调用 finishCycle server action。
 * 结束后 cycle 转为 finished，下一步可被复盘（reviewCycle）。
 * 此路径填补了 Phase 2 reviewCycle 的前置：没有它，reviewCycle 在 Phase 2
 * 不可达（无 way to reach finished state）。
 */
export function CycleEndMenuItem({ cycle, onEnded }: CycleEndMenuItemProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // 仅 approved 显示；其他状态返回 null（由宿主 DropdownMenu 自然隐藏）
  if (cycle.status !== "approved") return null

  async function handleEnd() {
    setLoading(true)
    try {
      const result = await finishCycle(cycle.id)
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

/**
 * CycleRevertMenuItem 入参（[023.12] T6 新增）
 */
interface CycleRevertMenuItemProps {
  /** 待撤销复盘的 Cycle（仅需 id / status） */
  cycle: {
    id: string
    status: Cycle["status"]
  }
  /** 撤销成功后回调 */
  onReverted?: () => void
}

/**
 * "撤销复盘" 菜单项——仅 reviewed cycle 可见（[023.12] T6 新增，[AM10]）。
 *
 * 点击后弹出二次确认 Dialog；确认即调用 revertCycle server action。
 * 撤销后 cycle 回到 finished（而非 draft）——保留复盘证据（reviewedAt），
 * 允许再次走 finish→review 路径。
 */
export function CycleRevertMenuItem({ cycle, onReverted }: CycleRevertMenuItemProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // 仅 reviewed 显示；其他状态返回 null（由宿主 DropdownMenu 自然隐藏）
  if (cycle.status !== "reviewed") return null

  async function handleRevert() {
    setLoading(true)
    try {
      const result = await revertCycle(cycle.id)
      if (!result.success) {
        toast.error(result.error ?? "撤销复盘失败")
        return
      }
      setOpen(false)
      onReverted?.()
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
        撤销复盘
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>撤销此周期的复盘？</DialogTitle>
            <DialogDescription>
              撤销后周期将回到「已结束」状态，可重新调整目标后再次复盘。复盘记录将保留。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              取消
            </Button>
            <Button onClick={handleRevert} disabled={loading}>
              {loading ? "处理中..." : "确认撤销"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
