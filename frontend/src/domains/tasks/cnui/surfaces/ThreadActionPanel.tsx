/**
 * @file ThreadActionPanel
 * @brief 主线操作面板 Surface（更新/归档/暂停/恢复/完成）
 *
 * CN-UI Surface 组件，处理 updateThread、archiveThread、pauseThread、resumeThread、completeThread 等主线操作
 */

'use client'

/**
 * ThreadActionPanel 组件属性
 */
interface ThreadActionPanelProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

/**
 * 主线操作面板组件
 * @description 处理主线的更新、暂停、恢复、完成和归档操作
 */
export function ThreadActionPanel({ dataModel }: ThreadActionPanelProps) {
  const items = (dataModel.items as Array<Record<string, unknown>>) ?? []
  const action = dataModel.action as string | undefined

  const labels: Record<string, string> = {
    pause: '暂停',
    resume: '恢复',
    complete: '完成',
    archive: '归档',
  }

  return (
    <div className="p-4 text-center">
      {items.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-ink mb-3">
            请选择要{action ? (labels[action] ?? action) : '操作'}的主线：
          </p>
          {items.map(item => (
            <div
              key={item.id as string}
              className="rounded-md border border-hairline bg-canvas px-3 py-2 text-left text-sm text-ink"
            >
              <span className="font-medium">{item.name as string}</span>
              {(item.description as string) && (
                <span className="text-xs text-muted ml-2">{item.description as string}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">主线操作面板（开发中）</p>
      )}
    </div>
  )
}
