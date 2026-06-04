/**
 * @file ThreadDetailPage
 * @brief 主线详情独立全屏页面
 *
 * 从 URL 获取主线 ID，加载主线数据及任务树，展示：
 * - 面包屑导航 + 状态操作按钮
 * - 主线信息头部（颜色、名称、状态、日期、描述）
 * - 概览统计（任务总数、已完成、完成率）
 * - 任务树视图
 */

'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Pause, Play, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getThreadById, getThreadWithCount, updateThreadStatus } from '@/app/actions/tasks'
import { TaskTreeView } from '../components/task-tree-view'
import type { Thread } from '../../../usom/types/objects'

/** 带任务计数的 Thread 查询结果 */
interface ThreadWithCount {
  thread: Thread
  taskCount: number
  completedTaskCount: number
}

/**
 * 主线详情页组件
 * @description 主线信息 + 概览统计 + 关联任务列表
 */
export default function ThreadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [thread, setThread] = useState<Thread | null>(null)
  const [counts, setCounts] = useState<ThreadWithCount | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const t = await getThreadById(id)
      if (!t) { setLoading(false); return }
      setThread(t)
      const wc = await getThreadWithCount(id)
      setCounts(wc)
      setLoading(false)
    }
    load()
  }, [id])

  const handleStatusChange = async (newStatus: Thread['status']) => {
    const updated = await updateThreadStatus(thread!.id, newStatus)
    setThread(updated)
  }

  // ─── 加载中 ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6">
        <div className="h-10 w-64 bg-surface-soft animate-pulse rounded" />
      </div>
    )
  }

  // ─── 404 ──────────────────────────────────────────────────────────────
  if (!thread) {
    return (
      <div className="p-6">
        <p className="text-muted">主线不存在或已删除</p>
        <Button
          variant="secondary"
          onClick={() => router.back()}
          className="mt-4"
        >
          <ArrowLeft className="size-4 mr-1" />
          返回
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
      {/* ═══ 面包屑 + 操作 ═══════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-muted hover:text-ink flex items-center gap-1"
        >
          <ArrowLeft className="size-4" />
          返回任务列表
        </button>
        <div className="flex items-center gap-1">
          {thread.status === 'active' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleStatusChange('paused')}
            >
              <Pause className="size-3.5 mr-1" />
              暂停
            </Button>
          )}
          {thread.status === 'paused' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleStatusChange('active')}
            >
              <Play className="size-3.5 mr-1" />
              恢复
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label="更多">
            <MoreHorizontal className="size-4" />
          </Button>
        </div>
      </div>

      {/* ═══ 主线信息头部 ════════════════════════════════════════════ */}
      <div className="flex items-start gap-4">
        <span
          className="w-10 h-10 rounded-lg shrink-0"
          style={{ backgroundColor: thread.color ?? '#3498DB' }}
        />
        <div>
          <h1 className="text-2xl font-display font-medium text-ink">
            {thread.name}
          </h1>
          <p className="text-sm text-muted mt-1">
            {thread.status} · {thread.priority ?? '默认'} ·{' '}
            {thread.startDate ?? '未设置'} — {thread.endDate ?? '未设置'}
          </p>
          {thread.description && (
            <p className="text-sm text-body mt-2">{thread.description}</p>
          )}
        </div>
      </div>

      {/* ═══ 概览统计 ════════════════════════════════════════════════ */}
      {counts && (
        <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-surface-soft">
          <div>
            <p className="text-2xl font-semibold text-ink">
              {counts.taskCount}
            </p>
            <p className="text-xs text-muted">任务总数</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-ink">
              {counts.completedTaskCount}
            </p>
            <p className="text-xs text-muted">已完成</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-ink">
              {counts.taskCount > 0
                ? Math.round((counts.completedTaskCount / counts.taskCount) * 100)
                : 0}
              %
            </p>
            <p className="text-xs text-muted">完成率</p>
          </div>
        </div>
      )}

      {/* ═══ 任务树 ══════════════════════════════════════════════════ */}
      <div className="border-t border-hairline pt-4">
        <h2 className="text-base font-semibold text-ink mb-2">任务列表</h2>
        <TaskTreeView
          threadId={id}
          onOpenTaskDetail={(tid) => router.push('/tasks/' + tid)}
        />
      </div>
    </div>
  )
}
