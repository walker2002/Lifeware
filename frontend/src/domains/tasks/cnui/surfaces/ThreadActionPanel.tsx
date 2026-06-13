/**
 * @file ThreadActionPanel
 * @brief 主线操作面板 Surface（暂停/恢复/完成/归档）
 *
 * CN-UI Surface 组件，处理 pauseThread、resumeThread、completeThread、archiveThread 等主线操作。
 * 参照 TaskActionPanel 模式：支持多选 + 批量确认。
 */

'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

/** 主线列表项 */
interface ThreadItem {
  id: string
  name: string
  color?: string
  status: string
  description?: string
  priority?: string
}

/** ThreadActionPanel 组件属性 */
interface ThreadActionPanelProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
  /** 全屏请求回调 */
  onRequestFullscreen?: () => void
}

/** 操作标签映射 */
const ACTION_LABELS: Record<string, { title: string; button: string }> = {
  pause: { title: '暂停主线', button: '暂停所选' },
  resume: { title: '恢复主线', button: '恢复所选' },
  complete: { title: '完成主线', button: '完成所选' },
  archive: { title: '归档主线', button: '归档所选' },
  update: { title: '编辑主线', button: '保存修改' },
}

/** 默认主线颜色（primary token） */
const DEFAULT_THREAD_COLOR = '#cc785c'

/** 状态标签 */
const STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  paused: '已暂停',
  completed: '已完成',
  archived: '已归档',
}

/** 翻页控件（内联渲染） */
function PaginationControls({ dataModel, onDataChange }: { dataModel: Record<string, unknown>; onDataChange: (d: Record<string, unknown>) => void }) {
  const p = dataModel._pagination as { page: number; totalPages: number } | undefined
  if (!p) return null
  return (
    <>
      <button
        type="button"
        disabled={p.page <= 1}
        onClick={() => onDataChange({ ...dataModel, _page: p.page - 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ‹
      </button>
      <span className="min-w-[2rem] text-center text-xs text-muted">
        {p.page}/{p.totalPages}
      </span>
      <button
        type="button"
        disabled={p.page >= p.totalPages}
        onClick={() => onDataChange({ ...dataModel, _page: p.page + 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ›
      </button>
    </>
  )
}

/**
 * 主线操作面板组件
 * @description 处理主线的暂停、恢复、完成和归档批量操作
 */
export function ThreadActionPanel({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone, onRequestFullscreen }: ThreadActionPanelProps) {
  const action = (dataModel.action as string) ?? 'pause'
  const items = (dataModel.items as ThreadItem[]) ?? []
  // updateThread handler 返回的 key 是 "threads"，需要兼容读取
  const threads = (dataModel.threads as ThreadItem[]) ?? items
  const labels = ACTION_LABELS[action] ?? ACTION_LABELS.pause

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ─── update 模式状态 ─────────────────────
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editColor, setEditColor] = useState(DEFAULT_THREAD_COLOR)
  const [editPriority, setEditPriority] = useState('')

  useEffect(() => {
    setSelectedIds(new Set())
  }, [action])

  const allSelected = items.length > 0 && selectedIds.size === items.length

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(items.map(t => t.id)))
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleExecute() {
    onConfirm({ action, selectedIds: Array.from(selectedIds) })
  }

  if (isDone) {
    return <p className="text-sm text-ink text-center py-4">✅ 操作已完成</p>
  }

  // ─── update 模式：编辑主线 ─────────────────────
  if (action === 'update') {
    // 编辑表单视图
    if (editingThreadId) {
      const thread = threads.find(t => t.id === editingThreadId)
      return (
        <>
          {/* 翻页 + 全屏控件 */}
          {(dataModel._pagination || onRequestFullscreen) && (
            <div className="mb-3 flex items-center justify-end gap-1.5">
              <PaginationControls dataModel={dataModel} onDataChange={onDataChange} />
              {onRequestFullscreen && (
                <button
                  type="button"
                  onClick={onRequestFullscreen}
                  className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
                  title="全屏展开"
                >
                  ⛶
                </button>
              )}
            </div>
          )}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-body">名称</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="主线名称"
                className="h-9 w-full rounded-md border border-hairline bg-canvas px-3 py-1 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-body">描述</label>
              <textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                placeholder="主线描述..."
                rows={2}
                className="w-full rounded-md border border-hairline bg-canvas px-3 py-1 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring resize-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-body">颜色</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={editColor}
                  onChange={e => setEditColor(e.target.value)}
                  className="size-8 rounded border border-hairline cursor-pointer"
                />
                <span className="text-xs text-body">{editColor}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-body">优先级</label>
              <select
                value={editPriority}
                onChange={e => setEditPriority(e.target.value)}
                className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
              >
                <option value="">不设置</option>
                <option value="critical">紧急</option>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingThreadId(null)}
                className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
              >
                返回
              </button>
              {onCancel && (
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
                onClick={() => onConfirm({
                  action: 'update',
                  threadId: editingThreadId,
                  name: editName || thread?.name,
                  description: editDescription || thread?.description,
                  color: editColor || thread?.color,
                  priority: editPriority || thread?.priority,
                })}
                disabled={isLoading}
                className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </>
      )
    }

    // 选择主线视图
    return (
      <>
        {/* 翻页 + 全屏控件 */}
        {(dataModel._pagination || onRequestFullscreen) && (
          <div className="mb-3 flex items-center justify-end gap-1.5">
            <PaginationControls dataModel={dataModel} onDataChange={onDataChange} />
            {onRequestFullscreen && (
              <button
                type="button"
                onClick={onRequestFullscreen}
                className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
                title="全屏展开"
              >
                ⛶
              </button>
            )}
          </div>
        )}

        {threads.length === 0 ? (
          <p className="py-8 text-center text-sm text-body/70">没有符合条件的主线</p>
        ) : (
          <div className="flex flex-col gap-2">
            {threads.map(thread => (
              <button
                key={thread.id}
                type="button"
                onClick={() => {
                  setEditingThreadId(thread.id)
                  setEditName(thread.name)
                  setEditDescription(thread.description ?? '')
                  setEditColor(thread.color ?? DEFAULT_THREAD_COLOR)
                  setEditPriority(thread.priority ?? '')
                }}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-hairline bg-canvas p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/10"
              >
                <span
                  className="size-3 rounded-full shrink-0"
                  style={{ backgroundColor: thread.color ?? DEFAULT_THREAD_COLOR }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" title={thread.name}>{thread.name}</div>
                  <div className="text-xs text-body/70">
                    {STATUS_LABELS[thread.status] ?? thread.status}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {onCancel && (
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
            >
              取消
            </button>
          </div>
        )}
      </>
    )
  }

  // ─── 默认批量操作模式 ─────────────────────
  return (
    <>
      {/* 翻页 + 全屏控件 */}
      {(dataModel._pagination || onRequestFullscreen) && (
        <div className="mb-3 flex items-center justify-end gap-1.5">
          <PaginationControls dataModel={dataModel} onDataChange={onDataChange} />
          {onRequestFullscreen && (
            <button
              type="button"
              onClick={onRequestFullscreen}
              className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
              title="全屏展开"
            >
              ⛶
            </button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-body/70">没有符合条件的主线</p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* 全选栏 */}
          <div className="flex items-center justify-between border-b border-hairline pb-2 text-xs text-body/70">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="size-4 rounded"
              />
              全选
            </label>
            <span>已选 {selectedIds.size} / {items.length}</span>
          </div>

          {/* 主线列表 */}
          {items.map(thread => {
            const isSelected = selectedIds.has(thread.id)
            return (
              <label
                key={thread.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
                  isSelected && 'border-primary/40 bg-primary/10',
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOne(thread.id)}
                  className="size-4 rounded"
                />
                {/* 颜色圆点 */}
                <span
                  className="size-3 rounded-full shrink-0"
                  style={{ backgroundColor: thread.color ?? DEFAULT_THREAD_COLOR }}
                />
                <div className="flex-1 min-w-0">
                  <div className={cn('text-sm font-medium truncate', isSelected && 'text-body/70 line-through')} title={thread.name}>
                    {thread.name}
                  </div>
                  <div className="text-xs text-body/70">
                    {STATUS_LABELS[thread.status] ?? thread.status}
                  </div>
                </div>
              </label>
            )
          })}

          {/* 操作按钮 */}
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
            <button
              type="button"
              onClick={handleExecute}
              disabled={selectedIds.size === 0 || isLoading}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 transition-colors"
            >
              {labels.button} ({selectedIds.size})
            </button>
          </div>
        </div>
      )}
    </>
  )
}
