/**
 * @file split-warning
 * @brief 任务拆分警告组件
 * 
 * 当任务预估时长超过 12 小时时显示警告，建议拆分为子任务
 */

/**
 * 拆分警告组件
 * 
 * @param estimatedDuration - 预估时长（分钟）
 */
export function SplitWarning({ estimatedDuration }: { estimatedDuration?: number | null }) {
  if (!estimatedDuration || estimatedDuration <= 720) return null

  return (
    <div className="flex items-center gap-2 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
      <span>⚠</span>
      <span>预估时长超过 12 小时，建议拆分为子任务</span>
    </div>
  )
}
