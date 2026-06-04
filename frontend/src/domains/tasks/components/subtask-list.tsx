/**
 * @file subtask-list
 * @brief C 区 — 子任务列表
 *
 * 展示当前任务的子任务，按状态排序，含进度条、行列表、添加子任务输入。
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Loader2, ChevronRight, Circle, CircleDot, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSubtasks, createTask } from '@/app/actions/tasks'
import type { Task } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'

// ─── 类型定义 ──────────────────────────────────────────────────────────

/** SubtaskList 组件 Props */
interface SubtaskListProps {
  /** 当前任务 ID */
  taskId: USOM_ID
  /** 当前用户 ID */
  userId: USOM_ID
  /** 打开子任务详情回调 */
  onOpenTask: (taskId: USOM_ID) => void
}

// ─── 常量 ──────────────────────────────────────────────────────────────

/** 状态排序权重（越小越靠前） */
const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  planned: 1,
  todo: 2,
  completed: 3,
  archived: 4,
}

/** 状态显示标签 */
const STATUS_LABELS: Record<string, string> = {
  in_progress: '进行中',
  planned: '已计划',
  todo: '待办',
  completed: '已完成',
  archived: '已归档',
}

/** 状态对应的图标 */
function StatusIcon({ status, className }: { status: string; className?: string }) {
  switch (status) {
    case 'completed': return <CheckCircle2 className={cn('size-3.5 text-success', className)} />
    case 'in_progress': return <CircleDot className={cn('size-3.5 text-primary', className)} />
    default: return <Circle className={cn('size-3.5 text-muted-soft', className)} />
  }
}

/** 优先级标签 */
const PRIORITY_LABELS: Record<string, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
}

// ─── 组件 ──────────────────────────────────────────────────────────────

/**
 * C 区 — 子任务列表组件
 * @param props - 组件属性
 */
export function SubtaskList({ taskId, userId, onOpenTask }: SubtaskListProps) {
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)

  /** 加载子任务 */
  const loadSubtasks = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getSubtasks(taskId)
      // 按状态排序：in_progress > planned > todo > completed > archived
      list.sort((a, b) => {
        const orderA = STATUS_ORDER[a.status] ?? 5
        const orderB = STATUS_ORDER[b.status] ?? 5
        return orderA - orderB
      })
      setSubtasks(list)
    } catch {
      setSubtasks([])
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    loadSubtasks()
  }, [loadSubtasks])

  /** 添加子任务 */
  const handleAdd = useCallback(async () => {
    const title = newTitle.trim()
    if (!title) return
    setAdding(true)
    try {
      await createTask({
        title,
        parentId: taskId,
        threadId: undefined,
      })
      setNewTitle('')
      await loadSubtasks()
    } finally {
      setAdding(false)
    }
  }, [newTitle, taskId, loadSubtasks])

  const completedCount = subtasks.filter(t => t.status === 'completed').length
  const total = subtasks.length
  const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0

  return (
    <div className="rounded-lg border border-hairline bg-surface-soft p-4">
      {/* ── 标题 + 进度 ── */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink">子任务</h3>
        {total > 0 && (
          <span className="text-xs text-muted-soft">
            已完成 {completedCount} / {total}
          </span>
        )}
      </div>

      {/* ── 进度条 ── */}
      {total > 0 && (
        <div className="mb-3 h-1.5 rounded-full bg-surface-card overflow-hidden">
          <div
            className="h-full rounded-full bg-success transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* ── 加载状态 ── */}
      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-4 animate-spin text-muted-soft" />
        </div>
      )}

      {/* ── 空状态 ── */}
      {!loading && total === 0 && (
        <p className="py-2 text-xs text-muted-soft text-center">暂无子任务</p>
      )}

      {/* ── 子任务行 ── */}
      {!loading && total > 0 && (
        <div className="flex flex-col gap-0.5 mb-3 max-h-64 overflow-y-auto">
          {subtasks.map(sub => (
            <button
              key={sub.id}
              type="button"
              onClick={() => onOpenTask(sub.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                'hover:bg-hover-overlay',
                sub.status === 'completed' && 'opacity-60',
              )}
            >
              <StatusIcon status={sub.status} />
              <span className={cn(
                'text-sm text-ink flex-1 truncate',
                sub.status === 'completed' && 'line-through',
              )}>
                {sub.title}
              </span>
              <span className="text-[10px] text-muted-soft shrink-0">
                {STATUS_LABELS[sub.status] ?? sub.status}
                {sub.priority === 'critical' && ' · 紧急'}
              </span>
              <ChevronRight className="size-3 text-muted-soft shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* ── 添加子任务输入 ── */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() } }}
          disabled={adding}
          placeholder="+ 添加子任务"
          className="h-8 flex-1 rounded-md border border-hairline bg-canvas px-3 text-xs text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || !newTitle.trim()}
          className="h-8 w-8 flex items-center justify-center rounded-md bg-primary text-on-primary hover:bg-primary-active disabled:opacity-40 transition-colors shrink-0"
        >
          {adding ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}
