/**
 * @file cycle-menu.test
 * @brief [022.01] + [023.12] T6: CycleApproveMenuItem / CycleReviewMenuItem / CycleEndMenuItem 测试
 *
 * 覆盖（Phase 1 brief Step 1 / 5）：
 *  1. 仅 draft 状态显示「审核通过」菜单项
 *  2. 点击后弹出二次确认弹窗（含确认/取消按钮）
 *  3. 确认审核通过后调用 approveCycle（[T6] now 分派移除——无 startCycle/planCycle 二选一）
 *
 * 覆盖（Phase 2 brief Step 5）：
 *  4. 仅 finished 状态显示「复盘」菜单项（原 ended；[T6] AM6 同步）
 *  5. 点击后弹出二次确认弹窗
 *  6. 确认复盘后调用 reviewCycle
 *
 * 覆盖（[T6] Phase 2 Task 3.5 → T6）：
 *  7. 仅 approved 状态显示「结束周期」菜单项（原 in_progress；[T6] AM6 同步）
 *  8. 点击后弹出二次确认弹窗
 *  9. 确认结束后调用 finishCycle（原 endCycle；[T6] 函数重命名）
 *
 * 覆盖（[T6] 新增 CycleRevertMenuItem）：
 *  10. 仅 reviewed 状态显示「撤销复盘」菜单项
 *  11. 点击后弹出二次确认弹窗
 *  12. 确认撤销后调用 revertCycle
 *
 * 实现说明：
 * - approveCycle / reviewCycle / finishCycle / revertCycle 经 vi.mock 替换
 * - [T6] 移除 startCycle / planCycle 二选一测试（now 分派被取消）
 * - Dialog 用 portal，断言 body 文本即可定位弹窗出现
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// [023.12] T6：Mock approveCycle / reviewCycle / finishCycle / revertCycle。
// 旧 endCycle 已重命名为 finishCycle。
const approveCycleMock = vi.fn()
const reviewCycleMock = vi.fn()
const finishCycleMock = vi.fn()
const revertCycleMock = vi.fn()
vi.mock("@/app/actions/okr", async (importActual) => {
  const actual = await importActual<typeof import("@/app/actions/okr")>()
  return {
    ...actual,
    approveCycle: (...args: unknown[]) => approveCycleMock(...args),
    reviewCycle: (...args: unknown[]) => reviewCycleMock(...args),
    finishCycle: (...args: unknown[]) => finishCycleMock(...args),
    revertCycle: (...args: unknown[]) => revertCycleMock(...args),
  }
})

// 必须在 import 被测组件前 mock，否则 react-in-jsx-scope 触发先于 mock
import {
  CycleApproveMenuItem,
  CycleReviewMenuItem,
  CycleEndMenuItem,
  CycleRevertMenuItem,
} from "../cycle-menu"

describe("CycleApproveMenuItem", () => {
  const draftCycle: { id: string; status: "draft"; period: { start: string; end: string } } = {
    id: "cycle-1",
    status: "draft",
    period: { start: "2026-07-01", end: "2026-09-30" },
  }

  beforeEach(() => {
    approveCycleMock.mockReset()
    // [023.12] T6：成功后的 status 是 approved（原 in_progress）
    approveCycleMock.mockResolvedValue({ success: true, data: { ...draftCycle, status: "approved" } })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("仅 draft 状态显示「审核通过」菜单项", () => {
    const { rerender } = render(<CycleApproveMenuItem cycle={draftCycle} />)
    expect(screen.getByRole("button", { name: "审核通过" })).toBeInTheDocument()

    // 非 draft 状态应返回 null（不渲染任何内容）
    rerender(
      <CycleApproveMenuItem
        cycle={{ ...draftCycle, status: "approved" }}
      />,
    )
    expect(screen.queryByRole("button", { name: "审核通过" })).toBeNull()
  })

  it("点击后弹出二次确认弹窗", async () => {
    const user = userEvent.setup()
    render(<CycleApproveMenuItem cycle={draftCycle} />)

    // 点击前不应出现 Dialog 标题
    expect(screen.queryByText("审核通过此周期？")).toBeNull()

    await user.click(screen.getByRole("button", { name: "审核通过" }))

    // Dialog 弹出后含确认/取消
    expect(screen.getByText("审核通过此周期？")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "确认通过" })).toBeInTheDocument()
  })

  it("确认审核通过后调用 approveCycle（[T6] now 分派已移除）", async () => {
    const user = userEvent.setup()
    render(<CycleApproveMenuItem cycle={draftCycle} />)

    await user.click(screen.getByRole("button", { name: "审核通过" }))
    // [023.12] T6：Dialog 文案已简化——只提示「立即进入进行中状态」，无 willStart 分派
    expect(screen.getByText(/立即进入/)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "确认通过" }))

    expect(approveCycleMock).toHaveBeenCalledTimes(1)
    expect(approveCycleMock).toHaveBeenCalledWith("cycle-1")
  })
})

// ─── [022.01] Phase 2 Task 3 + [023.12] T6: CycleReviewMenuItem ──────────────────────

describe("CycleReviewMenuItem", () => {
  // [023.12] T6：ended→finished
  const finishedCycle = {
    id: "cycle-2",
    status: "finished" as const,
    period: { start: "2026-07-01", end: "2026-09-30" },
  }

  beforeEach(() => {
    reviewCycleMock.mockReset()
    reviewCycleMock.mockResolvedValue({ success: true, data: { ...finishedCycle, status: "reviewed" } })
  })

  afterEach(() => {
    cleanup()
  })

  it("仅 finished 状态显示「复盘」菜单项（[T6] 原 ended）", () => {
    const { rerender } = render(<CycleReviewMenuItem cycle={finishedCycle} />)
    expect(screen.getByRole("button", { name: "复盘" })).toBeInTheDocument()

    // [T6] approved 不应显示
    rerender(
      <CycleReviewMenuItem
        cycle={{ ...finishedCycle, status: "approved" }}
      />,
    )
    expect(screen.queryByRole("button", { name: "复盘" })).toBeNull()
  })

  it("点击后弹出二次确认弹窗", async () => {
    const user = userEvent.setup()
    render(<CycleReviewMenuItem cycle={finishedCycle} />)

    expect(screen.queryByText("复盘此周期？")).toBeNull()
    await user.click(screen.getByRole("button", { name: "复盘" }))

    expect(screen.getByText("复盘此周期？")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "确认复盘" })).toBeInTheDocument()
  })

  it("确认复盘后调用 reviewCycle", async () => {
    const user = userEvent.setup()
    const onReviewed = vi.fn()
    render(<CycleReviewMenuItem cycle={finishedCycle} onReviewed={onReviewed} />)

    await user.click(screen.getByRole("button", { name: "复盘" }))
    await user.click(screen.getByRole("button", { name: "确认复盘" }))

    expect(reviewCycleMock).toHaveBeenCalledTimes(1)
    expect(reviewCycleMock).toHaveBeenCalledWith("cycle-2")
  })
})

// ─── [022.01] Phase 2 Task 3.5 + [023.12] T6: CycleEndMenuItem ──────────────────────

describe("CycleEndMenuItem", () => {
  // [023.12] T6：in_progress→approved
  const approvedCycle = {
    id: "cycle-3",
    status: "approved" as const,
    period: { start: "2026-07-01", end: "2026-09-30" },
  }

  beforeEach(() => {
    finishCycleMock.mockReset()
    // [T6]：endCycle→finishCycle；in_progress→finished
    finishCycleMock.mockResolvedValue({ success: true, data: { ...approvedCycle, status: "finished" } })
  })

  afterEach(() => {
    cleanup()
  })

  it("仅 approved 状态显示「结束周期」菜单项（[T6] 原 in_progress）", () => {
    const { rerender } = render(<CycleEndMenuItem cycle={approvedCycle} />)
    expect(screen.getByRole("button", { name: "结束周期" })).toBeInTheDocument()

    rerender(
      <CycleEndMenuItem
        cycle={{ ...approvedCycle, status: "draft" }}
      />,
    )
    expect(screen.queryByRole("button", { name: "结束周期" })).toBeNull()
  })

  it("点击后弹出二次确认弹窗", async () => {
    const user = userEvent.setup()
    render(<CycleEndMenuItem cycle={approvedCycle} />)

    expect(screen.queryByText("结束此周期？")).toBeNull()
    await user.click(screen.getByRole("button", { name: "结束周期" }))

    expect(screen.getByText("结束此周期？")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "确认结束" })).toBeInTheDocument()
  })

  it("确认结束后调用 finishCycle（[T6] 原 endCycle）", async () => {
    const user = userEvent.setup()
    const onEnded = vi.fn()
    render(<CycleEndMenuItem cycle={approvedCycle} onEnded={onEnded} />)

    await user.click(screen.getByRole("button", { name: "结束周期" }))
    await user.click(screen.getByRole("button", { name: "确认结束" }))

    expect(finishCycleMock).toHaveBeenCalledTimes(1)
    expect(finishCycleMock).toHaveBeenCalledWith("cycle-3")
  })
})

// ─── [023.12] T6 新增：CycleRevertMenuItem ──────────────────────

describe("CycleRevertMenuItem（[023.12] T6 新增）", () => {
  const reviewedCycle = {
    id: "cycle-4",
    status: "reviewed" as const,
    period: { start: "2026-07-01", end: "2026-09-30" },
  }

  beforeEach(() => {
    revertCycleMock.mockReset()
    // [T6 AM10] revert 是 reviewed→finished 一致性回退，非 to-initial
    revertCycleMock.mockResolvedValue({ success: true, data: { ...reviewedCycle, status: "finished" } })
  })

  afterEach(() => {
    cleanup()
  })

  it("仅 reviewed 状态显示「撤销复盘」菜单项", () => {
    const { rerender } = render(<CycleRevertMenuItem cycle={reviewedCycle} />)
    expect(screen.getByRole("button", { name: "撤销复盘" })).toBeInTheDocument()

    // 非 reviewed 状态应返回 null
    rerender(
      <CycleRevertMenuItem
        cycle={{ ...reviewedCycle, status: "finished" }}
      />,
    )
    expect(screen.queryByRole("button", { name: "撤销复盘" })).toBeNull()
  })

  it("点击后弹出二次确认弹窗", async () => {
    const user = userEvent.setup()
    render(<CycleRevertMenuItem cycle={reviewedCycle} />)

    expect(screen.queryByText("撤销此周期的复盘？")).toBeNull()
    await user.click(screen.getByRole("button", { name: "撤销复盘" }))

    expect(screen.getByText("撤销此周期的复盘？")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "确认撤销" })).toBeInTheDocument()
  })

  it("确认撤销后调用 revertCycle", async () => {
    const user = userEvent.setup()
    const onReverted = vi.fn()
    render(<CycleRevertMenuItem cycle={reviewedCycle} onReverted={onReverted} />)

    await user.click(screen.getByRole("button", { name: "撤销复盘" }))
    await user.click(screen.getByRole("button", { name: "确认撤销" }))

    expect(revertCycleMock).toHaveBeenCalledTimes(1)
    expect(revertCycleMock).toHaveBeenCalledWith("cycle-4")
  })
})
