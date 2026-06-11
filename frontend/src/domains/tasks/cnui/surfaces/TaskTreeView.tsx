/**
 * @file TaskTreeViewCard
 * @brief 任务树查看 CNUI Surface
 *
 * CN-UI 表面 — 纯展示任务树，含搜索过滤和展开/收起功能。
 * 永不过期，总是显示当前数据库查找结果。
 */

'use client'

import { useState, useMemo } from 'react'
import { Search, ChevronRight, ChevronDown, Check, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 任务树节点类型 */
interface TreeNode {
  id: string
  title: string
  status: string
  kind: 'thread' | 'task'
  parentId?: string | null
  threadId?: string | null
  estimatedDuration?: number | null
  priority?: string | null
  startDate?: string | null
}

/** TaskTreeViewCard 组件属性 */
interface TaskTreeViewCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

export function TaskTreeViewCard({
  dataModel,
  onDataChange,
  onConfirm,
  onCancel,
  isLoading,
  isDone,
}: TaskTreeViewCardProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'title' | 'startDate'>('title')
  const [sortAsc, setSortAsc] = useState(true)
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const threads = (dataModel.threads as Array<{ id: string; name: string; color: string; status: string }>) ?? []
  const tasks = (dataModel.tasks as TreeNode[]) ?? []

  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads
    const q = searchQuery.trim().toLowerCase()
    const matchingTaskThreadIds = new Set(
      tasks.filter(t =>
        t.title.toLowerCase().includes(q) || t.id.includes(q)
      ).map(t => t.threadId).filter(Boolean)
    )
    return threads.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.id.includes(q) ||
      matchingTaskThreadIds.has(t.id)
    )
  }, [threads, tasks, searchQuery])

  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks
    const q = searchQuery.trim().toLowerCase()
    return tasks.filter(t =>
      t.title.toLowerCase().includes(q) || t.id.includes(q)
    )
  }, [tasks, searchQuery])

  function getThreadTasks(threadId: string) {
    let result = filteredTasks.filter(t => t.threadId === threadId && !t.parentId)

    // 状态筛选
    if (statusFilter !== 'all') {
      result = result.filter(t => t.status === statusFilter)
    }

    // 排序
    result.sort((a, b) => {
      const cmp = sortBy === 'title'
        ? a.title.localeCompare(b.title)
        : (a.startDate ?? '').localeCompare(b.startDate ?? '')
      return sortAsc ? cmp : -cmp
    })

    return result
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // 降级处理
    }
  }

  return (
    <div className="w-full max-w-2xl rounded-lg border border-hairline bg-canvas">
      {/* 搜索框 */}
      <div className="p-3 border-b border-hairline">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-body" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索任务或主线（标题/ID）..."
            className="w-full h-8 pl-8 pr-3 rounded-md border border-hairline bg-canvas text-xs text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>
      </div>

      {/* 筛选排序工具栏 */}
      <div className="px-3 pb-2 flex items-center gap-2 border-b border-hairline">
        {/* 状态筛选 */}
        <div className="flex items-center gap-1">
          {[
            { value: 'all', label: '全部' },
            { value: 'in_progress', label: '进行中' },
            { value: 'completed', label: '已完成' },
            { value: 'archived', label: '已归档' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                'px-2 py-0.5 rounded-full text-[11px] transition-colors',
                statusFilter === opt.value
                  ? 'bg-primary/15 text-primary-active font-medium'
                  : 'text-body hover:bg-hover-overlay',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 排序 */}
        <div className="ml-auto flex items-center gap-1">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'title' | 'startDate')}
            className="h-6 rounded border border-hairline bg-canvas px-1 text-[11px] text-ink cursor-pointer appearance-none"
          >
            <option value="title">标题</option>
            <option value="startDate">开始时间</option>
          </select>
          <button
            type="button"
            onClick={() => setSortAsc(!sortAsc)}
            className="h-6 w-6 flex items-center justify-center rounded border border-hairline bg-canvas hover:bg-hover-overlay text-body"
            title={sortAsc ? '顺序' : '逆序'}
          >
            <ArrowUpDown className={cn('size-3 text-body transition-transform', !sortAsc && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* 任务树 */}
      <div className="max-h-[400px] overflow-y-auto p-2">
        {filteredThreads.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">没有匹配的结果</p>
        )}

        {filteredThreads.map(thread => {
          const isExpanded = expandedThreads.has(thread.id)
          const threadTasks = getThreadTasks(thread.id)

          return (
            <div key={thread.id} className="mb-0.5">
              {/* 主线节点 */}
              <button
                type="button"
                onClick={() => setExpandedThreads(prev => {
                  const next = new Set(prev)
                  if (next.has(thread.id)) next.delete(thread.id)
                  else next.add(thread.id)
                  return next
                })}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded hover:bg-hover-overlay transition-colors text-left"
              >
                {isExpanded
                  ? <ChevronDown className="size-3.5 text-body shrink-0" />
                  : <ChevronRight className="size-3.5 text-body shrink-0" />
                }
                <span
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: thread.color || '#cc785c' }}
                />
                <span className="text-sm font-medium text-ink truncate flex-1" title={thread.name}>{thread.name}</span>
                <span
                  className="text-[10px] text-body cursor-pointer hover:text-ink select-all shrink-0"
                  onClick={(e) => { e.stopPropagation(); copyId(thread.id) }}
                  title="点击复制 ID"
                >
                  {copiedId === thread.id ? <Check className="size-3 text-success" /> : `#${thread.id.slice(0, 8)}`}
                </span>
              </button>

              {/* 子任务 */}
              {isExpanded && threadTasks.map(task => (
                <div
                  key={task.id}
                  className="flex items-center gap-1.5 ml-6 pl-2 pr-2 py-1 rounded hover:bg-hover-overlay transition-colors"
                >
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    task.status === 'completed' ? 'bg-success' :
                    task.status === 'in_progress' ? 'bg-primary' :
                    task.status === 'archived' ? 'bg-muted' : 'bg-muted-soft',
                  )} />
                  <span className="text-sm text-ink truncate flex-1" title={task.title}>{task.title}</span>
                  <span
                    className="text-[10px] text-body cursor-pointer hover:text-ink select-all shrink-0"
                    onClick={() => copyId(task.id)}
                    title="点击复制 ID"
                  >
                    {copiedId === task.id ? <Check className="size-3 text-success" /> : `#${task.id.slice(0, 8)}`}
                  </span>
                </div>
              ))}

              {isExpanded && threadTasks.length === 0 && (
                <p className="ml-6 pl-2 py-1 text-xs text-muted">暂无任务</p>
              )}
            </div>
          )
        })}
      </div>

      {/* 底部关闭按钮 */}
      {onCancel && (
        <div className="border-t border-hairline p-2 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
          >
            关闭
          </button>
        </div>
      )}
    </div>
  )
}
