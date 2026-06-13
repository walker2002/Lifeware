/**
 * @file TaskTreeViewCard
 * @brief 任务树 CNUI Surface（去嵌套设计 — view/edit/select 三模式）
 *
 * CN-UI 表面 — 展示任务树，支持三种交互模式：
 * - view: 纯展示（/viewTaskTree），任务不可点击，只有"取消"按钮
 * - edit: 单选后清空列表显示编辑表单（/updateTask）
 * - select: 多选+全选+批量确认（/completeTask、/archiveTask、/deleteTask）
 *   生命周期操作固定状态筛选（用户不可改），确认时显示影响记录数
 */

'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  Search, ChevronRight, ChevronDown, Check, ArrowUpDown,
  Circle, Play, CheckCircle2, Archive, Clock,
  HelpCircle, Target, BadgeCheck, FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── 类型定义 ──────────────────────────────────────────────────────

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
  endDate?: string | null
  clarity?: string | null
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

// ─── 常量 ──────────────────────────────────────────────────────────

/** 任务状态选项（与 manifest lifecycle 对齐） */
const STATUS_OPTIONS = [
  { value: 'todo', label: '待办' },
  { value: 'planned', label: '计划中' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
]

/** 优先级标签 */
const PRIORITY_LABELS: Record<string, string> = {
  critical: '紧急', high: '高', medium: '中', low: '低',
}

/** 操作标签 */
const ACTION_LABELS: Record<string, { title: string; button: string }> = {
  complete: { title: '选择要完成的任务', button: '完成' },
  archive: { title: '选择要归档的任务', button: '归档' },
  delete: { title: '选择要删除的任务', button: '删除' },
}

// ─── 辅助函数 ──────────────────────────────────────────────────────

/** 格式化日期为简短中文格式 */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  } catch {
    return dateStr.slice(0, 10)
  }
}

// ─── 图标组件 ──────────────────────────────────────────────────────

/** 任务状态图标 */
function StatusIcon({ status }: { status: string }) {
  const cls = 'size-3.5 shrink-0'
  switch (status) {
    case 'todo': return <Circle className={cn(cls, 'text-body')} />
    case 'planned': return <Clock className={cn(cls, 'text-body')} />
    case 'in_progress': return <Play className={cn(cls, 'text-primary')} />
    case 'completed': return <CheckCircle2 className={cn(cls, 'text-success')} />
    case 'archived': return <Archive className={cn(cls, 'text-body/70')} />
    default: return <Circle className={cn(cls, 'text-body/70')} />
  }
}

/** 清晰度图标 */
function ClarityIcon({ clarity }: { clarity?: string | null }) {
  const cls = 'size-3'
  switch (clarity) {
    case 'fuzzy': return <HelpCircle className={cn(cls, 'text-warning')} />
    case 'scoped': return <Target className={cn(cls, 'text-primary')} />
    case 'clear': return <BadgeCheck className={cn(cls, 'text-success')} />
    default: return null
  }
}

// ─── 筛选下拉组件 ──────────────────────────────────────────────────

/** 标签式多选下拉按钮 */
function FilterDropdown({
  label, options, selected, onToggle, disabled,
}: {
  label: string
  options: Array<{ value: string; label: string }>
  selected: string[]
  onToggle: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (disabled) return null

  const hasSelection = selected.length > 0 && selected.length < options.length

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
          hasSelection
            ? 'border-primary/40 bg-primary/10 text-primary-active'
            : 'border-hairline bg-canvas text-body hover:bg-hover-overlay',
        )}
      >
        <span>{label}</span>
        {hasSelection && <span className="text-[10px] opacity-70">({selected.length})</span>}
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 min-w-[160px] rounded-md border border-hairline bg-canvas shadow-md py-1">
          {options.map(opt => {
            const isSelected = selected.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onToggle(opt.value)}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-hover-overlay transition-colors text-left',
                  isSelected ? 'text-ink font-medium' : 'text-body',
                )}
              >
                <span className={cn(
                  'size-3.5 rounded border flex items-center justify-center shrink-0',
                  isSelected ? 'bg-primary border-primary' : 'border-hairline',
                )}>
                  {isSelected && <Check className="size-2.5 text-on-primary" />}
                </span>
                {opt.label}
              </button>
            )
          })}
          <div className="border-t border-hairline mt-1 pt-1">
            <button
              type="button"
              onClick={() => { options.forEach(o => { if (selected.includes(o.value)) onToggle(o.value) }) }}
              className="w-full px-3 py-1 text-xs text-body/60 hover:text-ink hover:bg-hover-overlay transition-colors text-left"
            >
              清除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 编辑表单组件（edit 模式选中后全屏覆盖） ──────────────────────

/** edit 模式下的全屏编辑表单 */
function EditForm({
  taskId, initialTitle, initialDescription, initialPriority, initialDuration,
  threadId, onConfirm, onCancel, isLoading,
}: {
  taskId: string
  initialTitle: string
  initialDescription: string
  initialPriority: string
  initialDuration: string
  threadId: string | null
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
  isLoading?: boolean
}) {
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [priority, setPriority] = useState(initialPriority)
  const [duration, setDuration] = useState(initialDuration)
  const [showSubtask, setShowSubtask] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')

  function handleSave() {
    onConfirm({
      taskId,
      title,
      description,
      priority,
      estimatedDuration: Number(duration),
      ...(showSubtask && subtaskTitle.trim()
        ? { createSubtask: { title: subtaskTitle.trim(), parentId: taskId, threadId } }
        : {}),
    })
  }

  return (
    <div className="w-full max-w-md flex flex-col gap-3">
      {/* 标题 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-body">标题</label>
        <input
          type="text"
          className="h-8 w-full rounded-md border border-hairline bg-canvas px-2.5 py-1 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
          value={title} onChange={e => setTitle(e.target.value)}
        />
      </div>

      {/* 描述 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-body">描述</label>
        <textarea
          className="w-full rounded-md border border-hairline bg-canvas px-2.5 py-1 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring resize-none"
          rows={2} value={description} onChange={e => setDescription(e.target.value)}
          placeholder="任务描述..."
        />
      </div>

      {/* 优先级 + 时长 */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-body">优先级</label>
          <select
            value={priority} onChange={e => setPriority(e.target.value)}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-body">预估时长（分钟）</label>
          <input
            type="number" min={5}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
            value={duration} onChange={e => setDuration(e.target.value)}
          />
        </div>
      </div>

      {/* 子任务创建 */}
      <div className="border-t border-hairline pt-2">
        <button
          type="button"
          onClick={() => setShowSubtask(!showSubtask)}
          className="text-xs text-body/60 hover:text-ink transition-colors"
        >
          {showSubtask ? '− 取消添加' : '＋ 添加子任务'}
        </button>
        {showSubtask && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text" value={subtaskTitle}
              onChange={e => setSubtaskTitle(e.target.value)}
              placeholder="子任务标题..." maxLength={100}
              className="h-7 flex-1 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
            <button
              type="button"
              onClick={() => {
                if (!subtaskTitle.trim()) return
                // 先添加子任务，然后更新主任务字段
                onConfirm({
                  taskId,
                  title,
                  description,
                  priority,
                  estimatedDuration: Number(duration),
                  createSubtask: { title: subtaskTitle.trim(), parentId: taskId, threadId },
                })
                setSubtaskTitle('')
                setShowSubtask(false)
              }}
              disabled={!subtaskTitle.trim()}
              className="h-7 rounded-md bg-primary px-3 text-[11px] font-medium text-on-primary disabled:opacity-40"
            >
              添加
            </button>
          </div>
        )}
      </div>

      {/* 底部操作按钮：只有"取消"和"保存" */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button" onClick={onCancel}
          className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
        >
          取消
        </button>
        <button
          type="button" onClick={handleSave} disabled={isLoading}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-on-primary disabled:opacity-40 transition-colors"
        >
          {isLoading ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}

// ─── 任务行组件 ────────────────────────────────────────────────────

/** 单个任务行 */
function TaskRow({
  task,
  indent = 'ml-6 pl-2',
  copiedId,
  onCopyId,
  mode,
  isSelected,
  onToggleSelect,
  onStartEdit,
}: {
  task: TreeNode
  indent?: string
  copiedId: string | null
  onCopyId: (id: string) => void
  mode: 'view' | 'edit' | 'select'
  isSelected?: boolean
  onToggleSelect?: () => void
  onStartEdit?: () => void
}) {
  const hasClarity = task.clarity && task.clarity !== 'clear'
  const hasDates = task.startDate || task.endDate

  const handleClick = useCallback(() => {
    if (mode === 'select') onToggleSelect?.()
    else if (mode === 'edit') onStartEdit?.()
    // view 模式不响应点击
  }, [mode, onToggleSelect, onStartEdit])

  return (
    <div className={indent}>
      <div
        className={cn(
          'pr-2 py-1.5 rounded transition-colors flex items-center gap-1.5',
          mode === 'select' && isSelected && 'bg-primary/8',
          mode === 'select' && 'cursor-pointer hover:bg-hover-overlay',
          mode === 'edit' && 'cursor-pointer hover:bg-hover-overlay',
          mode === 'view' && 'hover:bg-hover-overlay',
        )}
        onClick={handleClick}
      >
        {/* select 模式：复选框 */}
        {mode === 'select' && (
          <span className={cn(
            'size-3.5 rounded border flex items-center justify-center shrink-0',
            isSelected ? 'bg-primary border-primary' : 'border-hairline',
          )}>
            {isSelected && <Check className="size-2.5 text-on-primary" />}
          </span>
        )}

        <StatusIcon status={task.status} />
        <span className={cn(
          'text-sm truncate flex-1',
          isSelected && mode === 'select' ? 'text-body line-through' : 'text-ink',
        )} title={task.title}>
          {task.title}
        </span>

        {/* 优先级标签 */}
        {task.priority && task.priority !== 'medium' && (
          <span className={cn(
            'text-[10px] px-1 rounded shrink-0',
            task.priority === 'critical' ? 'bg-error-soft text-error' :
            task.priority === 'high' ? 'bg-warning-soft text-warning' : 'text-body/70',
          )}>
            {PRIORITY_LABELS[task.priority]}
          </span>
        )}

        <span
          className="text-[10px] text-body cursor-pointer hover:text-ink select-all shrink-0"
          onClick={(e) => { e.stopPropagation(); onCopyId(task.id) }}
          title="点击复制 ID"
        >
          {copiedId === task.id
            ? <Check className="size-3 text-success" />
            : `#${task.id.slice(0, 8)}`}
        </span>
      </div>

      {/* 第二行：清晰度 + 日期 */}
      {(hasClarity || hasDates) && (
        <div className="flex items-center gap-2 ml-5 mt-0.5">
          {mode === 'select' && <span className="w-3.5" />}
          <ClarityIcon clarity={task.clarity} />
          {task.startDate && (
            <span className="text-[10px] text-body/70">
              {formatDate(task.startDate)}
              {task.endDate ? ` → ${formatDate(task.endDate)}` : ''}
            </span>
          )}
          {!task.startDate && task.endDate && (
            <span className="text-[10px] text-body/70">截止 {formatDate(task.endDate)}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 主组件 ────────────────────────────────────────────────────────

/**
 * 任务树 CNUI Surface 组件
 * @description 去嵌套设计 — view/edit/select 三种交互模式
 */
export function TaskTreeViewCard({
  dataModel,
  onConfirm,
  onCancel,
  isLoading,
  isDone,
}: TaskTreeViewCardProps) {
  // ─── 模式检测 ────────────────────────────────────────────────
  const action = dataModel.action as string | undefined
  const phase = dataModel.phase as string | undefined
  const fixedStatusFilter = dataModel.fixedStatusFilter as string[] | undefined
  const defaultStatusFilter = dataModel.defaultStatusFilter as string[] | undefined

  // 模式判定
  // view: 无 action 或 action 不在已知列表
  // edit: action='update'
  // select: action='complete'|'archive'|'delete'
  const isDirectEdit = action === 'update' && phase === 'detail'
  const isDirectConfirm = !!action && action !== 'update' && phase === 'detail'
  const mode: 'view' | 'edit' | 'select' = action === 'update' ? 'edit'
    : (action === 'complete' || action === 'archive' || action === 'delete') ? 'select'
    : 'view'

  const labels = action ? ACTION_LABELS[action] : undefined

  // ─── 通用状态 ────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  // 状态筛选：fixedStatusFilter 不可变，否则用户可自由筛选
  const isFixedFilter = !!fixedStatusFilter
  const [statusFilter, setStatusFilter] = useState<string[]>(
    fixedStatusFilter ?? defaultStatusFilter ?? []
  )
  const [sortBy, setSortBy] = useState<'title' | 'startDate'>('title')
  const [sortAsc, setSortAsc] = useState(true)
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set())
  const [orphanExpanded, setOrphanExpanded] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // ─── select 模式状态 ─────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // 确认二次确认阶段
  const [confirmPhase, setConfirmPhase] = useState(false)

  // ─── edit 模式状态（选中后全屏覆盖） ─────────────────────────
  const [editingTask, setEditingTask] = useState<TreeNode | null>(null)

  // ─── direct-edit 状态 ────────────────────────────────────────
  const [directEditInited, setDirectEditInited] = useState(false)
  const [directTitle, setDirectTitle] = useState('')
  const [directDesc, setDirectDesc] = useState('')
  const [directPriority, setDirectPriority] = useState('medium')
  const [directDuration, setDirectDuration] = useState('60')
  const [directSubtask, setDirectSubtask] = useState(false)
  const [directSubtaskTitle, setDirectSubtaskTitle] = useState('')

  // 初始化直接编辑（handler 已确定具体任务）
  if (isDirectEdit && !directEditInited) {
    const detail = dataModel.task as Record<string, unknown> | undefined
    if (detail) {
      setDirectTitle((detail.title as string) ?? '')
      setDirectDesc((detail.description as string) ?? '')
      setDirectPriority((detail.priority as string) ?? 'medium')
      setDirectDuration(String(detail.estimatedDuration ?? 60))
      setDirectEditInited(true)
    }
  }

  // ─── 数据 ────────────────────────────────────────────────────
  const threads = (dataModel.threads as Array<{ id: string; name: string; color: string; status: string }>) ?? []
  const tasks = (dataModel.tasks as TreeNode[]) ?? []
  const detailTask = dataModel.task as Record<string, unknown> | undefined

  // ─── 搜索过滤 ────────────────────────────────────────────────
  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads
    const q = searchQuery.trim().toLowerCase()
    const matchingTaskThreadIds = new Set(
      tasks.filter(t => t.title.toLowerCase().includes(q) || t.id.includes(q))
        .map(t => t.threadId).filter(Boolean)
    )
    return threads.filter(t =>
      t.name.toLowerCase().includes(q) || t.id.includes(q) || matchingTaskThreadIds.has(t.id)
    )
  }, [threads, tasks, searchQuery])

  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks
    const q = searchQuery.trim().toLowerCase()
    return tasks.filter(t => t.title.toLowerCase().includes(q) || t.id.includes(q))
  }, [tasks, searchQuery])

  // ─── 筛选 + 排序 ─────────────────────────────────────────────
  function applyFilterAndSort(list: TreeNode[]): TreeNode[] {
    let result = list
    if (statusFilter.length > 0 && statusFilter.length < STATUS_OPTIONS.length) {
      result = result.filter(t => statusFilter.includes(t.status))
    }
    result.sort((a, b) => {
      const cmp = sortBy === 'title'
        ? a.title.localeCompare(b.title)
        : (a.startDate ?? '').localeCompare(b.startDate ?? '')
      return sortAsc ? cmp : -cmp
    })
    return result
  }

  function getThreadTasks(threadId: string) {
    return applyFilterAndSort(filteredTasks.filter(t => t.threadId === threadId && !t.parentId))
  }

  function getOrphanTasks() {
    return applyFilterAndSort(filteredTasks.filter(t => !t.threadId && !t.parentId))
  }

  /** 获取所有可见任务（用于全选） */
  const allVisibleTaskIds = useMemo(() => {
    const ids: string[] = []
    filteredThreads.forEach(thread => {
      getThreadTasks(thread.id).forEach(t => ids.push(t.id))
    })
    getOrphanTasks().forEach(t => ids.push(t.id))
    return ids
  }, [filteredThreads, filteredTasks, statusFilter, sortBy, sortAsc])

  // ─── 复制 ID ─────────────────────────────────────────────────
  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch { /* 降级处理 */ }
  }

  // ─── edit 模式操作 ───────────────────────────────────────────
  function enterEdit(task: TreeNode) {
    setEditingTask(task)
  }

  function exitEdit() {
    setEditingTask(null)
  }

  function handleEditSave(data: Record<string, unknown>) {
    onConfirm(data)
  }

  // ─── direct-edit 操作 ────────────────────────────────────────
  function handleDirectSave() {
    if (!detailTask) return
    onConfirm({
      taskId: detailTask.id,
      title: directTitle,
      description: directDesc,
      priority: directPriority,
      estimatedDuration: Number(directDuration),
    })
  }

  function handleDirectSubtask() {
    if (!detailTask || !directSubtaskTitle.trim()) return
    onConfirm({
      taskId: detailTask.id,
      title: directTitle,
      description: directDesc,
      priority: directPriority,
      estimatedDuration: Number(directDuration),
      createSubtask: { title: directSubtaskTitle.trim(), parentId: detailTask.id as string, threadId: (detailTask.threadId as string) ?? null },
    })
    setDirectSubtaskTitle('')
    setDirectSubtask(false)
  }

  // ─── direct-confirm 操作 ─────────────────────────────────────
  function handleDirectConfirm() {
    if (!detailTask) return
    onConfirm({ action, selectedIds: [detailTask.id as string] })
  }

  // ─── select 模式操作 ─────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === allVisibleTaskIds.length) {
      // 全部取消
      setSelectedIds(new Set())
    } else {
      // 全选
      setSelectedIds(new Set(allVisibleTaskIds))
    }
  }

  function handleSelectConfirm() {
    // 进入二次确认阶段
    setConfirmPhase(true)
  }

  function handleFinalConfirm() {
    onConfirm({ action, selectedIds: Array.from(selectedIds) })
  }

  // ─── 空状态 ──────────────────────────────────────────────────
  const orphanTasks = getOrphanTasks()
  const hasContent = filteredThreads.length > 0 || orphanTasks.length > 0

  // ─── 完成状态 ────────────────────────────────────────────────
  if (isDone) {
    return (
      <div className="w-full max-w-2xl rounded-lg border border-hairline bg-canvas p-4 text-center">
        <p className="text-sm text-ink">✅ 操作已完成</p>
      </div>
    )
  }

  // ─── direct-confirm 渲染（单任务确认） ────────────────────────
  if (isDirectConfirm && detailTask) {
    return (
      <div className="w-full max-w-md">
        <div className="mb-3 text-sm font-medium text-ink">
          确认{ACTION_LABELS[action!]?.button ?? action!}
        </div>
        <div className="rounded-md border border-hairline p-3 flex items-center gap-2">
          <StatusIcon status={(detailTask.status as string) ?? 'todo'} />
          <span className="text-sm text-ink font-medium truncate">{detailTask.title as string}</span>
        </div>
        {action === 'delete' && (
          <div className="mt-2 rounded-md border border-error bg-error-soft px-3 py-2 text-xs text-error">
            ⚠️ 删除操作不可恢复
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-3">
          {onCancel && (
            <button type="button" onClick={onCancel}
              className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors">
              取消
            </button>
          )}
          <button type="button" onClick={handleDirectConfirm} disabled={isLoading}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-on-primary disabled:opacity-40 transition-colors">
            {isLoading ? '处理中...' : '确认'}
          </button>
        </div>
      </div>
    )
  }

  // ─── direct-edit 渲染（单任务编辑） ──────────────────────────
  if (isDirectEdit && directEditInited) {
    return (
      <div className="w-full max-w-md">
        <div className="mb-3 text-sm font-medium text-ink">编辑任务</div>
        <EditForm
          taskId={(detailTask?.id as string) ?? ''}
          initialTitle={directTitle}
          initialDescription={directDesc}
          initialPriority={directPriority}
          initialDuration={directDuration}
          threadId={(detailTask?.threadId as string) ?? null}
          onConfirm={onConfirm}
          onCancel={() => onCancel?.()}
          isLoading={isLoading}
        />
      </div>
    )
  }

  // ─── edit 模式 — 选中后全屏覆盖编辑表单 ──────────────────────
  if (mode === 'edit' && editingTask) {
    return (
      <div className="w-full max-w-md">
        <div className="mb-3 text-sm font-medium text-ink">编辑任务</div>
        <EditForm
          taskId={editingTask.id}
          initialTitle={editingTask.title}
          initialDescription=""
          initialPriority={editingTask.priority ?? 'medium'}
          initialDuration={String(editingTask.estimatedDuration ?? 60)}
          threadId={editingTask.threadId ?? null}
          onConfirm={handleEditSave}
          onCancel={exitEdit}
          isLoading={isLoading}
        />
      </div>
    )
  }

  // ─── select 模式 — 二次确认阶段 ─────────────────────────────
  if (mode === 'select' && confirmPhase) {
    const btnLabel = ACTION_LABELS[action!]?.button ?? '确认'
    return (
      <div className="w-full max-w-md">
        <div className="mb-3 text-sm font-medium text-ink">
          确认{btnLabel} {selectedIds.size} 项任务
        </div>

        {/* 影响的任务列表 */}
        <div className="max-h-[300px] overflow-y-auto rounded-md border border-hairline">
          {tasks.filter(t => selectedIds.has(t.id)).map(t => (
            <div key={t.id} className="flex items-center gap-2 px-3 py-2 border-b border-hairline last:border-b-0">
              <StatusIcon status={t.status} />
              <span className="text-sm text-ink truncate">{t.title}</span>
            </div>
          ))}
        </div>

        {/* 警告（delete 模式） */}
        {action === 'delete' && (
          <div className="mt-2 rounded-md border border-error bg-error-soft px-3 py-2 text-xs text-error">
            ⚠️ 删除操作不可恢复。子任务将自动变为根任务。
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 pt-3">
          <button
            type="button"
            onClick={() => setConfirmPhase(false)}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleFinalConfirm}
            disabled={isLoading}
            className={cn(
              'rounded-md px-4 py-1.5 text-xs font-medium text-on-primary disabled:opacity-40 transition-colors',
              action === 'delete' ? 'bg-error' : 'bg-primary',
            )}
          >
            {isLoading ? '处理中...' : `确认${btnLabel} (${selectedIds.size})`}
          </button>
        </div>
      </div>
    )
  }

  // ─── 树形视图渲染（view/edit/select 通用） ────────────────────

  return (
    <div className="w-full max-w-2xl rounded-lg border border-hairline bg-canvas">
      {/* 标题栏 */}
      {labels && (
        <div className="px-3 pt-3 pb-1 text-sm font-medium text-ink flex items-center justify-between">
          <span>{labels.title}</span>
          {/* select 模式：全选按钮 */}
          {mode === 'select' && allVisibleTaskIds.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs text-primary hover:text-primary-active font-normal transition-colors"
            >
              {selectedIds.size === allVisibleTaskIds.length ? '取消全选' : '全选'}
            </button>
          )}
        </div>
      )}
      {mode === 'edit' && !labels && (
        <div className="px-3 pt-3 pb-1 text-sm font-medium text-ink">
          选择要修改的任务
        </div>
      )}

      {/* 搜索框 */}
      <div className="p-3 border-b border-hairline">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-body" />
          <input
            type="text" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索任务或主线（标题/ID）..."
            className="w-full h-8 pl-8 pr-3 rounded-md border border-hairline bg-canvas text-xs text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>
      </div>

      {/* 筛选排序工具栏（fixedFilter 时不显示状态筛选下拉） */}
      <div className="px-3 pb-2 flex items-center gap-2 border-b border-hairline">
        <FilterDropdown
          label="任务状态"
          options={STATUS_OPTIONS}
          selected={statusFilter}
          onToggle={v => setStatusFilter(prev => {
            if (prev.includes(v)) {
              const next = prev.filter(s => s !== v)
              return next.length === 0 ? prev : next
            }
            return [...prev, v]
          })}
          disabled={isFixedFilter}
        />
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
      <div className="max-h-[500px] overflow-y-auto p-2">
        {!hasContent && (
          <p className="py-8 text-center text-sm text-body/70">
            {tasks.length === 0 ? '没有符合条件的任务' : '没有匹配的结果'}
          </p>
        )}

        {/* ═══ 主线列表 ═══════════════════════════════════════ */}
        {filteredThreads.map(thread => {
          const isExpanded = expandedThreads.has(thread.id)
          const threadTasks = getThreadTasks(thread.id)
          if (threadTasks.length === 0 && !searchQuery.trim()) return null

          return (
            <div key={thread.id} className="mb-0.5">
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
                <span className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: thread.color || '#cc785c' }}
                />
                <span className="text-sm font-medium text-ink truncate flex-1" title={thread.name}>
                  {thread.name}
                </span>
                <span
                  className="text-[10px] text-body cursor-pointer hover:text-ink select-all shrink-0"
                  onClick={(e) => { e.stopPropagation(); copyId(thread.id) }}
                  title="点击复制 ID"
                >
                  {copiedId === thread.id ? <Check className="size-3 text-success" /> : `#${thread.id.slice(0, 8)}`}
                </span>
              </button>

              {isExpanded && threadTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  copiedId={copiedId}
                  onCopyId={copyId}
                  mode={mode}
                  isSelected={selectedIds.has(task.id)}
                  onToggleSelect={() => toggleSelect(task.id)}
                  onStartEdit={() => enterEdit(task)}
                />
              ))}
              {isExpanded && threadTasks.length === 0 && (
                <p className="ml-6 pl-2 py-1 text-xs text-body/70">暂无任务</p>
              )}
            </div>
          )
        })}

        {/* ═══ 普通任务（无主线） ═════════════════════════════ */}
        {orphanTasks.length > 0 && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setOrphanExpanded(!orphanExpanded)}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded hover:bg-hover-overlay transition-colors text-left"
            >
              {orphanExpanded
                ? <ChevronDown className="size-3.5 text-body shrink-0" />
                : <ChevronRight className="size-3.5 text-body shrink-0" />
              }
              <FolderOpen className="size-3.5 text-body shrink-0" />
              <span className="text-sm font-medium text-ink">普通任务</span>
              <span className="text-[10px] text-body/70 ml-1">{orphanTasks.length}</span>
            </button>

            {orphanExpanded && orphanTasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                indent="ml-5 pl-2"
                copiedId={copiedId}
                onCopyId={copyId}
                mode={mode}
                isSelected={selectedIds.has(task.id)}
                onToggleSelect={() => toggleSelect(task.id)}
                onStartEdit={() => enterEdit(task)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ═══ 底部操作栏 ═══════════════════════════════════════ */}

      {/* select 模式：已选数量 + 取消 + 确认 */}
      {mode === 'select' && (
        <div className="border-t border-hairline p-2 flex items-center justify-between">
          <span className="text-xs text-body/70">
            已选 {selectedIds.size} 项
          </span>
          <div className="flex items-center gap-2">
            {onCancel && (
              <button type="button" onClick={onCancel}
                className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors">
                取消
              </button>
            )}
            <button type="button" onClick={handleSelectConfirm}
              disabled={selectedIds.size === 0 || isLoading}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-on-primary disabled:opacity-40 transition-colors">
              {labels?.button ?? '确认'} ({selectedIds.size})
            </button>
          </div>
        </div>
      )}

      {/* view 模式：只有"取消"按钮 */}
      {mode === 'view' && onCancel && (
        <div className="border-t border-hairline p-2 flex justify-end">
          <button type="button" onClick={onCancel}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors">
            取消
          </button>
        </div>
      )}

      {/* edit 模式（列表态）：只有"取消"按钮 */}
      {mode === 'edit' && onCancel && (
        <div className="border-t border-hairline p-2 flex justify-end">
          <button type="button" onClick={onCancel}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors">
            取消
          </button>
        </div>
      )}
    </div>
  )
}
