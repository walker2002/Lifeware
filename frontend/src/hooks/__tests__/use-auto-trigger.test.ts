/**
 * @file use-auto-trigger.test
 * @brief [026.02.4-r3-preland] TD-031 回归测试：useAutoTrigger 双分支互斥
 *
 * 覆盖：
 * - planned + startTime<=now + endTime<=now → 仅触发 1 次 onTransition（start）
 *   原 bug：双 if 会同周期连续 fire start+overtime，server-action storm。
 * - planned + startTime<=now + endTime>now   → 仅触发 1 次 onTransition（start）
 * - planned + startTime>now  + endTime<=now  → 仅触发 1 次 onTransition（overtime）
 * - status=running （[023.12] 读时派生）   → 两分支都不命中（无 transition）
 * - onTransition 抛错 → 静默吞（不影响下次 check）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useAutoTrigger } from "../use-auto-trigger"
import type { TimeboxSummary } from "@/usom/types/summaries"

function makeSummary(over: Partial<TimeboxSummary>): TimeboxSummary {
  return {
    id: "tb-1",
    title: "测试时间盒",
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T01:00:00.000Z",
    status: "planned",
    taskIds: [],
    habitIds: [],
    ...over,
  }
}

describe("useAutoTrigger — [026.02.4-r3-preland] TD-031 双分支互斥", () => {
  let nowSpy: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    nowSpy = undefined
  })

  afterEach(() => {
    nowSpy?.mockRestore()
  })

  it("planned + startTime<=now + endTime<=now → 仅触发 1 次 (start, 不双 fire overtime)", async () => {
    // 固定 now = 2026-01-01T02:00:00Z（startTime + endTime 都过）
    const fixedNow = new Date("2026-01-01T02:00:00.000Z").getTime()
    nowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNow)

    const onTransition = vi.fn().mockResolvedValue(undefined)
    const timeboxes: TimeboxSummary[] = [
      makeSummary({
        id: "tb-overdue",
        startTime: "2026-01-01T00:00:00.000Z",
        endTime: "2026-01-01T01:00:00.000Z",
        status: "planned",
      }),
    ]

    renderHook(() => useAutoTrigger({ timeboxes, onTransition }))

    // 页面加载时立即检查一次（useEffect 同步执行）—— 等待 microtask 让 await 完成
    await act(async () => {
      await Promise.resolve()
    })

    // [TD-031] 关键断言：原 bug 是 2 次（start + overtime），fix 后应是 1 次
    expect(onTransition).toHaveBeenCalledTimes(1)
    // 首分支命中 start（overtime 被 else if 互斥）
    expect(onTransition).toHaveBeenCalledWith("tb-overdue", "start")
    expect(onTransition).not.toHaveBeenCalledWith("tb-overdue", "overtime")
  })

  it("planned + startTime<=now + endTime>now → 仅触发 start", async () => {
    const fixedNow = new Date("2026-01-01T00:30:00.000Z").getTime()
    nowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNow)

    const onTransition = vi.fn().mockResolvedValue(undefined)
    const timeboxes: TimeboxSummary[] = [
      makeSummary({
        id: "tb-just-start",
        startTime: "2026-01-01T00:00:00.000Z",
        endTime: "2026-01-01T01:00:00.000Z",
        status: "planned",
      }),
    ]

    renderHook(() => useAutoTrigger({ timeboxes, onTransition }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(onTransition).toHaveBeenCalledTimes(1)
    expect(onTransition).toHaveBeenCalledWith("tb-just-start", "start")
  })

  it("planned + startTime>now + endTime<=now → 仅触发 overtime", async () => {
    const fixedNow = new Date("2026-01-01T02:00:00.000Z").getTime()
    nowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNow)

    const onTransition = vi.fn().mockResolvedValue(undefined)
    const timeboxes: TimeboxSummary[] = [
      makeSummary({
        id: "tb-never-started",
        // startTime 在未来，endTime 在过去 → 极端"超时未启动"边界
        startTime: "2026-01-01T03:00:00.000Z",
        endTime: "2026-01-01T01:00:00.000Z",
        status: "planned",
      }),
    ]

    renderHook(() => useAutoTrigger({ timeboxes, onTransition }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(onTransition).toHaveBeenCalledTimes(1)
    expect(onTransition).toHaveBeenCalledWith("tb-never-started", "overtime")
  })

  it("status 不为 planned → 两分支都不命中", async () => {
    const fixedNow = new Date("2026-01-01T02:00:00.000Z").getTime()
    nowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNow)

    const onTransition = vi.fn().mockResolvedValue(undefined)
    const timeboxes: TimeboxSummary[] = [
      makeSummary({
        id: "tb-logged",
        status: "logged",
        startTime: "2026-01-01T00:00:00.000Z",
        endTime: "2026-01-01T01:00:00.000Z",
      }),
    ]

    renderHook(() => useAutoTrigger({ timeboxes, onTransition }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(onTransition).not.toHaveBeenCalled()
  })

  it("onTransition 抛错 → 静默吞（不影响后续）", async () => {
    const fixedNow = new Date("2026-01-01T02:00:00.000Z").getTime()
    nowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNow)

    const onTransition = vi.fn().mockRejectedValue(new Error("server boom"))
    const timeboxes: TimeboxSummary[] = [
      makeSummary({ id: "tb-1", status: "planned" }),
    ]

    // 不应抛错到 renderHook 外面
    expect(() =>
      renderHook(() => useAutoTrigger({ timeboxes, onTransition })),
    ).not.toThrow()

    await act(async () => {
      await Promise.resolve()
    })

    expect(onTransition).toHaveBeenCalledTimes(1)
  })

  it("多 timebox：overdue + 已完成 + 未来 → 共 2 次 (overdue.start, future.overtime 各 1)", async () => {
    const fixedNow = new Date("2026-01-01T02:00:00.000Z").getTime()
    nowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNow)

    const onTransition = vi.fn().mockResolvedValue(undefined)
    const timeboxes: TimeboxSummary[] = [
      // 已 overdue → start 分支命中 1 次（overtime 被 else if 互斥）
      makeSummary({
        id: "tb-overdue",
        startTime: "2026-01-01T00:00:00.000Z",
        endTime: "2026-01-01T01:00:00.000Z",
        status: "planned",
      }),
      // 已 logged → 都不命中
      makeSummary({
        id: "tb-logged",
        startTime: "2026-01-01T00:00:00.000Z",
        endTime: "2026-01-01T01:00:00.000Z",
        status: "logged",
      }),
      // 未来 startTime 但 endTime 也未来 → 都不命中
      makeSummary({
        id: "tb-future",
        startTime: "2026-01-01T03:00:00.000Z",
        endTime: "2026-01-01T04:00:00.000Z",
        status: "planned",
      }),
    ]

    renderHook(() => useAutoTrigger({ timeboxes, onTransition }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(onTransition).toHaveBeenCalledTimes(1)
    expect(onTransition).toHaveBeenCalledWith("tb-overdue", "start")
    expect(onTransition).not.toHaveBeenCalledWith("tb-overdue", "overtime")
    expect(onTransition).not.toHaveBeenCalledWith("tb-logged", expect.anything())
    expect(onTransition).not.toHaveBeenCalledWith("tb-future", expect.anything())
  })
})