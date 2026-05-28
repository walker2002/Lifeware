'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { HabitCheckinDetail, type HabitLogFields } from '@/domains/habits/components/habit-checkin-detail'

interface CheckinHabitItem {
  id: string
  title: string
  defaultTime: string
  defaultDuration: number
  streak: number
  todayLogged: boolean
}

interface HabitCheckinPanelProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
  isLoading?: boolean
}

export function HabitCheckinPanel({ dataModel, onConfirm, onCancel, isLoading }: HabitCheckinPanelProps) {
  const items = (dataModel.items as CheckinHabitItem[]) ?? []

  const pending = items.filter(h => !h.todayLogged)
  const completed = items.filter(h => h.todayLogged)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailHabit, setDetailHabit] = useState<CheckinHabitItem | null>(null)
  const [detailFields, setDetailFields] = useState<Map<string, HabitLogFields>>(new Map())

  const allPending = pending.length > 0 && selectedIds.size === pending.length

  function toggleSelectAll() {
    if (allPending) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pending.map(h => h.id)))
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

  function handleQuickLog(habitId: string) {
    onConfirm({ selectedIds: [habitId], detailFields: {} })
  }

  function handleDetailSubmit(fields: HabitLogFields) {
    if (!detailHabit) return
    setDetailFields(prev => new Map(prev).set(detailHabit.id, fields))
    setDetailHabit(null)
    onConfirm({ selectedIds: [detailHabit.id], detailFields: { [detailHabit.id]: fields } })
  }

  function handleBatchExecute() {
    const fields: Record<string, HabitLogFields> = {}
    for (const [id, f] of detailFields) {
      if (selectedIds.has(id)) fields[id] = f
    }
    onConfirm({ selectedIds: Array.from(selectedIds), detailFields: fields })
  }

  return (
    <div className="w-full max-w-lg">
      <div className="mb-3 text-sm font-medium text-ink">
        今日打卡 ({completed.length}/{items.length})
      </div>

      {pending.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">今日已全部打卡</p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* 全选 */}
          <div className="flex items-center justify-between border-b pb-2 text-xs text-muted-foreground">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allPending}
                onChange={toggleSelectAll}
                className="size-4 rounded"
              />
              全选
            </label>
            <span>已选 {selectedIds.size} / {pending.length}</span>
          </div>

          {/* 待打卡列表 */}
          {pending.map(habit => {
            const isSelected = selectedIds.has(habit.id)
            return (
              <div
                key={habit.id}
                className={cn(
                  'flex items-center gap-3 rounded-md border p-3 transition-colors',
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
                  <div className={cn('text-sm font-medium', isSelected && 'text-gray-400 line-through')}>
                    {habit.title}
                  </div>
                  <div className={cn('text-xs text-muted-foreground', isSelected && 'text-gray-400')}>
                    {habit.streak > 0 && `${habit.streak} 天连续 · `}{habit.defaultTime}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleQuickLog(habit.id)}
                    className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                  >
                    完成
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailHabit(habit)}
                    className="rounded bg-gray-400 px-2 py-1 text-xs text-white hover:bg-gray-500"
                  >
                    详情
                  </button>
                </div>
              </div>
            )
          })}

          {/* 详情弹窗 */}
          {detailHabit && (
            <HabitCheckinDetail
              habit={detailHabit}
              onSubmit={handleDetailSubmit}
              onCancel={() => setDetailHabit(null)}
            />
          )}

          {/* 批量执行 */}
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
              onClick={handleBatchExecute}
              disabled={selectedIds.size === 0 || isLoading}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              打卡所选 ({selectedIds.size})
            </button>
          </div>
        </div>
      )}

      {/* 已完成 */}
      {completed.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">已完成</div>
          {completed.map(habit => (
            <div key={habit.id} className="flex items-center gap-2 py-1 text-sm opacity-60">
              <span className="text-green-500">✓</span>
              <span>{habit.title}</span>
              <span className="text-xs text-muted-foreground">{habit.streak} 天连续</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
