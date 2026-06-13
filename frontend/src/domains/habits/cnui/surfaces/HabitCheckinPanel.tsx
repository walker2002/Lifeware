/**
 * @file HabitCheckinPanel
 * @brief 习惯打卡面板 Surface
 * 
 * CNUI Surface 组件，支持习惯的快速打卡和详情打卡
 */

'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { HabitCheckinDetail, type HabitLogFields } from '@/domains/habits/components/habit-checkin-detail'

/**
 * 打卡习惯项
 */
interface CheckinHabitItem {
  /** ID */
  id: string
  /** 标题 */
  title: string
  /** 默认时间 */
  defaultTime: string
  /** 默认时长 */
  defaultDuration: number
  /** 连续天数 */
  streak: number
  /** 今日是否已打卡 */
  todayLogged: boolean
}

/**
 * 习惯打卡面板属性
 */
interface HabitCheckinPanelProps {
  /** Surface 类型 */
  surfaceType: string
  /** 数据模型 */
  dataModel: Record<string, unknown>
  /** 数据变更回调 */
  onDataChange: (data: Record<string, unknown>) => void
  /** 确认回调 */
  onConfirm: (data: Record<string, unknown>) => void
  /** 取消回调 */
  onCancel: () => void
  /** 是否加载中 */
  isLoading?: boolean
  /** 全屏请求回调 */
  onRequestFullscreen?: () => void
}

export function HabitCheckinPanel({ dataModel, onDataChange, onConfirm, onCancel, isLoading, onRequestFullscreen }: HabitCheckinPanelProps) {
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
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">今日打卡 ({completed.length}/{items.length})</span>
        <div className="flex items-center gap-1.5">
          {(() => {
  const p = dataModel._pagination as { page: number; totalPages: number } | undefined
  return p && (
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
})()}
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
                  isSelected && 'border-primary/40 bg-primary/10',
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOne(habit.id)}
                  className="size-4 rounded accent-blue-500"
                />
                <div className="flex-1">
                  <div className={cn('text-sm font-medium', isSelected && 'text-muted-foreground line-through')}>
                    {habit.title}
                  </div>
                  <div className={cn('text-xs text-muted-foreground', isSelected && 'text-muted-foreground')}>
                    {habit.streak > 0 && `${habit.streak} 天连续 · `}{habit.defaultTime}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleQuickLog(habit.id)}
                    className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    完成
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailHabit(habit)}
                    className="rounded border border-hairline bg-canvas px-2 py-1 text-xs text-ink hover:bg-hover-overlay transition-colors"
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
              className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
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
              <span className="text-success">✓</span>
              <span>{habit.title}</span>
              <span className="text-xs text-muted-foreground">{habit.streak} 天连续</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
