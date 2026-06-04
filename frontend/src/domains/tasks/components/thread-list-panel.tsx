/**
 * @file thread-list-panel
 * @brief 主线列表面板组件
 *
 * 展示用户所有主线及任务计数，支持选中切换和筛选。
 * 顶部固定两个虚拟入口："全部任务"和"无主线任务"。
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ListTodo, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getThreads } from '@/app/actions/tasks'
import type { Thread } from '../../../usom/types/objects'

/** 带任务计数的 Thread 查询结果 */
interface ThreadWithCount {
  thread: Thread
  taskCount: number
  completedTaskCount: number
}

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

/**
 * ThreadListPanel 组件属性
 */
export interface ThreadListPanelProps {
  /** 当前选中的主线 ID（__all__ | __orphan__ | threadId） */
  selectedThreadId: string
  /** 选中主线回调 */
  onSelectThread: (threadId: string) => void
  /** 打开主线详情回调 */
  onOpenThreadDetail?: (threadId: string) => void
}

// ─── 虚拟入口常量 ──────────────────────────────────────────────

/** "全部任务"虚拟主线 ID */
const ALL_ID = '__all__'

/** "无主线任务"虚拟主线 ID */
const ORPHAN_ID = '__orphan__'

// ─── 组件 ──────────────────────────────────────────────────────

/**
 * 主线列表面板组件
 * @description 左侧面板，展示主线列表供用户筛选任务树
 * @param props - 组件属性
 */
export function ThreadListPanel({
  selectedThreadId,
  onSelectThread,
  onOpenThreadDetail,
}: ThreadListPanelProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const curClarity = searchParams.get('clarity') ?? ''
  const curStatus = searchParams.get('status') ?? ''

  const [threads, setThreads] = useState<ThreadWithCount[]>([])
  const [loading, setLoading] = useState(true)

  // ─── 筛选参数更新 ────────────────────────────────────────────

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/tasks?${params.toString()}`, { scroll: false })
  }

  // ─── 数据加载 ────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const data = await getThreads()
        if (!cancelled) setThreads(data)
      } catch {
        // 数据库不可用时静默降级
        if (!cancelled) setThreads([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  // ─── 合计计数 ────────────────────────────────────────────────

  const totalCount = threads.reduce((sum, t) => sum + t.taskCount, 0)
  const orphanCount = 0 // TODO: 单独查询无主线的任务数量

  // IItem 点击处理
  const handleClick = useCallback((threadId: string) => {
    onSelectThread(threadId)
  }, [onSelectThread])

  // ─── 渲染 ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* ═══ 列表区域 ═══════════════════════════════════════════ */}
      <nav className="flex-1 overflow-y-auto">

        {/* ─── 全部任务入口 ──────────────────────────────────── */}
        <button
          type="button"
          onClick={() => handleClick(ALL_ID)}
          className={cn(
            'flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors',
            'hover:bg-surface-soft',
            selectedThreadId === ALL_ID && 'bg-surface-soft',
          )}
        >
          <div className="flex-shrink-0 rounded border-l-4 border-transparent">
            <ListTodo className="size-4 text-ink" />
          </div>
          <span className="flex-1 text-sm font-medium text-ink">全部任务</span>
          <span className="text-xs text-muted">{totalCount}</span>
        </button>

        {/* ─── 无主线任务入口 ────────────────────────────────── */}
        <button
          type="button"
          onClick={() => handleClick(ORPHAN_ID)}
          className={cn(
            'flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors',
            'hover:bg-surface-soft',
            selectedThreadId === ORPHAN_ID && 'bg-surface-soft',
          )}
        >
          <div className="flex-shrink-0 rounded">
            <FolderOpen className="size-4 text-muted" />
          </div>
          <span className="flex-1 text-sm font-medium text-ink">无主线任务</span>
          <span className="text-xs text-muted">{orphanCount}</span>
        </button>

        {/* ─── 分隔线 ────────────────────────────────────────── */}
        <div className="mx-4 my-2 border-t border-hairline" />

        {/* ═══ 主线列表 ════════════════════════════════════════ */}
        {loading ? (
          <ThreadListSkeleton />
        ) : threads.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted">
            暂无主线，点击上方按钮创建
          </p>
        ) : (
          <ul className="flex flex-col">
            {threads.map(({ thread, taskCount }) => (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => handleClick(thread.id)}
                  onDoubleClick={() => onOpenThreadDetail?.(thread.id)}
                  className={cn(
                    'flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors group',
                    'hover:bg-surface-soft',
                    selectedThreadId === thread.id && 'bg-surface-soft',
                  )}
                >
                  {/* 颜色条 */}
                  <div
                    className="flex-shrink-0 w-1 h-6 rounded-full border-l-4"
                    style={{
                      borderColor: thread.color || 'var(--color-border)',
                    }}
                  />

                  {/* 名称 + 徽章 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-ink truncate block">
                        {thread.name}
                      </span>
                      {thread.status === 'paused' && (
                        <span className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-none bg-warning-soft text-warning">
                          暂停
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 任务计数 */}
                  <span className="flex-shrink-0 text-xs text-muted">
                    {taskCount}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      {/* ═══ 底部筛选区域 ═══════════════════════════════════ */}
      <footer className="border-t border-hairline-soft px-3 py-3 space-y-2">
        <div>
          <p className="text-[10px] text-muted-soft mb-1">clarity</p>
          <div className="flex flex-wrap gap-1">
            {['', 'fuzzy', 'scoped', 'actionable'].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => updateFilter('clarity', v)}
                className={cn(
                  'rounded px-2 py-0.5 text-[11px] transition-colors',
                  curClarity === v
                    ? 'bg-surface-cream-strong text-ink font-medium'
                    : 'text-muted hover:bg-surface-soft',
                )}
              >
                {v || '全部'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-muted-soft mb-1">status</p>
          <div className="flex flex-wrap gap-1">
            {['', 'todo', 'planned', 'in_progress', 'completed'].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => updateFilter('status', v)}
                className={cn(
                  'rounded px-2 py-0.5 text-[11px] transition-colors',
                  curStatus === v
                    ? 'bg-surface-cream-strong text-ink font-medium'
                    : 'text-muted hover:bg-surface-soft',
                )}
              >
                {v || '全部'}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}

// ─── 骨架屏 ────────────────────────────────────────────────────

/**
 * 主线列表加载骨架屏
 */
function ThreadListSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-4 animate-pulse">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-3 py-2.5">
          <div className="w-1 h-6 rounded-full bg-surface-soft" />
          <div className="flex-1 h-4 rounded bg-surface-soft" />
          <div className="w-6 h-3 rounded bg-surface-soft" />
        </div>
      ))}
    </div>
  )
}
