/**
 * @file TaskActionPanel
 * @brief 任务操作面板 CNUI Surface
 *
 * CN-UI Surface 组件，处理 completeTask、archiveTask、deleteTask、refineTask 等任务操作。
 * 支持多选 + 批量确认。
 */

'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

/** 任务列表项 */
interface TaskItem {
  id: string
  title: string
  priority: string
  estimatedDuration: number
  status: string
}

/** TaskActionPanel 组件属性 */
interface TaskActionPanelProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

/** 操作标签映射 */
const ACTION_LABELS: Record<string, { title: string; button: string }> = {
  complete: { title: '完成任务', button: '完成所选' },
  archive: { title: '归档任务', button: '归档所选' },
  delete: { title: '删除任务', button: '删除所选' },
  refine: { title: '细化任务', button: '细化所选' },
}

/** 优先级标签 */
const PRIORITY_LABELS: Record<string, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
}

/**
 * 任务操作面板组件
 * @description 处理任务的完成、归档、删除和细化批量操作
 */
export function TaskActionPanel({ dataModel, onConfirm, onCancel, isLoading, isDone }: TaskActionPanelProps) {
  const action = (dataModel.action as string) ?? 'complete'
  const items = (dataModel.items as TaskItem[]) ?? []
  const labels = ACTION_LABELS[action] ?? ACTION_LABELS.complete

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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
    return (
      <div className="w-full max-w-lg text-center py-4">
        <p className="text-sm text-ink">✅ 操作已完成</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg">
      <div className="mb-3 text-sm font-medium text-ink">{labels.title}</div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">没有符合条件的任务</p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* 全选栏 */}
          <div className="flex items-center justify-between border-b border-hairline pb-2 text-xs text-muted">
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

          {/* 任务列表 */}
          {items.map(task => {
            const isSelected = selectedIds.has(task.id)
            return (
              <label
                key={task.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
                  isSelected && 'border-primary/40 bg-primary/10',
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOne(task.id)}
                  className="size-4 rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className={cn('text-sm font-medium truncate', isSelected && 'text-muted line-through')}>
                    {task.title}
                  </div>
                  <div className="text-xs text-muted">
                    {PRIORITY_LABELS[task.priority] ?? task.priority}
                    {task.estimatedDuration ? ` · ${task.estimatedDuration}分钟` : ''}
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
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-on-primary disabled:opacity-40 transition-colors"
            >
              {labels.button} ({selectedIds.size})
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
