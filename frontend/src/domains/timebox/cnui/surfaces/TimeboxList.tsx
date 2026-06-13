/**
 * @file TimeboxList
 * @brief 智能编排时间盒列表 Surface
 *
 * CNUI Surface 组件，展示智能编排方案中的时间盒列表
 */

'use client'

/**
 * 时间盒项
 */
interface TimeboxItem {
  /** 标题 */
  title: string
  /** 开始时间 */
  startTime: string
  /** 结束时间 */
  endTime: string
  /** 颜色 */
  color?: string
}

/**
 * 时间盒列表属性
 */
interface TimeboxListProps {
  /** Surface 类型 */
  surfaceType: string
  /** 数据模型 */
  dataModel: Record<string, unknown>
  /** 数据变更回调 */
  onDataChange: (data: Record<string, unknown>) => void
  /** 确认回调 */
  onConfirm: (data: Record<string, unknown>) => void
  /** 取消回调 */
  onCancel?: () => void
  /** 是否完成 */
  isDone?: boolean
  /** 是否加载中 */
  isLoading?: boolean
}

export function TimeboxList({ dataModel, onDataChange, onConfirm, onCancel, isDone, isLoading }: TimeboxListProps) {
  const items = (dataModel.items as TimeboxItem[]) ?? []

  function removeItem(index: number) {
    const updated = items.filter((_, i) => i !== index)
    onDataChange({ ...dataModel, items: updated })
  }

  if (isDone) {
    return (
      <p className="text-sm text-ink text-center py-2">✅ 编排方案已确认</p>
    )
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">智能编排方案 ({items.length} 项)</span>
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
        </div>
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-body/70">暂无时间盒</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-md border border-hairline bg-canvas p-3"
              style={{ borderLeftColor: item.color ?? '#6366f1', borderLeftWidth: 4 }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate">{item.title}</div>
                <div className="text-xs text-body/70">
                  {item.startTime} - {item.endTime}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="text-xs text-error/70 hover:text-error transition-colors"
              >
                移除
              </button>
            </div>
          ))}
        </div>
      )}

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
          onClick={() => onConfirm(dataModel)}
          disabled={items.length === 0 || isLoading}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 transition-colors"
        >
          确认全部
        </button>
        </div>
    </>
  )
}
