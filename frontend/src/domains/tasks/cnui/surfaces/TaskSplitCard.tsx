/**
 * @file TaskSplitCard
 * @brief 任务拆分卡片 CNUI Surface
 *
 * CNUI 表面 — 用于 AI 建议拆分可拆分任务。
 * MVP 阶段为占位 UI，展示任务列表 + "AI 拆分功能开发中" 提示。
 */

'use client'

/** TaskSplitCard 组件属性 */
interface TaskSplitCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

/**
 * 任务拆分卡片组件
 * @description AI 对话内展示的任务拆分建议（MVP 占位）
 */
export function TaskSplitCard({ dataModel, onCancel, isDone }: TaskSplitCardProps) {
  const items = (dataModel.items as Array<Record<string, unknown>>) ?? []

  if (isDone) {
    return (
      <p className="text-sm text-ink text-center py-2">✅ 拆分请求已提交</p>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {items.length > 0 ? (
          <div className="max-h-40 overflow-y-auto space-y-1">
            {items.map(item => (
              <div
                key={item.id as string}
                className="rounded-md border border-hairline bg-canvas px-3 py-1.5 text-sm text-ink truncate"
                title={item.title as string}
              >
                {item.title as string}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-body/70 text-center py-2">暂无可拆分的任务</p>
        )}

        <p className="text-xs text-body/70 text-center">
          🚧 AI 拆分功能正在开发中，敬请期待
        </p>

        {onCancel && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </>
  )
}
