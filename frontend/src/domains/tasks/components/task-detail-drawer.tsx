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

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, ExternalLink, ChevronDown, Loader2, ArrowLeft, Zap, Maximize2, Archive, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '../../../usom/types/objects'
import { getTaskById, deleteTask, archiveTask } from '@/app/actions/tasks'
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
}

/** 抽屉宽度约束 */
const MIN_WIDTH = 400
const MAX_WIDTH = 800
const DEFAULT_WIDTH = 560

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
}: TaskDetailDrawerProps) {
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [expanded, setExpanded] = useState(false) // 小屏展开完整详情

  // 拖拽宽度状态
  const [drawerWidth, setDrawerWidth] = useState(DEFAULT_WIDTH)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(DEFAULT_WIDTH)
  const drawerRef = useRef<HTMLDivElement>(null)

  // ─── 加载任务 ───
  const loadTask = useCallback(async () => {
    setLoading(true)
    setNotFound(false)
    try {
      const t = await getTaskById(taskId)
      if (!t) { setNotFound(true); setTask(null) }
      else setTask(t)
    } catch {
      setNotFound(true)
      setTask(null)
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => { loadTask() }, [loadTask])

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
    setTask(updated)
    onTaskChanged?.()
  }, [onTaskChanged])

  // ─── 关闭 ESC 快捷键 ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <>
      {/* ── 遮罩层 ── */}
      <div
        className="fixed inset-0 z-30 bg-scrim animate-in fade-in duration-200"
        onClick={onClose}
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
                onClick={() => onEnterFullscreen(taskId)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:text-ink hover:bg-hover-overlay transition-colors"
                title="全屏模式"
              >
                <Maximize2 className="size-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:text-ink hover:bg-hover-overlay transition-colors"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── 内容区域 ── */}
        <div className="flex-1 overflow-y-auto">
          {/* 加载中 */}
          {loading && <DrawerSkeleton />}

          {/* 404 */}
          {!loading && notFound && (
            <div className="flex flex-col items-center justify-center py-20 px-5 text-center">
              <p className="text-sm text-muted-soft mb-4">任务不存在或已删除</p>
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
          {!loading && task && (
            <div className="p-5 flex flex-col gap-5">
              {/* ── 事后补录横幅 ── */}
              {task.captureMode === 'retrospective' && (
                <div className="mx-0 flex items-center gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info">
                  <Zap className="size-4 shrink-0" />
                  <span>事后补录模式 — 此任务为事后追加，请填写实际执行信息</span>
                </div>
              )}

              {/* ── A 区：任务编辑 ── */}
              <TaskEditZone task={task} onTaskUpdate={handleTaskUpdate} />

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
                    <SystemCognitionPanel task={task} />
                    <SubtaskList
                      taskId={task.id}
                      userId={userId}
                      onOpenTask={(id) => { /* 在小屏中替换当前抽屉内容 */ }}
                    />
                    <TaskCompleteZone
                      task={task}
                      userId={userId}
                      onTaskUpdate={handleTaskUpdate}
                    />
                  </div>
                )}
              </div>

              {/* ── 大屏：B/C/D 区完整展示 ── */}
              <div className="hidden sm:flex sm:flex-col sm:gap-5">
                {/* B 区：系统认知 */}
                <SystemCognitionPanel task={task} />

                {/* C 区：子任务列表 */}
                <SubtaskList
                  taskId={task.id}
                  userId={userId}
                  onOpenTask={() => {}}
                />

                {/* D 区：完成追踪 */}
                <TaskCompleteZone
                  task={task}
                  userId={userId}
                  onTaskUpdate={handleTaskUpdate}
                />
              </div>
            </div>
          )}

          {/* ── 底部操作栏 ── */}
          {!loading && task && (
            <div className="shrink-0 border-t border-hairline px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await archiveTask(taskId)
                      onTaskChanged?.()
                      onClose()
                      toast.success('任务已归档')
                    } catch {
                      toast.error('归档失败，请重试')
                    }
                  }}
                >
                  <Archive className="size-3.5 mr-1" />
                  归档
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-error hover:text-error">
                      <Trash2 className="size-3.5 mr-1" />
                      彻底删除
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认彻底删除</AlertDialogTitle>
                      <AlertDialogDescription>
                        此操作不可撤销，任务将被永久删除。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            await deleteTask(taskId)
                            onTaskChanged?.()
                            onClose()
                            toast.success('任务已删除')
                          } catch {
                            toast.error('删除失败，请重试')
                          }
                        }}
                      >
                        确认删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <Button variant="secondary" onClick={onClose}>
                关闭
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
