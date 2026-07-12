/**
 * @file user-timezone-context
 * @brief [TZ-2] 用户时区 React Context — 把 server-side getEffectiveTimezone 透传到显示端组件
 *
 * **设计意图**：
 *   - Server-side 在 `app/layout.tsx` 调 `getEffectiveTimezone(MVP_USER_ID)` 拿 user_tz
 *     （DB → 系统时区 → 'Asia/Shanghai' 三级 fallback，由 `@/lib/timezone-config` 提供）
 *   - 把结果通过 `<UserTimezoneProvider initialTz={tz}>` props 注入
 *   - 客户端组件调 `useUserTz()` 读 tz，**不再依赖浏览器本地时区或硬编码 Asia/Shanghai**
 *
 * **模式骨架**：抄 `app-context.tsx`（同目录已存在但未挂载的死代码模式）：
 *   - `createContext<T | null>(null)` + `if (!ctx) throw` 守卫（硬失败，避免 silent undefined）
 *   - Provider 在 layout 内层 wrap children（与 ThemeProvider / TooltipProvider 同层）
 *
 * **TZ-2 不做的事**（明确 out-of-scope）：
 *   - week-view / month-view react-big-calendar tz 注入（rbc API 不直接接受 tz prop，[TZ-2.1]）
 *   - localDayKey reconcile 调度接受 IANA TZ（[TZ-2.2]，[026] OQ-6）
 *   - 客户端实时 tz 切换（user 改 TimezonePicker 后整个 tree 重渲染；MVP 单用户 + 上海为主，
 *     layout server-side 拿一次即可；如需 client 实时切换可加 router.refresh() 触发 server re-render）
 */

"use client"

import { createContext, useContext } from "react"

/**
 * UserTimezoneContext 值
 *
 * 现阶段仅暴露 tz 字符串。后续如需暴露其他 user-level 配置（如 llmConfig、uiPrefs），
 * 可在此扩展；但 [TZ-2] 范围内只透传 tz。
 */
export interface UserTimezoneContextValue {
  /** IANA 时区字符串（如 'Asia/Shanghai' / 'Asia/Tokyo' / 'UTC'） */
  tz: string
}

const UserTimezoneContext = createContext<UserTimezoneContextValue | null>(null)

/**
 * [TZ-2] UserTimezoneProvider — 把 server-side 拉好的 tz 注入 client tree
 *
 * @param initialTz - server-side `getEffectiveTimezone(MVP_USER_ID)` 结果
 *
 * 客户端组件在 Provider 子树内调 `useUserTz()` 即可拿到 tz。
 */
export function UserTimezoneProvider({
  initialTz,
  children,
}: {
  initialTz: string
  children: React.ReactNode
}) {
  return (
    <UserTimezoneContext.Provider value={{ tz: initialTz }}>
      {children}
    </UserTimezoneContext.Provider>
  )
}

/**
 * [TZ-2] useUserTz — 在显示端组件中读取 user_tz
 *
 * 用法（典型）：
 * ```tsx
 * "use client"
 * import { useUserTz } from "@/contexts/user-timezone-context"
 *
 * export function TimeboxCard({ timebox }) {
 *   const { tz } = useUserTz()
 *   return <span>{isoToHhmmInUserTz(timebox.startTime, tz)}</span>
 * }
 * ```
 *
 * **守卫**：未在 `<UserTimezoneProvider>` 子树内调 → throw，避免 silent undefined
 *   导致组件意外显示错误时区。
 */
export function useUserTz(): UserTimezoneContextValue {
  const ctx = useContext(UserTimezoneContext)
  if (!ctx) {
    throw new Error(
      'useUserTz must be used within <UserTimezoneProvider>. ' +
      'Wrap your app root with <UserTimezoneProvider initialTz={...}>.',
    )
  }
  return ctx
}