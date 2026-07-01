/**
 * @file fab
 * @brief 浮动操作按钮组件
 *
 * 提供快速创建和展开的浮动操作按钮。
 *
 * [023-01] Task 8：label 在渲染期**同步**通过 `getActionDescription`（registry.ts:120）
 * 读取 manifest.description；如未读到则用 `FALLBACK_LABEL` 兜底。**禁用 useState/useEffect
 * 异步化**——`getActionDescription` 是同步函数（读已加载 manifest 缓存，无 IO），
 * 异步化属过度设计（plan autoplan H-3 共识修订）。
 *
 * SSOT：FALLBACK_LABEL 是「manifest 拿不到」时的最后一道兜底；正常路径全靠 manifest。
 */

"use client"

import { useState } from "react"
import { Plus, Check, Clock, ListTodo, X } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { getActionDescription } from "@/domains/registry"

/**
 * 快捷操作项（外部传入）
 */
interface QuickAction {
  /** 显示标签（可选；缺省时渲染期同步算） */
  label?: string
  /** 图标组件 */
  icon: React.ComponentType<{ className?: string }>
  /** 域 ID */
  domainId: string
  /** 动作名称 */
  action: string
}

/**
 * 解析后的快捷操作项（label 必填，渲染期同步确定）
 */
interface ResolvedAction {
  label: string
  icon: React.ComponentType<{ className?: string }>
  domainId: string
  action: string
}

/**
 * Fab 组件属性
 */
interface FabProps {
  /** 快捷操作列表（外部可覆盖 label） */
  quickActions?: QuickAction[]
  /** 成长内容 */
  growthContent: React.ReactNode
  /** 操作回调 */
  onAction: (domainId: string, action: string) => void
}

/**
 * manifest 拿不到 description 时的兜底中文 label
 * （Key 为 action 名）
 */
const FALLBACK_LABEL: Record<string, string> = {
  createTimebox: "创建时间盒",
  checkinHabits: "打卡习惯",
  createTask: "新建任务",
}

/**
 * 默认快捷操作（不含 label——label 渲染期同步算）
 *
 * codemod 注解：如有新增预设动作，需同时在 FALLBACK_LABEL 加兜底项。
 */
const DEFAULT_ACTIONS: ReadonlyArray<QuickAction> = [
  { icon: Clock, domainId: "timebox", action: "createTimebox" },
  { icon: Check, domainId: "habits", action: "checkinHabits" },
  { icon: ListTodo, domainId: "tasks", action: "createTask" },
]

/**
 * 渲染期同步算 label（getActionDescription 是同步函数，无 IO / 无 hydration 风险）
 *
 * 优先级：外部 prop.label > manifest.description > FALLBACK_LABEL > action 名
 *
 * @param a - 域 + 动作
 * @param fallback - 该 action 的兜底文案
 * @returns 最终显示的 label
 */
function resolveLabel(a: { action: string; domainId: string }, fallback: string): string {
  try {
    return getActionDescription(a.domainId, a.action) || fallback
  } catch {
    return fallback
  }
}

export function Fab({ quickActions, growthContent, onAction }: FabProps) {
  const [expanded, setExpanded] = useState(false)
  const [growthOpen, setGrowthOpen] = useState(false)

  // 同步解析：每次渲染都重算（纯函数 + 无副作用，无性能负担）
  const resolvedActions: ResolvedAction[] = (quickActions ?? DEFAULT_ACTIONS).map(a => ({
    ...a,
    label: a.label ?? resolveLabel(a, FALLBACK_LABEL[a.action] ?? a.action),
    icon: a.icon,
  }))

  return (
    <>
      {/* 快捷菜单（FAB 展开时显示） */}
      {expanded && (
        <div className="fixed inset-0 z-overlay bg-scrim sm:hidden" onClick={() => setExpanded(false)}>
          <div className="absolute bottom-24 right-4 flex flex-col gap-2" onClick={e => e.stopPropagation()}>
            {resolvedActions.map(act => (
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
