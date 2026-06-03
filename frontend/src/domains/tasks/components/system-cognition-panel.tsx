/**
 * @file system-cognition-panel
 * @brief 系统认知面板
 *
 * 展示 AI 维护的标签（clarity, complexity, decomposition）
 * 用户只读，作为 AI "思维过程透明化" 的展示
 */

import type { Task } from '../../../usom/types/objects'

/**
 * 系统认知面板 Props
 */
interface SystemCognitionPanelProps {
  /** 任务对象 */
  task: Task
}

/**
 * 获取清晰度对应的颜色样式
 * @param clarity - 清晰度等级
 * @returns Tailwind 颜色类名
 */
function getClarityColor(clarity: Task['clarity']): string {
  switch (clarity) {
    case 'fuzzy': return 'text-warning'
    case 'scoped': return 'text-info'
    case 'actionable': return 'text-success'
  }
}

/**
 * 获取清晰度对应的进度百分比
 * @param clarity - 清晰度等级
 * @returns 进度百分比
 */
function getClarityProgress(clarity: Task['clarity']): number {
  switch (clarity) {
    case 'fuzzy': return 33
    case 'scoped': return 66
    case 'actionable': return 100
  }
}

/**
 * 系统认知面板组件
 * @param props - 组件属性
 */
export function SystemCognitionPanel({ task }: SystemCognitionPanelProps) {
  return (
    <div className="rounded-lg border border-border bg-canvas-subtle p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">🤖 系统认知</h3>

      {/* 认知清晰度 */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-secondary">认知清晰度</span>
          <span className={getClarityColor(task.clarity)}>{task.clarity}</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${getClarityProgress(task.clarity)}%` }}
          />
        </div>
      </div>

      {/* 复杂度标签 */}
      {task.complexity.length > 0 && (
        <div className="mb-3">
          <span className="text-xs text-ink-secondary">复杂度：</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {task.complexity.map(tag => (
              <span key={tag} className="rounded bg-surface px-2 py-0.5 text-xs text-ink">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 拆分状态 */}
      {task.decomposition && (
        <div className="mb-3">
          <span className="text-xs text-ink-secondary">拆分状态：</span>
          <span className="ml-2 text-xs text-ink">{task.decomposition}</span>
          {task.decomposition === 'splittable' && (
            <p className="mt-1 text-xs text-warning">
              💡 AI 建议：此任务可拆分为更小的子任务
            </p>
          )}
        </div>
      )}

      {/* AI 扩展信息 */}
      {Object.keys(task.aiTags).length > 0 && (
        <div className="border-t border-border pt-2">
          <details className="text-xs">
            <summary className="cursor-pointer text-ink-secondary">AI 扩展数据</summary>
            <pre className="mt-2 max-h-32 overflow-auto rounded bg-canvas p-2 text-ink">
              {JSON.stringify(task.aiTags, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
