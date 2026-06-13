/**
 * @file HabitActionPanel
 * @brief 习惯操作面板 Surface
 * 
 * CNUI Surface 组件，支持习惯的激活、暂停、恢复、归档操作
 */

'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

/**
 * 习惯项
 */
interface HabitItem {
  /** ID */
  id: string
  /** 标题 */
  title: string
  /** 默认时间 */
  defaultTime: string
  /** 连续天数 */
  streak: number
  /** 频率类型 */
  frequencyType?: string
  /** 状态 */
  status: string
}

/**
 * 习惯操作面板属性
 */
interface HabitActionPanelProps {
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

/** 操作标签映射 */
const ACTION_LABELS: Record<string, { title: string; button: string }> = {
  activate: { title: '激活草稿习惯', button: '激活所选' },
  suspend: { title: '暂停活跃习惯', button: '暂停所选' },
  reactivate: { title: '恢复暂停习惯', button: '恢复所选' },
  archive: { title: '归档暂停习惯', button: '归档所选' },
}

export function HabitActionPanel({ dataModel, onDataChange, onConfirm, onCancel, isLoading, onRequestFullscreen }: HabitActionPanelProps) {
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
    <>
      {/* 翻页 + 全屏控件 — 仅在有控件时渲染 */}
      {(dataModel._pagination || onRequestFullscreen) && (
        <div className="mb-3 flex items-center justify-end gap-1.5">
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
      )}

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-body/70">没有符合条件的习惯</p>
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
                  <div
                    className={cn(
                      'text-sm font-medium',
                      isSelected && 'text-muted-foreground line-through',
                    )}
                  >
                    {habit.title}
                  </div>
                  <div
                    className={cn(
                      'text-xs text-muted-foreground',
                      isSelected && 'text-muted-foreground',
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
              className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
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
    </>
  )
}
