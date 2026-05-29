'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface HabitItem {
  id: string
  title: string
  defaultTime: string
  streak: number
  frequencyType?: string
  status: string
}

interface HabitActionPanelProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
  isLoading?: boolean
}

const ACTION_LABELS: Record<string, { title: string; button: string }> = {
  activate: { title: '激活草稿习惯', button: '激活所选' },
  suspend: { title: '暂停活跃习惯', button: '暂停所选' },
  reactivate: { title: '恢复暂停习惯', button: '恢复所选' },
  archive: { title: '归档暂停习惯', button: '归档所选' },
}

export function HabitActionPanel({ dataModel, onConfirm, onCancel, isLoading }: HabitActionPanelProps) {
  const action = (dataModel.action as string) ?? 'activate'
  const items = (dataModel.items as HabitItem[]) ?? []
  const labels = ACTION_LABELS[action] ?? ACTION_LABELS.activate

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelectedIds(new Set())
  }, [action])

  const allSelected = items.length > 0 && selectedIds.size === items.length

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(h => h.id)))
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
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
        <p className="py-8 text-center text-sm text-muted-foreground">没有符合条件的习惯</p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* 全选 */}
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

          {/* 习惯列表 */}
          {items.map(habit => {
            const isSelected = selectedIds.has(habit.id)
            return (
              <label
                key={habit.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
                  isSelected && 'border-blue-400 bg-blue-50/50',
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOne(habit.id)}
                  className="size-4 rounded accent-blue-500"
                />
                <div className="flex-1">
                  <div
                    className={cn(
                      'text-sm font-medium',
                      isSelected && 'text-gray-400 line-through',
                    )}
                  >
                    {habit.title}
                  </div>
                  <div
                    className={cn(
                      'text-xs text-muted-foreground',
                      isSelected && 'text-gray-400',
                    )}
                  >
                    {habit.frequencyType === 'daily' ? '每天' : habit.frequencyType === 'weekly' ? '每周' : '自定义'}
                    {' · '}{habit.defaultTime}
                    {habit.streak > 0 && ` · ${habit.streak} 天连续`}
                  </div>
                </div>
              </label>
            )
          })}

          {/* 执行按钮 */}
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
