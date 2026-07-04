/**
 * @file main-view-state
 * @brief 主视图状态类型（[023.03] T4：type 'schedule' 内部语义 = "timeboxes workspace"）
 *
 * [023.03] T4：route /schedule → /timeboxes 重命名。
 * - 主页 app/page.tsx 整页 redirect 到 /timeboxes，不再使用 type: 'schedule'
 *   的 MainViewState 路径。
 * - type 字面量保留为 'schedule'（spec OQ 未决议，沿用最小变更原则）。
 *   内部语义 = "timeboxes workspace 视图"；URL 路由不再在此 type 中体现。
 * - 后续清理：可在 T5+ 跟进把 type 重命名为 'timeboxes'，但需协调
 *   appShell.currentViewType / handleHomeClick 等引用方。
 */

import type { DateViewMode } from "@/domains/timebox/components/types"
import type { HabitFormFields } from "@/domains/habits/components/habit-form"

export type MainViewState =
  | { type: 'schedule'; date: Date; viewMode: DateViewMode }
  | { type: 'conversation'; sessionId: string }
  | { type: 'action'; domainId: string; action: string; initialFields?: Partial<HabitFormFields> }
  | { type: 'settings'; section?: 'general' | 'llm' | 'timezone' | 'templates' }

export type PanelTab = 'assistant' | 'growth'

export interface SplitWith {
  mode: 'form' | 'markdown'
  domainId: string
  action: string
  fields?: Record<string, unknown>
  content?: string
}
