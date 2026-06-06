/**
 * @file thread-list-panel
 * @brief 主线列表面板组件
 *
 * 展示用户所有主线及任务计数，支持选中切换和筛选。
 * 顶部固定两个虚拟入口："全部任务"和"无主线任务"。
 * 底部提供清晰度和状态筛选（中文标签，本地状态管理）。
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { ListTodo, FolderOpen, Folder } from 'lucide-react'
import { toast } from 'sonner'
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
  /** 数据刷新计数器，变化时重新加载 */
  refreshKey?: number
  /** 当前清晰度筛选值 */
  filterClarity?: string[]
  /** 当前状态筛选值 */
  filterStatus?: string[]
  /** 筛选变更回调 */
  onFilterChange?: (key: 'clarity' | 'status', value: string) => void
}

// ─── 虚拟入口常量 ──────────────────────────────────────────────

/** "全部任务"虚拟主线 ID */
const ALL_ID = '__all__'

/** "无主线任务"虚拟主线 ID */
const ORPHAN_ID = '__orphan__'

// ─── 筛选标签映射 ──────────────────────────────────────────────

/** 清晰度 → 中文标签 */
const CLARITY_LABELS: Record<string, string> = {
  '': '全部',
  fuzzy: '模糊',
  scoped: '有范围',
  actionable: '可执行',
}

/** 清晰度选项 */
const CLARITY_OPTIONS = ['', 'fuzzy', 'scoped', 'actionable']

/** 状态 → 中文标签 */
const STATUS_LABELS: Record<string, string> = {
  '': '全部',
  todo: '待办',
  planned: '计划中',
  in_progress: '进行中',
  completed: '已完成',
  archived: '已归档',
}

/** 状态选项 */
const STATUS_OPTIONS = ['', 'todo', 'planned', 'in_progress', 'completed', 'archived']

// ─── 选中态样式 ────────────────────────────────────────────────

/** 选中主线项的高亮样式 */
const SELECTED_CLASS = 'bg-primary/8 border-l-2 border-l-primary'

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
  refreshKey = 0,
  filterClarity = [],
  filterStatus = [],
  onFilterChange,
}: ThreadListPanelProps) {
  const [threads, setThreads] = useState<ThreadWithCount[]>([])
  const [loading, setLoading] = useState(true)

  // ─── 数据加载 ────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const data = await getThreads()
        if (!cancelled) setThreads(data)
      } catch {
        if (!cancelled) setThreads([])
        toast.error('加载主线列表失败，请刷新重试')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [refreshKey])

  // ─── 合计计数 ────────────────────────────────────────────────

  const totalCount = threads.reduce((sum, t) => sum + t.taskCount, 0)

  // 点击处理
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
            'flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors border-l-2 border-l-transparent',
            'hover:bg-surface-soft',
            selectedThreadId === ALL_ID && SELECTED_CLASS,
          )}
        >
          <div className="flex-shrink-0">
            <ListTodo className="size-4 text-ink" />
          </div>
          <span className={cn(
            'flex-1 text-sm',
            selectedThreadId === ALL_ID ? 'text-ink font-medium' : 'text-body',
          )}>全部任务</span>
          <span className="text-xs text-muted">{totalCount}</span>
        </button>

        {/* ─── 无主线任务入口 ────────────────────────────────── */}
        <button
          type="button"
          onClick={() => handleClick(ORPHAN_ID)}
          className={cn(
            'flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors border-l-2 border-l-transparent',
            'hover:bg-surface-soft',
            selectedThreadId === ORPHAN_ID && SELECTED_CLASS,
          )}
        >
          <div className="flex-shrink-0">
            <FolderOpen className={cn(
              'size-4',
              selectedThreadId === ORPHAN_ID ? 'text-ink' : 'text-body',
            )} />
          </div>
          <span className={cn(
            'flex-1 text-sm',
            selectedThreadId === ORPHAN_ID ? 'text-ink font-medium' : 'text-body',
          )}>普通任务</span>
          <span className="text-xs text-muted-soft">—</span>
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
                    'flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors group border-l-2 border-l-transparent',
                    'hover:bg-surface-soft',
                    selectedThreadId === thread.id && SELECTED_CLASS,
                  )}
                >
                  {/* 文件夹图标 */}
                  <Folder
                    className="size-4 flex-shrink-0"
                    style={{ color: thread.color || 'var(--color-text-muted)' }}
                  />

                  {/* 名称 + 徽章 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        'text-sm truncate block',
                        selectedThreadId === thread.id ? 'text-ink font-medium' : 'text-body',
                      )}>
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

      {/* ═══ 底部筛选区域（复选框多选） ═══════════════════════ */}
      <footer className="border-t border-hairline-soft px-3 py-3 space-y-2.5">
        <div>
          <p className="text-[10px] text-body mb-1.5">清晰度</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {CLARITY_OPTIONS.filter(v => v !== '').map(v => (
              <label key={v} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterClarity.includes(v)}
                  onChange={() => onFilterChange?.('clarity', v)}
                  className="size-3.5 rounded accent-primary"
                />
                <span className="text-[11px] text-body">{CLARITY_LABELS[v]}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-body mb-1.5">状态</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {STATUS_OPTIONS.filter(v => v !== '').map(v => (
              <label key={v} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterStatus.includes(v)}
                  onChange={() => onFilterChange?.('status', v)}
                  className="size-3.5 rounded accent-primary"
                />
                <span className="text-[11px] text-body">{STATUS_LABELS[v]}</span>
              </label>
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
