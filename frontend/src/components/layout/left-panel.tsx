/**
 * @file left-panel
 * @brief 左侧面板组件
 * 
 * 提供 AI 助手和成长领域的 Tab 切换
 */

"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PanelTab } from "./main-view-state"

/**
 * LeftPanel 组件属性
 */
interface LeftPanelProps {
  /** 当前 Tab */
  activeTab: PanelTab
  /** Tab 变更回调 */
  onTabChange: (tab: PanelTab) => void
  /** 主页按钮点击回调 */
  onHomeClick: () => void
  /** 子内容 */
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

      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as PanelTab)}>
        <TabsList className="mx-3 mt-2 mb-1">
          {TABS.map(tab => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex-1 overflow-y-auto p-3">
        {children}
      </div>
    </aside>
  )
}
