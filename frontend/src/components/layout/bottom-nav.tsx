"use client"

import { Home, MessageSquare, Settings } from "lucide-react"
import type { MainViewState } from "@/components/layout/main-view-state"

interface BottomNavProps {
  currentView: MainViewState['type']
  onNavigate: (view: MainViewState) => void
}

const NAV_ITEMS = [
  { key: 'schedule' as const, label: '首页', icon: Home },
  { key: 'conversation' as const, label: '对话', icon: MessageSquare },
  { key: 'settings' as const, label: '设置', icon: Settings },
]

export function BottomNav({ currentView, onNavigate }: BottomNavProps) {
  return (
    <nav
      className="flex items-center justify-around border-t border-hairline bg-canvas px-2 pb-[env(safe-area-inset-bottom)] sm:hidden"
      role="navigation"
      aria-label="底部导航"
    >
      {NAV_ITEMS.map(item => {
        const isActive = currentView === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              if (item.key === 'schedule') onNavigate({ type: 'schedule', date: new Date(), viewMode: 'day' })
              else if (item.key === 'settings') onNavigate({ type: 'settings' })
              else onNavigate({ type: 'conversation', sessionId: '' })
            }}
            className={`flex flex-col items-center gap-0.5 px-4 py-2 min-h-[44px] ${
              isActive ? 'text-primary' : 'text-muted-foreground'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            <item.icon className="size-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
