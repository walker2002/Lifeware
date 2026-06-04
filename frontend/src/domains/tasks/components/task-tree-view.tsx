/**
 * @file task-tree-view
 * @brief 任务树视图组件
 *
 * 可嵌套展开的任务树，支持延迟加载子任务。
 * 展示状态圆点、清晰度标记、优先级徽章、截止日期、精力图标等。
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ChevronRight,
  MoreHorizontal,
  Brain,
  Cloud,
  ClipboardList,
  Sparkles,
  ListTodo,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TaskRepository } from '../repository/task'
import type { Task } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import { Priority, EnergyLevel } from '../../../usom/types/primitives'

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

/**
 * TaskTreeView 组件属性
 */
export interface TaskTreeViewProps {
  /** 主线 ID 筛选（__all__=全部, __orphan__=无主线, 其他=具体主线） */
  threadId?: string
  /** 打开任务详情回调 */
  onOpenTaskDetail?: (taskId: string) => void
}

// ─── 本地树节点类型 ────────────────────────────────────────────

/** 任务树节点（运行时状态） */
interface TreeNode {
  task: Task
  depth: number
  children: TreeNode[]
  childCount: number // 子任务总数（用于显示展开箭头）
  expanded: boolean
  loaded: boolean // 是否已延迟加载子任务
}

// ─── 常量 ──────────────────────────────────────────────────────

/** 最大嵌套深度 */
const MAX_DEPTH = 5

/** 每层缩进像素 */
const INDENT_PX = 20

// ─── 状态 → 颜色映射 ──────────────────────────────────────────

/** 任务状态 → 圆点样式 */
const STATUS_DOT_CLASS: Record<string, string> = {
  todo: 'border border-muted bg-transparent',
  planned: 'border border-info bg-transparent',
  in_progress: 'bg-info animate-pulse',
  completed: 'bg-success',
  archived: 'bg-surface-card',
}

/** 清晰度 → 圆点样式 */
const CLARITY_DOT_CLASS: Record<string, string> = {
  fuzzy: 'border border-dashed border-muted',
  scoped: 'bg-warning',
  actionable: 'bg-success',
}

/** 精力等级 → 图标 */
const ENERGY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  [EnergyLevel.Low]: Cloud,
  [EnergyLevel.Medium]: ClipboardList,
  [EnergyLevel.High]: Brain,
}

// ═══════════════════════════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════════════════════════

/**
 * 任务树视图组件
 * @description 递归任务树，支持展开/折叠和延迟加载
 * @param props - 组件属性
 */
export function TaskTreeView({
  threadId = '__all__',
  onOpenTaskDetail,
}: TaskTreeViewProps) {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [childData, setChildData] = useState<Map<string, Task[]>>(new Map())
  const [quickAddText, setQuickAddText] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const repo = useMemo(() => new TaskRepository(), [])

  // ─── 加载根节点 ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setExpandedIds(new Set())
      setChildData(new Map())

      try {
        const filters: { parentId: null; threadId?: string } = { parentId: null }
        if (threadId !== '__all__' && threadId !== '__orphan__') {
          filters.threadId = threadId
        } else if (threadId === '__orphan__') {
          // 无主线任务：threadId 为 null
          ;(filters as any).threadId = undefined
        }

        const tasks = await repo.findByUserId('placeholder' as any, filters)

        // 对于 __orphan__，需要额外过滤 threadId === undefined
        let filtered = tasks
        if (threadId === '__orphan__') {
          // 服务端过滤：只保留没有 threadId 的任务
          // 注意：这里假设查询本身已做过滤，若未做则在此补充
          filtered = tasks.filter(t => !t.threadId)
        }

        // 获取所有根节点的子任务计数
        const parentIds = filtered.map(t => t.id)
        const childCounts = await repo.getChildCounts(parentIds, 'placeholder' as any)

        const nodes: TreeNode[] = filtered.map(task => ({
          task,
          depth: 0,
          children: [],
          childCount: childCounts.get(task.id) ?? 0,
          expanded: false,
          loaded: false,
        }))

        if (!cancelled) setRootNodes(nodes)
      } catch {
        if (!cancelled) setRootNodes([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [threadId, repo])

  // ─── 展开/折叠 ───────────────────────────────────────────────

  const handleToggle = useCallback(async (node: TreeNode) => {
    const id = node.task.id

    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        return next
      }
      next.add(id)
      return next
    })

    // 如果尚未加载子任务，延迟加载
    if (!node.loaded && node.childCount > 0) {
      try {
        const children = await repo.findByParent(id, 'placeholder' as any)
        setChildData(prev => {
          const next = new Map(prev)
          next.set(id, children)
          return next
        })
        node.loaded = true
      } catch {
        // 加载失败静默降级
      }
    }
  }, [repo])

  // ─── 快速添加任务 ──────────────────────────────────────────

  const handleQuickAdd = useCallback(async () => {
    if (!quickAddText.trim() || isCreating) return
    setIsCreating(true)
    const userId = 'placeholder' as any
    const newTask = await repo.create({
      title: quickAddText.trim(),
      captureMode: 'ad_hoc',
      threadId: threadId !== '__all__' && threadId !== '__orphan__'
        ? threadId as any : undefined,
    }, userId)
    setRootNodes(prev => [...prev, {
      task: newTask,
      depth: 0,
      children: [],
      childCount: 0,
      expanded: false,
      loaded: false,
    }])
    setQuickAddText('')
    setIsCreating(false)
  }, [quickAddText, isCreating, repo, threadId])

  // ─── 状态变更 ──────────────────────────────────────────────

  const handleStatusChange = useCallback(async (taskId: string, newStatus: Task['status']) => {
    const userId = 'placeholder' as any
    await repo.updateStatus(taskId as any, newStatus, userId)
    setRootNodes(prev => prev.map(t => t.task.id === taskId ? { ...t, task: { ...t.task, status: newStatus } } : t))
  }, [repo])

  // ─── 渲染 ────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      {/* ═══ 加载状态 ═══════════════════════════════════════════ */}
      {loading ? (
        <TaskTreeSkeleton />
      ) : rootNodes.length === 0 ? (
        /* ═══ 空状态 ═════════════════════════════════════════ */
        <div className="flex flex-col items-center justify-center h-64 text-muted">
          <ListTodo className="size-12 mb-3 opacity-30" />
          <p className="text-sm">暂无任务</p>
          <p className="text-xs mt-1 opacity-60">
            点击「快速添加任务」开始创建
          </p>
        </div>
      ) : (
        /* ═══ 任务列表 ═══════════════════════════════════════ */
        <div className="flex flex-col">
          {rootNodes.map(node => (
            <TaskTreeRow
              key={node.task.id}
              node={node}
              expandedIds={expandedIds}
              childData={childData}
              onToggle={handleToggle}
              onOpenTaskDetail={onOpenTaskDetail}
              onStatusChange={handleStatusChange}
              repo={repo}
            />
          ))}
        </div>
      )}

      {/* ═══ 行内快速创建 ═══════════════════════════════════════ */}
      <div className="px-3 py-2 border-t border-hairline-soft">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={quickAddText}
            onChange={e => setQuickAddText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd() }}
            placeholder="+ 快速添加任务，回车确认"
            className="flex-1 h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)]"
          />
          {isCreating && (
            <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 内部子组件
// ═══════════════════════════════════════════════════════════════

/**
 * TaskTreeRow 组件属性
 */
interface TaskTreeRowProps {
  node: TreeNode
  expandedIds: Set<string>
  childData: Map<string, Task[]>
  onToggle: (node: TreeNode) => void
  onOpenTaskDetail?: (taskId: string) => void
  onStatusChange: (taskId: string, newStatus: Task['status']) => void
  repo: TaskRepository
}

/**
 * 单行任务树节点（递归）
 * @description 渲染一个任务行及其子任务
 */
function TaskTreeRow({
  node,
  expandedIds,
  childData,
  onToggle,
  onOpenTaskDetail,
  onStatusChange,
  repo,
}: TaskTreeRowProps) {
  const { task, depth, childCount } = node
  const isExpanded = expandedIds.has(task.id)
  const hasChildren = childCount > 0
  const canExpand = depth < MAX_DEPTH

  // 构建子节点
  const children: TreeNode[] = useMemo(() => {
    const tasks = childData.get(task.id)
    if (!tasks || tasks.length === 0) return []
    return tasks.map(t => {
      const cnt = 0 // 子节点的计数在加载时获取
      return {
        task: t,
        depth: depth + 1,
        children: [],
        childCount: cnt,
        expanded: false,
        loaded: false,
      }
    })
  }, [childData, task.id, depth])

  // ─── 截止日期计算 ─────────────────────────────────────────

  const dueDisplay = useMemo(() => {
    if (!task.dueDate) return null

    // 解析 MM-DD
    const parts = task.dueDate.split('-')
    const mmdd = parts.length >= 3 ? `${parts[1]}-${parts[2]}` : task.dueDate

    // 计算距今天数
    const due = new Date(task.dueDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diffMs = due.getTime() - today.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    let colorClass = 'text-muted'
    if (diffDays < 0) colorClass = 'text-error'
    else if (diffDays <= 3) colorClass = 'text-warning'

    return { text: mmdd, colorClass }
  }, [task.dueDate])

  // ─── 精力图标组件 ──────────────────────────────────────────

  const EnergyIcon = ENERGY_ICON[task.energyRequired]
  const isMore = task.energyRequired && !EnergyIcon
    ? Sparkles
    : null
  const FinalIcon = EnergyIcon || isMore

  return (
    <>
      {/* ═══ 当前节点行 ═══════════════════════════════════════ */}
      <div
        className={cn(
          'group flex items-center gap-2 py-2 px-2 rounded-md transition-colors hover:bg-surface-soft cursor-pointer',
        )}
        style={{ paddingLeft: `${12 + depth * INDENT_PX}px` }}
        onClick={() => onOpenTaskDetail?.(task.id)}
      >
        {/* 展开箭头 */}
        <div className="flex-shrink-0 w-4 flex items-center justify-center">
          {hasChildren && canExpand ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                onToggle(node)
              }}
              className="p-0.5 rounded hover:bg-surface-soft transition-colors"
              aria-label={isExpanded ? '折叠' : '展开'}
            >
              <ChevronRight
                className={cn(
                  'size-3.5 text-muted transition-transform',
                  isExpanded && 'rotate-90',
                )}
              />
            </button>
          ) : hasChildren && !canExpand ? (
            <span className="text-[10px] text-muted select-none" title="展开更深层级">
              ···
            </span>
          ) : null}
        </div>

        {/* 状态变更快捷菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button onClick={(e) => e.stopPropagation()}
              className={cn('shrink-0 size-4 rounded-full flex items-center justify-center', STATUS_DOT_CLASS[task.status] || 'border border-muted bg-transparent')}>
              {task.status === 'completed' && <Check className="size-2.5 text-white" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            {task.status === 'todo' && (<>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'planned') }}>计划中</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'in_progress') }}>开始执行</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'archived') }}>归档</DropdownMenuItem>
            </>)}
            {task.status === 'planned' && (<>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'in_progress') }}>开始执行</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'todo') }}>回到待办</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'archived') }}>归档</DropdownMenuItem>
            </>)}
            {task.status === 'in_progress' && (<>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'completed') }}>标记完成</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'todo') }}>暂停回待办</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'archived') }}>归档</DropdownMenuItem>
            </>)}
            {task.status === 'completed' && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'archived') }}>归档</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 清晰度圆点 */}
        <div
          className={cn(
            'flex-shrink-0 size-2 rounded-full',
            CLARITY_DOT_CLASS[task.clarity] || 'border border-dashed border-muted',
          )}
          title={`清晰度: ${task.clarity}`}
        />

        {/* 标题 */}
        <span className={cn(
          'flex-1 text-sm text-ink truncate',
          task.status === 'completed' && 'line-through text-muted',
        )}>
          {task.title}
        </span>

        {/* 优先级徽章（仅 critical 和 high 显示） */}
        {(task.priority === Priority.Critical || task.priority === Priority.High) && (
          <span
            className={cn(
              'flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-none',
              task.priority === Priority.Critical
                ? 'bg-error-soft text-error'
                : 'bg-warning-soft text-warning',
            )}
          >
            {task.priority === Priority.Critical ? '紧急' : '高'}
          </span>
        )}

        {/* 截止日期 */}
        {dueDisplay && (
          <span className={cn('flex-shrink-0 text-xs', dueDisplay.colorClass)}>
            {dueDisplay.text}
          </span>
        )}

        {/* 精力图标 */}
        {FinalIcon && (
          <FinalIcon className="flex-shrink-0 size-3.5 text-muted" />
        )}

        {/* 更多菜单（悬停显示） */}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            // TODO: 打开更多操作菜单
          }}
          className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-soft transition-all"
          aria-label="更多操作"
        >
          <MoreHorizontal className="size-4 text-muted" />
        </button>
      </div>

      {/* ═══ 子节点（展开时递归渲染） ════════════════════════ */}
      {isExpanded && canExpand && children.map(child => (
        <TaskTreeRow
          key={child.task.id}
          node={child}
          expandedIds={expandedIds}
          childData={childData}
          onToggle={onToggle}
          onOpenTaskDetail={onOpenTaskDetail}
          onStatusChange={onStatusChange}
          repo={repo}
        />
      ))}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// 加载骨架屏
// ═══════════════════════════════════════════════════════════════

/**
 * 任务树加载骨架屏
 */
function TaskTreeSkeleton() {
  return (
    <div className="flex flex-col gap-1 animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 py-2.5 px-2"
          style={{ paddingLeft: `${12 + (i % 3) * INDENT_PX}px` }}
        >
          <div className="size-4 rounded bg-surface-soft" />
          <div className="size-3 rounded-full bg-surface-soft" />
          <div className="size-2 rounded-full bg-surface-soft" />
          <div className="flex-1 h-4 rounded bg-surface-soft" />
          <div className="w-10 h-3 rounded bg-surface-soft" />
        </div>
      ))}
    </div>
  )
}
