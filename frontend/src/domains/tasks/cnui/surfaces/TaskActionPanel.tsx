/**
 * @file TaskActionPanel
 * @brief 任务操作面板 CNUI Surface
 *
 * CN-UI Surface 组件，处理 completeTask、archiveTask、deleteTask、refineTask 等任务操作。
 * 支持多选 + 批量确认。
 */

'use client'

import { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'

/** 任务列表项 */
interface TaskItem {
  id: string
  title: string
  priority: string
  estimatedDuration: number
  status: string
  clarity?: string         /** 任务清晰度 */
  startDate?: string       /** 计划开始日期 */
  endDate?: string         /** 计划结束日期 */
  actualDuration?: number  /** 实际耗时（分钟） */
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
  /** 全屏请求回调 */
  onRequestFullscreen?: () => void
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

/** 状态标签 */
const STATUS_LABELS: Record<string, string> = {
  todo: '待办',
  planned: '计划中',
  in_progress: '进行中',
  completed: '已完成',
  archived: '已归档',
}

/** 清晰度标签 */
const CLARITY_LABELS: Record<string, string> = {
  fuzzy: '模糊',
  scoped: '有范围',
  actionable: '可执行',
}

/**
 * 任务操作面板组件
 * @description 处理任务的完成、归档、删除和细化批量操作
 */
export function TaskActionPanel({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone, onRequestFullscreen }: TaskActionPanelProps) {
  const action = (dataModel.action as string) ?? 'complete'
  const items = (dataModel.items as TaskItem[]) ?? []
  const labels = ACTION_LABELS[action] ?? ACTION_LABELS.complete

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [localSearch, setLocalSearch] = useState('')

  useEffect(() => {
    setSelectedIds(new Set())
    setLocalSearch('')  // 切换 action 时清空搜索
  }, [action])

  // 本地搜索过滤
  const filteredItems = useMemo(() => {
    if (!localSearch.trim()) return items
    const q = localSearch.trim().toLowerCase()
    return items.filter(t => t.title.toLowerCase().includes(q))
  }, [items, localSearch])

  const allSelected = filteredItems.length > 0 && filteredItems.every(t => selectedIds.has(t.id))

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(filteredItems.map(t => t.id)))
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
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{labels.title}</span>
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

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-body">没有符合条件的任务</p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* 搜索框 */}
          <div className="relative mb-1">
            <input
              type="text" value={localSearch}
              onChange={e => setLocalSearch(e.target.value)}
              placeholder="按标题过滤..."
              className="w-full h-7 pl-2.5 pr-3 rounded-md border border-hairline bg-canvas text-xs text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
          </div>

          {filteredItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-body">无匹配任务</p>
          ) : (
            <>
              {/* 全选栏 */}
              <div className="flex items-center justify-between border-b border-hairline pb-2 text-xs text-body">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="size-4 rounded"
                  />
                  全选
                </label>
                <span>已选 {selectedIds.size} / {filteredItems.length}</span>
              </div>

              {/* 任务列表 */}
              {filteredItems.map(task => {
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
                      <div className={cn('text-sm font-medium truncate', isSelected && 'text-body line-through')} title={task.title}>
                        {task.title}
                      </div>
                      <div className="text-xs text-body">
                        {STATUS_LABELS[task.status] ?? task.status}
                        {task.clarity && ` · ${CLARITY_LABELS[task.clarity] ?? task.clarity}`}
                        {task.startDate && ` · ${task.startDate.slice(0, 10)}`}
                        {task.actualDuration ? ` · 实际${task.actualDuration}分钟` : (task.estimatedDuration ? ` · ${task.estimatedDuration}分钟` : '')}
                      </div>
                    </div>
                  </label>
                )
              })}
            </>
          )}

          {action === 'delete' && selectedIds.size > 0 && (
            <div className="rounded-md border border-error bg-error-soft px-3 py-2 text-xs text-error">
              ⚠️ 删除操作不可恢复。子任务将自动变为根任务。
            </div>
          )}

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
