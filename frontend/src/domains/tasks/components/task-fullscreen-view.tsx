/**
 * @file task-fullscreen-view
 * @brief 任务详情全屏视图 — 替换主内容区显示
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getTaskById } from '@/app/actions/tasks'
import type { Task } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import { TaskEditZone } from './task-edit-zone'
import { SystemCognitionPanel } from './system-cognition-panel'
import { SubtaskList } from './subtask-list'
import { TaskCompleteZone } from './task-complete-zone'

// ─── 类型定义 ─────────────────────────────────────────────────────────────

/**
 * TaskFullscreenView 组件属性
 */
interface TaskFullscreenViewProps {
  /** 任务 ID */
  taskId: string
  /** 当前用户 ID */
  userId: USOM_ID
  /** 返回回调 */
  onBack: () => void
  /** 任务变更通知回调 */
  onTaskChanged?: () => void
}

// ─── 主组件 ─────────────────────────────────────────────────────────────

/**
 * 任务详情全屏视图
 * @description 在主内容区内展示完整任务详情
 */
export function TaskFullscreenView({ taskId, userId, onBack, onTaskChanged }: TaskFullscreenViewProps) {
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const t = await getTaskById(taskId)
        if (!cancelled) setTask(t)
      } catch {
        if (!cancelled) setTask(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [taskId])

  const handleTaskUpdate = useCallback((updated: Task) => {
    setTask(updated)
    onTaskChanged?.()
  }, [onTaskChanged])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted">
        <p className="text-sm mb-4">任务不存在</p>
        <Button variant="secondary" onClick={onBack}>返回任务树</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 */}
      <div className="shrink-0 flex items-center gap-3 px-6 py-3 border-b border-hairline">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" />
          返回任务树
        </Button>
        <span className="text-sm font-medium text-ink truncate">{task.title}</span>
      </div>

      {/* 详情内容 */}
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
        <div className="flex flex-col gap-6">
          <TaskEditZone task={task} onTaskUpdate={handleTaskUpdate} />
          <SystemCognitionPanel task={task} />
          <SubtaskList
            taskId={task.id}
            userId={userId}
            onOpenTask={() => {}}
          />
          <TaskCompleteZone
            task={task}
            userId={userId}
            onTaskUpdate={handleTaskUpdate}
          />
        </div>
      </div>
    </div>
  )
}
