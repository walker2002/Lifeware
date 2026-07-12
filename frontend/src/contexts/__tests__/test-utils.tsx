/**
 * @file test-utils
 * @brief [TZ-2] 显示端组件测试 helper — render 时自动 wrap UserTimezoneProvider
 *
 * 用途：测试任何调 `useUserTz()` 的显示端组件时，避免每个测试都手写 Provider wrap。
 *   默认 `initialTz='Asia/Shanghai'`（与 MVP 默认一致；个别测试需要 Tokyo / UTC 等可传参）。
 *
 * 用法（替换 `@testing-library/react` 的 `render`）：
 * ```ts
 * import { renderWithTz } from "@/contexts/__tests__/test-utils"
 * import { screen } from "@testing-library/react"
 *
 * it("...", () => {
 *   renderWithTz(<TimeboxCard timebox={fixture} />)
 *   expect(screen.getByText("08:00")).toBeInTheDocument()
 * })
 *
 * // 跨 tz 测试
 * it("Tokyo 显示", () => {
 *   renderWithTz(<TimeboxCard timebox={fixture} />, { tz: "Asia/Tokyo" })
 *   ...
 * })
 * ```
 */

import { render, type RenderOptions, type RenderResult } from "@testing-library/react"
import { UserTimezoneProvider } from "../user-timezone-context"
import type { ReactElement } from "react"

export interface RenderWithTzOptions extends Omit<RenderOptions, "wrapper"> {
  /** 默认 'Asia/Shanghai'（与 MVP schema default 一致） */
  tz?: string
}

/**
 * render 时 wrap `<UserTimezoneProvider initialTz={tz}>`，避免每个测试手写。
 */
export function renderWithTz(
  ui: ReactElement,
  options: RenderWithTzOptions = {},
): RenderResult {
  const { tz = "Asia/Shanghai", ...renderOptions } = options
  return render(ui, {
    wrapper: ({ children }) => (
      <UserTimezoneProvider initialTz={tz}>{children}</UserTimezoneProvider>
    ),
    ...renderOptions,
  })
}