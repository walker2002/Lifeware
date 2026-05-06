"use client"

import type { ViewMode } from "./types"

interface ViewModeToggleProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
}

/**
 * ViewModeToggle — 今日模式/日历模式切换
 *
 * 使用 DESIGN.md category-tab 样式。
 */
export function ViewModeToggle({ mode, onModeChange }: ViewModeToggleProps) {
  return (
    <div className="flex gap-1 rounded-md bg-surface-soft p-1">
      <button
        type="button"
        onClick={() => onModeChange("today")}
        className={`rounded-sm px-3 py-1 text-sm font-medium transition-colors ${
          mode === "today"
            ? "bg-surface-card text-ink shadow-sm"
            : "text-body hover:text-ink"
        }`}
      >
        今日模式
      </button>
      <button
        type="button"
        onClick={() => onModeChange("calendar")}
        className={`rounded-sm px-3 py-1 text-sm font-medium transition-colors ${
          mode === "calendar"
            ? "bg-surface-card text-ink shadow-sm"
            : "text-body hover:text-ink"
        }`}
      >
        日历模式
      </button>
    </div>
  )
}
