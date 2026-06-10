/**
 * @file thread-list-panel
 * @brief 主线列表面板组件
 *
 * 展示用户所有主线及任务计数，支持选中切换。
 * 顶部固定两个虚拟入口："全部任务"和"普通任务"。
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { ListTodo, FolderOpen, Folder, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getThreads, updateThreadStatus } from '@/app/actions/tasks'
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
}

// ─── 虚拟入口常量 ──────────────────────────────────────────────

/** "全部任务"虚拟主线 ID */
const ALL_ID = '__all__'

/** "无主线任务"虚拟主线 ID */
const ORPHAN_ID = '__orphan__'

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
}: ThreadListPanelProps) {
  const [threads, setThreads] = useState<ThreadWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [localRefreshKey, setLocalRefreshKey] = useState(0)

  /** 基于主线状态获取允许的操作项 */
  function getAllowedActions(status: string): Array<{ action: string; label: string }> {
    switch (status) {
      case 'active': return [{ action: 'pause', label: '暂停' }, { action: 'complete', label: '完成' }]
      case 'paused': return [{ action: 'resume', label: '恢复' }]
      case 'completed': return [{ action: 'archive', label: '归档' }]
      default: return []
    }
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
        if (!cancelled) setThreads([])
        toast.error('加载主线列表失败，请刷新重试')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [refreshKey, localRefreshKey])

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
                {/*
                  外层用 div + role="button" 避免嵌套 <button> 的 hydration 错误。
                  内层操作按钮通过 stopPropagation 阻止事件冒泡到外层。
                */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleClick(thread.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(thread.id) }}
                  onDoubleClick={() => onOpenThreadDetail?.(thread.id)}
                  className={cn(
                    'flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors group border-l-2 border-l-transparent cursor-pointer',
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

                  {/* "..." 下拉操作菜单 */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === thread.id ? null : thread.id) }}
                      className="p-1 rounded hover:bg-hover-overlay transition-colors text-muted hover:text-ink"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                    {menuOpen === thread.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                        <div className="absolute right-0 top-full mt-1 z-20 min-w-[100px] rounded-md border border-hairline bg-canvas shadow-md py-1">
                          {getAllowedActions(thread.status).map(act => (
                            <button
                              key={act.action}
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation()
                                setMenuOpen(null)
                                if (act.action === 'pause' || act.action === 'resume' || act.action === 'complete' || act.action === 'archive') {
                                  await updateThreadStatus(thread.id, act.action)
                                  toast.success(`${act.label}成功`)
                                  setLocalRefreshKey(k => k + 1)
                                }
                              }}
                              className="w-full px-3 py-1.5 text-xs text-left hover:bg-hover-overlay transition-colors"
                            >
                              {act.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </nav>
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
          <div className="size-4 rounded-sm bg-surface-soft" />
          <div className="flex-1 h-4 rounded bg-surface-soft" />
          <div className="w-6 h-3 rounded bg-surface-soft" />
        </div>
      ))}
    </div>
  )
}
