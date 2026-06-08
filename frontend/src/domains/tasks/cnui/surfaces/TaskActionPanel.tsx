'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface TaskItem {
  id: string
  title: string
  priority: string
  estimatedDuration: number
  status: string
}

interface TaskActionPanelProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
  isLoading?: boolean
}

const ACTION_LABELS: Record<string, { title: string; button: string }> = {
  complete: { title: '完成任务', button: '完成所选' },
  archive: { title: '归档任务', button: '归档所选' },
  delete: { title: '删除任务', button: '删除所选' },
  refine: { title: '细化任务', button: '细化所选' },
}

const PRIORITY_LABELS: Record<string, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
}

export function TaskActionPanel({ dataModel, onConfirm, onCancel, isLoading }: TaskActionPanelProps) {
  const action = (dataModel.action as string) ?? 'complete'
  const items = (dataModel.items as TaskItem[]) ?? []
  const labels = ACTION_LABELS[action] ?? ACTION_LABELS.complete

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelectedIds(new Set())
  }, [action])

  const allSelected = items.length > 0 && selectedIds.size === items.length

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(t => t.id)))
    }
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

  return (
    <div className="w-full max-w-lg">
      <div className="mb-3 text-sm font-medium text-ink">{labels.title}</div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">没有符合条件的任务</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between border-b pb-2 text-xs text-muted-foreground">
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
                  className="size-4 rounded accent-blue-500"
                />
                <div className="flex-1">
                  <div className={cn('text-sm font-medium', isSelected && 'text-muted-foreground line-through')}>
                    {task.title}
                  </div>
                  <div className={cn('text-xs text-muted-foreground', isSelected && 'text-muted-foreground')}>
                    {PRIORITY_LABELS[task.priority] ?? task.priority}
                    {task.estimatedDuration ? ` · ${task.estimatedDuration}分钟` : ''}
                  </div>
                </div>
              </label>
            )
          })}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border px-3 py-1.5 text-xs"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={selectedIds.size === 0 || isLoading}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {labels.button} ({selectedIds.size})
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
