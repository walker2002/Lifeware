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
  GripVertical,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getTasks, getChildCounts, getSubtasks, createTask, updateTaskStatus as updateTaskStatusAction, getThreads } from '@/app/actions/tasks'
import type { Task } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import { Priority, EnergyLevel } from '../../../usom/types/primitives'
import type { SortField } from './task-filter-bar'

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

/**
 * TaskTreeView 组件属性
 */
export interface TaskTreeViewProps {
  /** 主线 ID 筛选（__all__=全部, __orphan__=无主线, 其他=具体主线） */
  threadId?: string
  /** 刷新计数器，变化时重新加载数据 */
  refreshKey?: number
  /** 打开任务详情回调 */
  onOpenTaskDetail?: (taskId: string) => void
  /** 将任务提升为主线回调 */
  onPromoteToThread?: (taskId: string) => void
  /** 数据变更回调，创建/状态变更后通知父组件刷新 */
  onDataChanged?: () => void
  /** 清晰度筛选 */
  filterClarity?: string[]
  /** 状态筛选 */
  filterStatus?: string[]
  /** 搜索查询 */
  searchQuery?: string
  /** 排序字段 */
  sortBy?: SortField
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

/**
 * 递归过滤树节点：保留匹配搜索词的节点及其祖先
 * @param nodes - 树节点数组
 * @param query - 搜索关键词（小写）
 * @returns 过滤后的节点数组
 */
function filterTreeBySearch(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes
  const q = query.toLowerCase()
  return nodes.reduce<TreeNode[]>((acc, node) => {
    const titleMatch = node.task.title.toLowerCase().includes(q)
    const descMatch = !!node.task.description?.toLowerCase().includes(q)
    const selfMatch = titleMatch || descMatch
    const filteredChildren = filterTreeBySearch(node.children, query)
    if (selfMatch || filteredChildren.length > 0) {
      acc.push({ ...node, children: filteredChildren })
    }
    return acc
  }, [])
}

/**
 * 排序树节点数组
 * @param nodes - 树节点数组
 * @param field - 排序字段
 * @returns 排序后的新数组
 */
function sortTreeNodes(nodes: TreeNode[], field: SortField): TreeNode[] {
  if (field === 'title') {
    return [...nodes].sort((a, b) => a.task.title.localeCompare(b.task.title, 'zh-CN'))
  }
  return [...nodes].sort((a, b) => {
    const aVal = (field === 'startDate' ? a.task.startDate : a.task.endDate) ?? ''
    const bVal = (field === 'startDate' ? b.task.startDate : b.task.endDate) ?? ''
    if (!aVal && !bVal) return 0
    if (!aVal) return 1
    if (!bVal) return -1
    return aVal.localeCompare(bVal)
  })
}

// ─── 状态 → 颜色映射 ──────────────────────────────────────────

/** 任务状态 → 圆点样式 */
const STATUS_DOT_CLASS: Record<string, string> = {
  todo: 'border-2 border-body bg-transparent',
  planned: 'border border-info bg-transparent',
  in_progress: 'bg-info animate-pulse',
  completed: 'bg-success',
  archived: 'bg-surface-card',
}

/** 清晰度 → 圆点样式 */
const CLARITY_DOT_CLASS: Record<string, string> = {
  fuzzy: 'border border-dashed border-body',
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
  refreshKey = 0,
  onOpenTaskDetail,
  onPromoteToThread,
  onDataChanged,
  filterClarity,
  filterStatus,
  searchQuery = '',
  sortBy = 'title',
}: TaskTreeViewProps) {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [childData, setChildData] = useState<Map<string, Task[]>>(new Map())
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set())
  const [childCountMap, setChildCountMap] = useState<Map<string, number>>(new Map())
  /** 主线映射表：threadId → { name, color } */
  const [threadMap, setThreadMap] = useState<Map<string, { name: string; color: string }>>(new Map())
  const [quickAddText, setQuickAddText] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // ─── 键盘快捷键 ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        onOpenTaskDetail?.('') // 关闭抽屉或取消操作
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onOpenTaskDetail])

  // ─── 拖拽排序传感器 ──────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  /** 拖拽结束处理 — 重新排序根级任务 */
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setRootNodes(prev => {
      const oldIndex = prev.findIndex(n => n.task.id === active.id)
      const newIndex = prev.findIndex(n => n.task.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev

      const updated = [...prev]
      const [moved] = updated.splice(oldIndex, 1)
      updated.splice(newIndex, 0, moved)
      return updated
    })
  }, [])

  // ─── 加载根节点 ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setExpandedIds(new Set())
      setChildData(new Map())
      setLoadedIds(new Set())

      try {
        const filters: Record<string, unknown> = { parentId: null }
        if (threadId !== '__all__' && threadId !== '__orphan__') {
          filters.threadId = threadId
        } else if (threadId === '__orphan__') {
          // 无主线任务：threadId 为 null
          filters.threadId = undefined
        }
        if (filterClarity && filterClarity.length > 0) {
          filters.clarity = filterClarity.length === 1 ? filterClarity[0] : filterClarity
        }
        if (filterStatus && filterStatus.length > 0) {
          filters.status = filterStatus.length === 1 ? filterStatus[0] : filterStatus
        }

        const tasks = await getTasks(filters)

        // 对于 __orphan__，需要额外过滤 threadId === undefined
        let filtered = tasks
        if (threadId === '__orphan__') {
          filtered = tasks.filter(t => !t.threadId)
        }

        // 获取所有根节点的子任务计数
        const parentIds = filtered.map(t => t.id)
        const childCounts = await getChildCounts(parentIds)

        const nodes: TreeNode[] = filtered.map(task => ({
          task,
          depth: 0,
          children: [],
          childCount: childCounts[task.id] ?? 0,
          expanded: false,
          loaded: false,
        }))

        // 搜索过滤
        let result = filterTreeBySearch(nodes, searchQuery ?? '')
        // 排序
        result = sortTreeNodes(result, sortBy ?? 'title')

        if (!cancelled) setRootNodes(result)
      } catch {
        if (!cancelled) setRootNodes([])
        toast.error('加载任务失败，请刷新重试')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [threadId, refreshKey, filterClarity, filterStatus, searchQuery, sortBy])

  // ─── 加载主线映射 ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function loadThreads() {
      try {
        const threads = await getThreads()
        if (cancelled) return
        const map = new Map<string, { name: string; color: string }>()
        for (const twc of threads) {
          map.set(twc.thread.id, { name: twc.thread.name, color: twc.thread.color ?? '#3498DB' })
        }
        setThreadMap(map)
      } catch {
        // 主线加载失败不影响任务树显示
      }
    }
    loadThreads()
    return () => { cancelled = true }
  }, [])

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
    if (!loadedIds.has(id) && node.childCount > 0) {
      try {
        const children = await getSubtasks(id)
        setChildData(prev => {
          const next = new Map(prev)
          next.set(id, children)
          return next
        })
        setLoadedIds(prev => new Set(prev).add(id))

        // 获取子节点的子任务计数（修复第三层及以下无法展开的问题）
        const childrenIds = children.map(c => c.id)
        if (childrenIds.length > 0) {
          const subCounts = await getChildCounts(childrenIds)
          setChildCountMap(prev => {
            const next = new Map(prev)
            childrenIds.forEach(cid => next.set(cid, subCounts[cid] ?? 0))
            return next
          })
        }
      } catch {
        toast.error('加载子任务失败')
      }
    }
  }, [loadedIds])

  // ─── 快速添加任务 ──────────────────────────────────────────

  const handleQuickAdd = useCallback(async () => {
    if (!quickAddText.trim() || isCreating) return
    setIsCreating(true)
    try {
      const newTask = await createTask({
        title: quickAddText.trim(),
        threadId: threadId !== '__all__' && threadId !== '__orphan__'
          ? threadId as any : undefined,
      })
      setQuickAddText('')
      toast.success('任务已创建')
      onDataChanged?.()
    } catch (err) {
      console.error('[QuickAdd] 创建任务失败:', err)
      toast.error('创建任务失败，请重试')
    } finally {
      setIsCreating(false)
    }
  }, [quickAddText, isCreating, threadId, onDataChanged])

  // ─── 状态变更 ──────────────────────────────────────────────

  const handleStatusChange = useCallback(async (taskId: string, newStatus: Task['status']) => {
    try {
      await updateTaskStatusAction(taskId, newStatus)
      setRootNodes(prev => prev.map(t => t.task.id === taskId ? { ...t, task: { ...t.task, status: newStatus } } : t))
      toast.success('任务状态已更新')
    } catch {
      toast.error('操作失败，请重试')
    }
  }, [])

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
        /* ═══ 任务列表（根节点支持拖拽排序） ═══════════════ */
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={rootNodes.map(n => n.task.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col">
              {rootNodes.map(node => (
                <SortableTaskRow
                  key={node.task.id}
                  id={node.task.id}
                  node={node}
                  expandedIds={expandedIds}
                  childData={childData}
                  childCountMap={childCountMap}
                  threadMap={threadMap}
                  currentThreadId={threadId}
                  onToggle={handleToggle}
                  onOpenTaskDetail={onOpenTaskDetail}
                  onStatusChange={handleStatusChange}
                  onPromoteToThread={onPromoteToThread}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
  childCountMap: Map<string, number>
  /** 主线映射表 */
  threadMap: Map<string, { name: string; color: string }>
  /** 当前筛选的主线 ID（用于判断是否隐藏标签） */
  currentThreadId?: string
  onToggle: (node: TreeNode) => void
  onOpenTaskDetail?: (taskId: string) => void
  onStatusChange: (taskId: string, newStatus: Task['status']) => void
  onPromoteToThread?: (taskId: string) => void
}

/**
 * 可排序任务行 — 包裹 TaskTreeRow 并添加拖拽手柄
 * @description 用于根级节点的拖拽排序，内部渲染标准 TaskTreeRow
 */
function SortableTaskRow({
  id,
  node,
  expandedIds,
  childData,
  childCountMap,
  threadMap,
  currentThreadId,
  onToggle,
  onOpenTaskDetail,
  onStatusChange,
  onPromoteToThread,
}: { id: string } & TaskTreeRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
  }

  return (
    <div ref={setNodeRef} style={style} className="group flex items-center">
      {/* 拖拽手柄 */}
      <button
        type="button"
        className="shrink-0 px-1 text-muted opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="拖拽排序"
      >
        <GripVertical className="size-3.5" />
      </button>
      <div className="flex-1 min-w-0">
        <TaskTreeRow
          node={node}
          expandedIds={expandedIds}
          childData={childData}
          childCountMap={childCountMap}
          threadMap={threadMap}
          currentThreadId={currentThreadId}
          onToggle={onToggle}
          onOpenTaskDetail={onOpenTaskDetail}
          onStatusChange={onStatusChange}
          onPromoteToThread={onPromoteToThread}
        />
      </div>
    </div>
  )
}

/**
 * 单行任务树节点（递归）
 * @description 渲染一个任务行及其子任务
 */
function TaskTreeRow({
  node,
  expandedIds,
  childData,
  childCountMap,
  threadMap,
  currentThreadId,
  onToggle,
  onOpenTaskDetail,
  onStatusChange,
  onPromoteToThread,
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
      const cnt = childCountMap.get(t.id) ?? 0
      return {
        task: t,
        depth: depth + 1,
        children: [],
        childCount: cnt,
        expanded: false,
        loaded: false,
      }
    })
  }, [childData, childCountMap, task.id, depth])

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

    let colorClass = 'text-body'
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
                  'size-3.5 text-body transition-transform',
                  isExpanded && 'rotate-90',
                )}
              />
            </button>
          ) : hasChildren && !canExpand ? (
            <span className="text-[10px] text-body select-none" title="展开更深层级">
              ···
            </span>
          ) : null}
        </div>

        {/* 状态变更快捷菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button onClick={(e) => e.stopPropagation()}
              aria-label="状态变更"
              className={cn('shrink-0 size-4 rounded-full flex items-center justify-center', STATUS_DOT_CLASS[task.status] || 'border border-muted bg-transparent')}>
              {task.status === 'completed' && <Check className="size-2.5 text-on-primary" />}
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
          task.status === 'completed' && 'line-through text-body opacity-60',
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
          <FinalIcon className="flex-shrink-0 size-3.5 text-body" />
        )}

        {/* 主线标签（非主线筛选模式下显示） */}
        {task.threadId && currentThreadId === '__all__' && (() => {
          const thread = threadMap.get(task.threadId)
          if (!thread) return null
          return (
            <span className="flex-shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-muted bg-surface-soft">
              <span
                className="size-1.5 rounded-full shrink-0"
                style={{ backgroundColor: thread.color }}
              />
              {thread.name}
            </span>
          )
        })()}

        {/* 更多菜单（悬停显示） */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button onClick={(e) => e.stopPropagation()}
              aria-label="更多操作"
              className="shrink-0 size-5 flex items-center justify-center text-muted opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toast.info('子任务创建即将支持') }}>
              在此下方新建子任务
            </DropdownMenuItem>
            {!task.parentId && !task.threadId && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPromoteToThread?.(task.id) }}>
                提升为主线
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toast.info('关联主线即将支持') }}>
              关联到主线...
            </DropdownMenuItem>
            {task.threadId && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toast.info('移出主线即将支持') }}>
                移出主线
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenTaskDetail?.(task.id) }}>
              编辑任务
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toast.info('复制任务即将支持') }}>
              复制任务
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, 'archived') }}>
              归档任务
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ═══ 子节点（展开时递归渲染） ════════════════════════ */}
      {isExpanded && canExpand && children.map(child => (
        <TaskTreeRow
          key={child.task.id}
          node={child}
          expandedIds={expandedIds}
          childData={childData}
          childCountMap={childCountMap}
          threadMap={threadMap}
          currentThreadId={currentThreadId}
          onToggle={onToggle}
          onOpenTaskDetail={onOpenTaskDetail}
          onStatusChange={onStatusChange}
          onPromoteToThread={onPromoteToThread}
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
