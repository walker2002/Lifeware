/**
 * @file TaskEditCard
 * @brief 任务编辑 CNUI Surface（列表 + 内联编辑）
 *
 * CN-UI 表面 — 展示任务列表供选择，选中后内联展开编辑表单。
 * 列表样式参照 TaskTreeView（状态图标 + 两行布局）。
 */

'use client'

import { useState } from 'react'
import { Circle, Play, CheckCircle2, Archive, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── 类型定义 ──────────────────────────────────────────────────────

/** 任务列表项 */
interface TaskItem {
  id: string
  title: string
  priority: string
  estimatedDuration: number
  status: string
  threadId?: string | null
}

/** TaskEditCard 组件属性 */
interface TaskEditCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

// ─── 常量 ──────────────────────────────────────────────────────────

/** 优先级标签 */
const PRIORITY_LABELS: Record<string, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
}

// ─── 状态图标（与 TaskTreeView 一致） ────────────────────────────────

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

// ─── 主组件 ─────────────────────────────────────────────────────────

/**
 * 任务编辑 CNUI Surface 组件
 * @description 展示任务列表，选中后内联展开编辑表单
 */
export function TaskEditCard({ dataModel, onConfirm, onCancel, isLoading, isDone }: TaskEditCardProps) {
  const tasks = (dataModel.tasks as TaskItem[]) ?? []
  const phase = dataModel.phase as string | undefined

  // ─── 编辑状态 ─────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriority, setEditPriority] = useState('medium')
  const [editDuration, setEditDuration] = useState('60')
  const [editThreadId, setEditThreadId] = useState<string | null>(null)
  const [showSubtaskInput, setShowSubtaskInput] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')

  // ─── 直接进入编辑模式（handler 已确定具体任务） ──────────────────
  const taskDetail = dataModel.task as Record<string, unknown> | undefined
  const directEdit = phase === 'detail' && taskDetail
  if (directEdit && !editingId) {
    // 初始化编辑表单（仅执行一次）
    const detail = taskDetail as Record<string, unknown>
    setEditingId(detail.id as string)
    setEditTitle((detail.title as string) ?? '')
    setEditDescription((detail.description as string) ?? '')
    setEditPriority((detail.priority as string) ?? 'medium')
    setEditDuration(String(detail.estimatedDuration ?? 60))
    setEditThreadId((detail.threadId as string) ?? null)
  }

  // ─── 完成状态 ─────────────────────────────────────────────────
  if (isDone) {
    return (
      <p className="text-sm text-ink text-center py-2">✅ 任务已更新</p>
    )
  }

  // ─── 选择任务进入编辑 ──────────────────────────────────────────
  function enterEdit(task: TaskItem) {
    setEditingId(task.id)
    setEditTitle(task.title)
    setEditDescription('')
    setEditPriority(task.priority)
    setEditDuration(String(task.estimatedDuration ?? 60))
    setEditThreadId(task.threadId ?? null)
    setShowSubtaskInput(false)
    setSubtaskTitle('')
  }

  // ─── 保存编辑 ──────────────────────────────────────────────────
  function handleSave() {
    if (!editingId) return
    onConfirm({
      taskId: editingId,
      title: editTitle,
      description: editDescription,
      priority: editPriority,
      estimatedDuration: Number(editDuration),
    })
  }

  // ─── 添加子任务 ────────────────────────────────────────────────
  function handleAddSubtask() {
    if (!editingId || !subtaskTitle.trim()) return
    onConfirm({
      taskId: editingId,
      title: editTitle,
      description: editDescription,
      priority: editPriority,
      estimatedDuration: Number(editDuration),
      createSubtask: { title: subtaskTitle.trim(), parentId: editingId, threadId: editThreadId },
    })
    setSubtaskTitle('')
    setShowSubtaskInput(false)
  }

  // ─── 渲染编辑表单（内联或直接模式） ──────────────────────────────
  function renderEditForm(taskId: string) {
    return (
      <div className="flex flex-col gap-2.5 p-3 bg-surface-soft/50 rounded-md">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-body">标题</label>
          <input
            type="text"
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2.5 py-1 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-body">描述</label>
          <textarea
            className="w-full rounded-md border border-hairline bg-canvas px-2.5 py-1 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring resize-none"
            rows={2}
            value={editDescription}
            onChange={e => setEditDescription(e.target.value)}
            placeholder="任务描述..."
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-body">优先级</label>
            <select
              value={editPriority}
              onChange={e => setEditPriority(e.target.value)}
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
              type="number"
              min={5}
              className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
              value={editDuration}
              onChange={e => setEditDuration(e.target.value)}
            />
          </div>
        </div>

        {/* 子任务创建 */}
        <div className="border-t border-hairline pt-2">
          <button
            type="button"
            onClick={() => setShowSubtaskInput(v => !v)}
            className="text-xs text-body/60 hover:text-ink transition-colors"
          >
            {showSubtaskInput ? '− 取消添加' : '＋ 添加子任务'}
          </button>
          {showSubtaskInput && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={subtaskTitle}
                onChange={e => setSubtaskTitle(e.target.value)}
                placeholder="子任务标题..."
                maxLength={100}
                className="h-7 flex-1 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
              <button
                type="button"
                onClick={handleAddSubtask}
                disabled={!subtaskTitle.trim()}
                className="h-7 rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
              >
                添加
              </button>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setEditingId(null)}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
          >
            {directEdit ? '关闭' : '返回列表'}
          </button>
          {!directEdit && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
            >
              取消
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 transition-colors"
          >
            {isLoading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    )
  }

  // ─── 直接编辑模式（handler 已确定任务） ──────────────────────────
  if (directEdit && editingId) {
    return (
      <>
        {renderEditForm(editingId)}
      </>
    )
  }

  // ─── 列表模式（选择后内联展开） ─────────────────────────────────
  return (
    <>

      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-body/70">没有可编辑的任务</p>
      ) : (
        <div className="flex flex-col gap-1">
          {tasks.map(task => {
            const isEditing = editingId === task.id
            return (
              <div key={task.id}>
                {/* 任务行（参照 TaskTreeView 两行布局） */}
                <button
                  type="button"
                  onClick={() => {
                    if (!isEditing) enterEdit(task)
                  }}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 rounded-md text-left transition-colors',
                    isEditing
                      ? 'bg-surface-soft'
                      : 'hover:bg-hover-overlay',
                  )}
                >
                  <StatusIcon status={task.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink truncate" title={task.title}>
                      {task.title}
                    </div>
                    <div className="text-[11px] text-body/70 mt-0.5">
                      {PRIORITY_LABELS[task.priority] ?? task.priority}
                      {task.estimatedDuration ? ` · ${task.estimatedDuration}分钟` : ''}
                    </div>
                  </div>
                </button>

                {/* 内联编辑表单 */}
                {isEditing && renderEditForm(task.id)}
              </div>
            )
          })}
        </div>
      )}

      {/* 底部取消按钮 */}
      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
          >
            取消
          </button>
        )}
      </div>
    </>
  )
}
