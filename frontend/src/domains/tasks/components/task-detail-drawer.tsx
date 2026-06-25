/**
 * @file task-detail-drawer
 * @brief 任务详情抽屉 — 右侧滑入，可拖拽宽度，A/B/C/D 自适应布局
 *
 * - 加载任务数据
 * - 加载中骨架屏 / 404 状态
 * - 可拖拽左边缘调整宽度（400-800px）
 * - <640px 只显示 A 区 + 展开按钮
 * - >=640px 显示 A + B + C + D 四区
 */

'use client'

import { useState, useEffect, useCallback, useRef, Fragment, useMemo } from 'react'
import { X, ChevronDown, ChevronRight, ArrowLeft, Zap, Maximize2 } from 'lucide-react'
import type { Task } from '../../../usom/types/objects'
import { getTaskById, getTaskAncestors, getThreadById } from '@/app/actions/tasks'
import type { USOM_ID } from '../../../usom/types/primitives'
import { TaskEditZone } from './task-edit-zone'
import { SystemCognitionPanel } from './system-cognition-panel'
import { SubtaskList } from './subtask-list'
import { TaskCompleteZone } from './task-complete-zone'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

// ─── 类型定义 ──────────────────────────────────────────────────────────

/** TaskDetailDrawer 组件 Props */
interface TaskDetailDrawerProps {
  /** 任务 ID */
  taskId: USOM_ID
  /** 当前用户 ID */
  userId: USOM_ID
  /** 关闭回调 */
  onClose: () => void
  /** 进入全屏模式回调 */
  onEnterFullscreen?: (taskId: string) => void
  /** 任务变更通知回调 */
  onTaskChanged?: () => void
  /** 子任务「+」→ 打开新建子任务抽屉（转发到页面） */
  onCreateSubtask?: (defaults: { parentId: string; title?: string }) => void
}

/** 抽屉宽度约束 */
const MIN_WIDTH = 400
const MAX_WIDTH = 800
const DEFAULT_WIDTH = 560

/**
 * 计算面包屑根节点标签。
 * - 有主线（hasThread）且取到名 → 主线名
 * - 有主线但未取名 → 兜底「主线」
 * - 无主线（普通任务）→ 「普通任务」
 */
export function rootBreadcrumbLabel(hasThread: boolean, threadName: string | null | undefined): string {
  if (hasThread) return threadName ?? '主线'
  return '普通任务'
}

/** 导航栈条目 */
interface NavEntry {
  taskId: string
  task: Task | null
  hasUnsavedChanges: boolean
}

// ─── 骨架屏 ─────────────────────────────────────────────────────────────

/** 加载中骨架屏 */
function DrawerSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-5 animate-pulse">
      <div className="h-8 w-3/4 rounded bg-surface-card" />
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-surface-card" />
        <div className="h-4 w-5/6 rounded bg-surface-card" />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-surface-card" />
        ))}
      </div>
      <div className="h-24 rounded bg-surface-card" />
      <div className="h-24 rounded bg-surface-card" />
    </div>
  )
}

// ─── 主组件 ─────────────────────────────────────────────────────────────

/**
 * 任务详情抽屉组件
 * @param props - 组件属性
 */
export function TaskDetailDrawer({
  taskId,
  userId,
  onClose,
  onEnterFullscreen,
  onTaskChanged,
  onCreateSubtask,
}: TaskDetailDrawerProps) {
  // ─── 导航栈 ──────────────────────────────────────────────────
  const [navStack, setNavStack] = useState<NavEntry[]>([{ taskId, task: null, hasUnsavedChanges: false }])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [ancestors, setAncestors] = useState<Array<{ id: string; title: string }>>([])
  const [rootLabel, setRootLabel] = useState('任务树')
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)

  /** 当前导航条目 */
  const currentEntry = navStack[navStack.length - 1]
  const currentTask = currentEntry?.task
  const currentTaskId = currentEntry?.taskId ?? taskId

  const [expanded, setExpanded] = useState(false) // 小屏展开完整详情

  // 拖拽宽度状态
  const [drawerWidth, setDrawerWidth] = useState(DEFAULT_WIDTH)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(DEFAULT_WIDTH)
  const drawerRef = useRef<HTMLDivElement>(null)

  // ─── 加载任务 ───
  const loadTask = useCallback(async (targetId: string) => {
    setLoading(true)
    setNotFound(false)
    try {
      const t = await getTaskById(targetId)
      if (!t) {
        setNotFound(true)
        setNavStack(prev => prev.map((e, i) => i === prev.length - 1 ? { ...e, task: null } : e))
      } else {
        setNavStack(prev => prev.map((e, i) => i === prev.length - 1 ? { ...e, task: t } : e))
        // 加载面包屑祖先
        const ancs = await getTaskAncestors(targetId)
        setAncestors(ancs)
        // 计算根节点标签
        if (t.threadId) {
          const th = await getThreadById(t.threadId as string)
          setRootLabel(rootBreadcrumbLabel(true, th?.name ?? null))
        } else {
          setRootLabel(rootBreadcrumbLabel(false, null))
        }
      }
    } catch {
      setNotFound(true)
      setNavStack(prev => prev.map((e, i) => i === prev.length - 1 ? { ...e, task: null } : e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTask(currentTaskId) }, [currentTaskId, loadTask])

  // ─── 拖拽调整宽度 ───
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = drawerWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [drawerWidth])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = startX.current - e.clientX
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta))
      setDrawerWidth(newWidth)
    }
    const handleMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // ─── 任务更新处理 ───
  const handleTaskUpdate = useCallback((updated: Task) => {
    setNavStack(prev => prev.map((e, i) =>
      i === prev.length - 1 ? { ...e, task: updated } : e
    ))
    onTaskChanged?.()
  }, [onTaskChanged])

  /** 脏状态变更回调 */
  const handleDirtyChange = useCallback((dirty: boolean) => {
    setNavStack(prev => prev.map((e, i) =>
      i === prev.length - 1 ? { ...e, hasUnsavedChanges: dirty } : e
    ))
  }, [])

  /** 导航栈最大深度 */
  const MAX_NAV_DEPTH = 10

  /** 导航到子任务（push），超出深度时裁剪最早条目 */
  const navigateToTask = useCallback((targetId: string) => {
    setNavStack(prev => {
      const next = [...prev, { taskId: targetId, task: null, hasUnsavedChanges: false }]
      return next.length > MAX_NAV_DEPTH ? next.slice(next.length - MAX_NAV_DEPTH) : next
    })
  }, [])

  /** 导航到面包屑祖先（pop 到栈中已有位置，避免重复加载） */
  const navigateToBreadcrumb = useCallback((targetId: string) => {
    setNavStack(prev => {
      const idx = prev.findIndex(e => e.taskId === targetId)
      // 栈中已有 → 截断到该位置
      if (idx >= 0) return prev.slice(0, idx + 1)
      // 栈中无此 ID（祖先链来自 getTaskAncestors）→ push
      const next = [...prev, { taskId: targetId, task: null, hasUnsavedChanges: false }]
      return next.length > MAX_NAV_DEPTH ? next.slice(next.length - MAX_NAV_DEPTH) : next
    })
  }, [])

  /** 面包屑元素（useMemo 避免内联 IIFE） */
  const breadcrumbItems = useMemo(() => {
    if (!currentTask) return []
    const reversed = [...ancestors].reverse()
    const items: React.ReactNode[] = [
      <button
        key="__root"
        type="button"
        onClick={onClose}
        className="text-body hover:text-ink transition-colors shrink-0"
      >
        {rootLabel}
      </button>,
    ]
    reversed.forEach((anc) => {
      items.push(
        <ChevronRight key={`sep-${anc.id}`} className="size-3 text-body/70 shrink-0" />,
        <button
          key={anc.id}
          type="button"
          onClick={() => navigateToBreadcrumb(anc.id)}
          className="text-body hover:text-ink transition-colors truncate max-w-[120px]"
          title={anc.title}
        >
          {anc.title}
        </button>,
      )
    })
    items.push(
      <ChevronRight key="sep-current" className="size-3 text-body/70 shrink-0" />,
      <span key="current" className="text-ink font-medium truncate max-w-[120px]" title={currentTask.title}>{currentTask.title}</span>,
    )
    return items
  }, [ancestors, currentTask, onClose, navigateToBreadcrumb, rootLabel])

  /** 关闭拦截 */
  const handleCloseAttempt = useCallback(() => {
    if (currentEntry?.hasUnsavedChanges) {
      setShowUnsavedDialog(true)
    } else {
      onClose()
    }
  }, [currentEntry, onClose])

  // ─── 关闭 ESC 快捷键 ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseAttempt()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleCloseAttempt])

  return (
    <>
      {/* ── 未保存修改确认 ── */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>未保存的修改</AlertDialogTitle>
            <AlertDialogDescription>
              关闭将丢失当前编辑内容，确认关闭？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowUnsavedDialog(false); onClose() }}>
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── 遮罩层 ── */}
      <div
        className="fixed inset-0 md:left-[260px] z-30 bg-scrim animate-in fade-in duration-200"
        onClick={handleCloseAttempt}
        aria-hidden="true"
      />

      {/* ── 抽屉主体 ── */}
      <div
        ref={drawerRef}
        className="fixed top-0 right-0 z-40 h-full bg-canvas border-l border-hairline shadow-xl flex flex-col animate-in slide-in-from-right duration-300"
        style={{ width: drawerWidth }}
        role="dialog"
        aria-modal="true"
        aria-label="任务详情"
        onClick={e => e.stopPropagation()}
      >
        {/* ── 拖拽手柄（左边缘）── */}
        <div
          className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-primary/20 active:bg-primary/40 transition-colors z-50"
          onMouseDown={handleMouseDown}
        />

        {/* ── 顶部操作栏 ── */}
        <div className="flex items-center justify-between shrink-0 px-5 py-3 border-b border-hairline-soft">
          <div className="flex items-center gap-1">
            {onEnterFullscreen && (
              <button
                type="button"
                onClick={() => onEnterFullscreen(currentTaskId)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-body/60 hover:text-ink hover:bg-hover-overlay transition-colors"
                title="全屏模式"
              >
                <Maximize2 className="size-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleCloseAttempt}
            className="rounded-md p-1 text-body/60 hover:text-ink hover:bg-hover-overlay transition-colors"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── 面包屑路径 ── */}
        {!loading && currentTask && breadcrumbItems.length > 0 && (
            <div className="flex items-center gap-1 shrink-0 px-5 py-2 border-b border-hairline-soft text-xs overflow-x-auto">
              {breadcrumbItems}
            </div>
        )}

        {/* ── 内容区域 ── */}
        <div className="flex-1 overflow-y-auto">
          {/* 加载中 */}
          {loading && <DrawerSkeleton />}

          {/* 404 */}
          {!loading && notFound && (
            <div className="flex flex-col items-center justify-center py-20 px-5 text-center">
              <p className="text-sm text-body/70-soft mb-4">任务不存在或已删除</p>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-md border border-hairline px-4 py-2 text-sm text-ink hover:bg-hover-overlay transition-colors"
              >
                <ArrowLeft className="size-4" />
                返回
              </button>
            </div>
          )}

          {/* 任务内容 */}
          {!loading && currentTask && (
            <div className="p-5 flex flex-col gap-5">
              {/* ── 事后补录横幅 ── */}
              {currentTask.captureMode === 'retrospective' && (
                <div className="mx-0 flex items-center gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info">
                  <Zap className="size-4 shrink-0" />
                  <span>事后补录模式 — 此任务为事后追加，请填写实际执行信息</span>
                </div>
              )}

              {/* ── A 区：任务编辑 ── */}
              <TaskEditZone task={currentTask} onTaskUpdate={handleTaskUpdate} onDirtyChange={handleDirtyChange} />

              {/* ── 小屏：展开按钮 ── */}
              <div className="block sm:hidden">
                {!expanded ? (
                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="flex items-center justify-center gap-1.5 w-full rounded-md border border-hairline py-2.5 text-sm text-ink hover:bg-hover-overlay transition-colors"
                  >
                    展开完整详情
                    <ChevronDown className="size-4" />
                  </button>
                ) : (
                  <div className="flex flex-col gap-5">
                    <SystemCognitionPanel task={currentTask} />
                    <SubtaskList
                      taskId={currentTask.id}
                      userId={userId}
                      onOpenTask={(id) => navigateToTask(id)}
                      onChanged={() => onTaskChanged?.()}
                      onOpenSubtaskCreate={(d) => onCreateSubtask?.(d)}
                    />
                    <TaskCompleteZone
                      task={currentTask}
                      userId={userId}
                      onTaskUpdate={handleTaskUpdate}
                    />
                  </div>
                )}
              </div>

              {/* ── 大屏：B/C/D 区完整展示 ── */}
              <div className="hidden sm:flex sm:flex-col sm:gap-5">
                {/* B 区：系统认知 */}
                <SystemCognitionPanel task={currentTask} />

                {/* C 区：子任务列表 */}
                <SubtaskList
                  taskId={currentTask.id}
                  userId={userId}
                  onOpenTask={(id) => navigateToTask(id)}
                  onChanged={() => onTaskChanged?.()}
                  onOpenSubtaskCreate={(d) => onCreateSubtask?.(d)}
                />

                {/* D 区：完成追踪 */}
                <TaskCompleteZone
                  task={currentTask}
                  userId={userId}
                  onTaskUpdate={handleTaskUpdate}
                />
              </div>
            </div>
          )}

          {/* ── 底部操作栏 ── */}
          {!loading && currentTask && (
            <div className="shrink-0 border-t border-hairline px-5 py-3 flex items-center justify-end">
              <Button variant="secondary" onClick={handleCloseAttempt}>
                关闭
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
