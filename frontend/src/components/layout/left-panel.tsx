"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"
import type { PanelTab } from "./main-view-state"

interface LeftPanelProps {
  activeTab: PanelTab
  onTabChange: (tab: PanelTab) => void
  onHomeClick: () => void
  children: ReactNode
}

const TABS: { key: PanelTab; label: string }[] = [
  { key: 'assistant', label: 'AI 助手' },
  { key: 'growth', label: '成长领域' },
]

export function LeftPanel({ activeTab, onTabChange, onHomeClick, children }: LeftPanelProps) {
  return (
    <aside
      className="flex h-full w-80 flex-col border-r border-hairline bg-canvas"
      role="complementary"
      aria-label="导航面板"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onHomeClick}
          aria-label="回到主页"
          className="shrink-0"
        >
          <Home className="size-4 text-body" />
        </Button>
        <span className="text-sm font-medium text-ink">Home</span>
      </div>

      <div className="flex gap-1 px-3 py-2 border-b border-hairline">
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`flex-1 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-body hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {children}
      </div>
    </aside>
  )
}
