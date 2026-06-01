"use client"

import { useState } from "react"
import { Plus, Check, Clock, ListTodo, X } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

interface QuickAction {
  label: string
  icon: React.ComponentType<{ className?: string }>
  domainId: string
  action: string
}

interface FabProps {
  quickActions?: QuickAction[]
  growthContent: React.ReactNode
  onAction: (domainId: string, action: string) => void
}

const DEFAULT_ACTIONS: QuickAction[] = [
  { label: "创建时间盒", icon: Clock, domainId: "timebox", action: "createTimebox" },
  { label: "打卡习惯", icon: Check, domainId: "habits", action: "checkinHabits" },
  { label: "新建任务", icon: ListTodo, domainId: "tasks", action: "createTask" },
]

export function Fab({ quickActions = DEFAULT_ACTIONS, growthContent, onAction }: FabProps) {
  const [expanded, setExpanded] = useState(false)
  const [growthOpen, setGrowthOpen] = useState(false)

  return (
    <>
      {/* 快捷菜单（FAB 展开时显示） */}
      {expanded && (
        <div className="fixed inset-0 z-overlay bg-scrim sm:hidden" onClick={() => setExpanded(false)}>
          <div className="absolute bottom-24 right-4 flex flex-col gap-2" onClick={e => e.stopPropagation()}>
            {quickActions.map(act => (
              <button
                key={act.action}
                type="button"
                onClick={() => { onAction(act.domainId, act.action); setExpanded(false) }}
                className="flex items-center gap-2 rounded-full bg-surface-card px-4 py-2.5 shadow-md text-sm text-ink active:bg-surface-cream-strong"
              >
                <act.icon className="size-4 text-primary" />
                {act.label}
              </button>
            ))}
            {/* 成长领域入口 */}
            <Sheet open={growthOpen} onOpenChange={setGrowthOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  onClick={() => { setGrowthOpen(true); setExpanded(false) }}
                  className="flex items-center gap-2 rounded-full bg-surface-card px-4 py-2.5 shadow-md text-sm text-ink active:bg-surface-cream-strong"
                >
                  <Plus className="size-4 text-primary rotate-45" />
                  成长领域
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[60vh] rounded-t-xl">
                <SheetHeader>
                  <SheetTitle>成长领域</SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto p-4">
                  {growthContent}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      )}

      {/* FAB 按钮 */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="fixed bottom-20 right-4 flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg active:bg-primary-active sm:hidden z-overlay"
        aria-label={expanded ? "关闭快捷菜单" : "打开快捷菜单"}
      >
        {expanded ? <X className="size-6" /> : <Plus className="size-6" />}
      </button>
    </>
  )
}
