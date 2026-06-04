/**
 * @file TaskDetailPage
 * @brief 任务详情独立全屏页面
 *
 * 从 URL 获取任务 ID，加载任务数据，展示四区布局：
 * - A 区：任务信息编辑（TaskEditZone）
 * - B 区：系统认知面板（SystemCognitionPanel）
 * - C 区：子任务列表（SubtaskList）
 * - D 区：任务完成/追踪（TaskCompleteZone）
 *
 * 布局：顶部导航栏 + 面包屑 + A+B(3:2)并排 + C 区 + D 区
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Archive, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '../../../usom/types/objects'
import { TaskRepository } from '../../tasks/repository/task'
import type { USOM_ID } from '../../../usom/types/primitives'
import { TaskEditZone } from '../../tasks/components/task-edit-zone'
import { SystemCognitionPanel } from '../../tasks/components/system-cognition-panel'
import { SubtaskList } from '../../tasks/components/subtask-list'
import { TaskCompleteZone } from '../../tasks/components/task-complete-zone'

// ─── 骨架屏 ─────────────────────────────────────────────────────────────

/** 页面加载骨架屏 */
function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* 面包屑骨架 */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-8 rounded bg-surface-card" />
        <div className="h-4 w-16 rounded bg-surface-card" />
        <div className="h-4 w-32 rounded bg-surface-card" />
      </div>

      {/* A+B 骨架 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
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
        </div>
        <div className="lg:col-span-2">
          <div className="h-40 rounded bg-surface-card" />
        </div>
      </div>

      {/* C/D 骨架 */}
      <div className="h-32 rounded bg-surface-card" />
      <div className="h-32 rounded bg-surface-card" />
    </div>
  )
}

// ─── 主组件 ─────────────────────────────────────────────────────────────

/**
 * 任务详情全屏页面组件
 * @description 从 /tasks/[id] 路由渲染，展示完整任务详情
 */
export default function TaskDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const taskId = params.id as USOM_ID

  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const repo = useMemo(() => new TaskRepository(), [])
  const userId = 'placeholder' as USOM_ID

  // ─── 加载任务 ───
  const loadTask = useCallback(async () => {
    setLoading(true)
    setNotFound(false)
    try {
      const t = await repo.findById(taskId, userId)
      if (!t) { setNotFound(true); setTask(null) }
      else setTask(t)
    } catch {
      setNotFound(true)
      setTask(null)
    } finally {
      setLoading(false)
    }
  }, [taskId, userId, repo])

  useEffect(() => { loadTask() }, [loadTask])

  // ─── 任务更新回调 ───
  const handleTaskUpdate = useCallback((updated: Task) => {
    setTask(updated)
  }, [])

  // ─── 归档操作 ───
  const handleArchive = useCallback(async () => {
    if (!task) return
    setArchiving(true)
    try {
      await repo.archive(task.id, userId)
      setTask(prev => prev ? { ...prev, status: 'archived' as const } : prev)
    } finally {
      setArchiving(false)
    }
  }, [task, userId, repo])

  // ─── 面包屑 ───
  const breadcrumb = useMemo(() => {
    const parts = ['任务']
    // TODO: 当主线数据可用时，加载主线名称替换 '主线'
    if (task?.threadId) parts.push('主线')
    if (task?.title) parts.push(task.title)
    return parts
  }, [task])

  // ─── 404 状态 ───
  if (!loading && notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-lg text-muted-soft mb-4">任务不存在或已删除</p>
        <button
          type="button"
          onClick={() => router.push('/tasks')}
          className="flex items-center gap-1.5 rounded-md border border-hairline px-4 py-2 text-sm text-ink hover:bg-hover-overlay transition-colors"
        >
          <ArrowLeft className="size-4" />
          返回任务列表
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      {/* ── 顶部导航栏 ── */}
      <div className="flex items-center justify-between mb-6">
        {/* 左侧：返回 + 面包屑 */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/tasks')}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-soft hover:text-ink hover:bg-hover-overlay transition-colors"
          >
            <ArrowLeft className="size-4" />
            返回
          </button>

          <nav className="hidden sm:flex items-center gap-1.5 text-sm text-muted-soft">
            {breadcrumb.map((part, idx) => (
              <span key={idx} className="flex items-center gap-1.5">
                {idx > 0 && <span className="text-hairline">/</span>}
                <span className={cn(idx === breadcrumb.length - 1 && 'text-ink font-medium')}>
                  {part}
                </span>
              </span>
            ))}
          </nav>
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-2">
          {task && task.status !== 'archived' && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={archiving}
              className="flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-xs text-muted-soft hover:text-ink hover:bg-hover-overlay disabled:opacity-50 transition-colors"
            >
              <Archive className="size-3.5" />
              {archiving ? '归档中…' : '归档'}
            </button>
          )}
        </div>
      </div>

      {/* ── 内容区域 ── */}
      {loading ? (
        <PageSkeleton />
      ) : task ? (
        <div className="space-y-6">
          {/* ── A+B 并排（3:2 比例） ── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* A 区：任务信息编辑 */}
            <div className="lg:col-span-3">
              <TaskEditZone task={task} repo={repo} onTaskUpdate={handleTaskUpdate} />
            </div>

            {/* B 区：系统认知面板 */}
            <div className="lg:col-span-2">
              <SystemCognitionPanel task={task} />
            </div>
          </div>

          {/* C 区：子任务列表 */}
          <SubtaskList
            taskId={task.id}
            userId={userId}
            repo={repo}
            onOpenTask={(id) => router.push(`/tasks/${id}`)}
          />

          {/* D 区：任务完成/追踪 */}
          <TaskCompleteZone
            task={task}
            userId={userId}
            repo={repo}
            onTaskUpdate={handleTaskUpdate}
          />
        </div>
      ) : null}
    </div>
  )
}
