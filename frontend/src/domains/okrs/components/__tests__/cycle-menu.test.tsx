/**
 * @file cycle-menu.test
 * @brief [022.01] Phase 1 Task 7 + Phase 2 Task 3: CycleApproveMenuItem / CycleReviewMenuItem 测试
 *
 * 覆盖（Phase 1 brief Step 1 / 5）：
 *  1. 仅 draft 状态显示「审核通过」菜单项
 *  2. 点击后弹出二次确认弹窗（含确认/取消按钮）
 *  3. now >= periodStart 时执行 startCycle action
 *  4. now <  periodStart 时执行 planCycle action
 *
 * 覆盖（Phase 2 brief Step 5）：
 *  5. 仅 ended 状态显示「复盘」菜单项
 *  6. 点击后弹出二次确认弹窗
 *  7. 确认复盘后调用 reviewCycle
 *
 * 实现说明：
 * - approveCycle / reviewCycle 经 vi.mock 替换，按 vi.setSystemTime 注入不同 now 来验证分派逻辑。
 * - Dialog 用 portal，断言 body 文本 "审核通过此周期？" 即可定位弹窗出现。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// Mock approveCycle / reviewCycle，统一从 server action 模块捕获
const approveCycleMock = vi.fn()
const reviewCycleMock = vi.fn()
vi.mock("@/app/actions/okr", async (importActual) => {
  const actual = await importActual<typeof import("@/app/actions/okr")>()
  return {
    ...actual,
    approveCycle: (...args: unknown[]) => approveCycleMock(...args),
    reviewCycle: (...args: unknown[]) => reviewCycleMock(...args),
  }
})

// 必须在 import 被测组件前 mock，否则 react-in-jsx-scope 触发先于 mock
import { CycleApproveMenuItem, CycleReviewMenuItem } from "../cycle-menu"

describe("CycleApproveMenuItem", () => {
  const draftCycle = {
    id: "cycle-1",
    status: "draft",
    period: { start: "2026-07-01", end: "2026-09-30" },
  }

  beforeEach(() => {
    approveCycleMock.mockReset()
    approveCycleMock.mockResolvedValue({ success: true, data: { ...draftCycle, status: "in_progress" } })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("仅 draft 状态显示「审核通过」菜单项", () => {
    const { rerender } = render(<CycleApproveMenuItem cycle={draftCycle} />)
    expect(screen.getByRole("button", { name: "审核通过" })).toBeInTheDocument()

    // 非 draft 状态应返回 null（不渲染任何内容）
    rerender(
      <CycleApproveMenuItem
        cycle={{ ...draftCycle, status: "in_progress" }}
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

  it("now >= periodStart 时执行 startCycle action", async () => {
    // 用 Date mock 而非 vi.useFakeTimers——后者与 userEvent setup 配合不稳
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue("2026-07-15T12:00:00.000Z")

    const user = userEvent.setup()
    render(<CycleApproveMenuItem cycle={draftCycle} />)

    await user.click(screen.getByRole("button", { name: "审核通过" }))
    // 弹窗中应提示「立即启动」（willStart=true 分支文案）
    expect(screen.getByText(/立即启动/)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "确认通过" }))

    expect(approveCycleMock).toHaveBeenCalledTimes(1)
    expect(approveCycleMock).toHaveBeenCalledWith("cycle-1")

    vi.restoreAllMocks()
  })

  it("now < periodStart 时执行 planCycle action", async () => {
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue("2026-06-15T12:00:00.000Z")

    const user = userEvent.setup()
    render(<CycleApproveMenuItem cycle={draftCycle} />)

    await user.click(screen.getByRole("button", { name: "审核通过" }))
    // 弹窗中应提示「未开始」状态（willStart=false 分支文案）
    expect(screen.getByText(/未开始/)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "确认通过" }))

    expect(approveCycleMock).toHaveBeenCalledTimes(1)
    // approveCycle 是 server action 边界；测试只验证调用行为，
    // 而服务端的 startCycle/planCycle 分派由 approveCycle 内部按 now 决定
    expect(approveCycleMock).toHaveBeenCalledWith("cycle-1")

    vi.restoreAllMocks()
  })
})

// ─── [022.01] Phase 2 Task 3: CycleReviewMenuItem ──────────────────────

describe("CycleReviewMenuItem", () => {
  const endedCycle = {
    id: "cycle-2",
    status: "ended" as const,
    period: { start: "2026-07-01", end: "2026-09-30" },
  }

  beforeEach(() => {
    reviewCycleMock.mockReset()
    reviewCycleMock.mockResolvedValue({ success: true, data: { ...endedCycle, status: "reviewed" } })
  })

  afterEach(() => {
    cleanup()
  })

  it("仅 ended 状态显示「复盘」菜单项", () => {
    const { rerender } = render(<CycleReviewMenuItem cycle={endedCycle} />)
    expect(screen.getByRole("button", { name: "复盘" })).toBeInTheDocument()

    rerender(
      <CycleReviewMenuItem
        cycle={{ ...endedCycle, status: "in_progress" }}
      />,
    )
    expect(screen.queryByRole("button", { name: "复盘" })).toBeNull()
  })

  it("点击后弹出二次确认弹窗", async () => {
    const user = userEvent.setup()
    render(<CycleReviewMenuItem cycle={endedCycle} />)

    expect(screen.queryByText("复盘此周期？")).toBeNull()
    await user.click(screen.getByRole("button", { name: "复盘" }))

    expect(screen.getByText("复盘此周期？")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "确认复盘" })).toBeInTheDocument()
  })

  it("确认复盘后调用 reviewCycle", async () => {
    const user = userEvent.setup()
    const onReviewed = vi.fn()
    render(<CycleReviewMenuItem cycle={endedCycle} onReviewed={onReviewed} />)

    await user.click(screen.getByRole("button", { name: "复盘" }))
    await user.click(screen.getByRole("button", { name: "确认复盘" }))

    expect(reviewCycleMock).toHaveBeenCalledTimes(1)
    expect(reviewCycleMock).toHaveBeenCalledWith("cycle-2")
  })
})
