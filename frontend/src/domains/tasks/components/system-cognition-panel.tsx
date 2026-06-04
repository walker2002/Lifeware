/**
 * @file system-cognition-panel
 * @brief 系统认知面板（B 区）
 *
 * 展示 AI 维护的标签（clarity, complexity, decomposition）
 * 用户只读，作为 AI "思维过程透明化" 的展示
 */

import { Brain, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '../../../usom/types/objects'

// ─── 类型定义 ──────────────────────────────────────────────────────────

/** 系统认知面板 Props */
interface SystemCognitionPanelProps {
  /** 任务对象 */
  task: Task
}

// ─── 清晰度标签映射 ────────────────────────────────────────────────────

/** 清晰度等级对应的中文标签 */
const CLARITY_LABELS: Record<string, string> = {
  fuzzy: '模糊',
  scoped: '已界定',
  actionable: '可执行',
}

/** 清晰度等级对应的背景色 */
const CLARITY_BG: Record<string, string> = {
  fuzzy: 'bg-warning-soft',
  scoped: 'bg-info-soft',
  actionable: 'bg-success-soft',
}

/** 清晰度等级对应的文字色 */
const CLARITY_TEXT: Record<string, string> = {
  fuzzy: 'text-warning',
  scoped: 'text-info',
  actionable: 'text-success',
}

/** 清晰度等级对应的进度条色 */
const CLARITY_BAR: Record<string, string> = {
  fuzzy: 'bg-warning',
  scoped: 'bg-info',
  actionable: 'bg-success',
}

/** 复杂度标签映射 */
const COMPLEXITY_LABELS: Record<string, string> = {
  routine: '常规',
  structure_unknown: '结构未知',
  multi_step: '多步骤',
  exploratory: '探索性',
  creative: '创造性',
}

/** 分解等级映射 */
const DECOMPOSITION_LABELS: Record<string, string> = {
  atomic: '原子任务',
  splittable: '可拆分',
  splitting_in_progress: '拆分中',
  decomposed: '已分解',
}

// ─── 组件 ──────────────────────────────────────────────────────────────

/**
 * 系统认知面板组件
 * @param props - 组件属性
 */
export function SystemCognitionPanel({ task }: SystemCognitionPanelProps) {
  const clarityLabel = CLARITY_LABELS[task.clarity] ?? task.clarity

  return (
    <div className="rounded-lg border border-hairline bg-surface-soft p-4">
      {/* ── 标题 ── */}
      <h3 className="mb-4 flex items-center text-sm font-semibold text-ink">
        <Brain className="size-4 mr-1 text-primary" />
        系统认知
      </h3>

      {/* ── 认知清晰度（三阶段进度条）── */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-ink-secondary">认知清晰度</span>
          <span className={cn('font-medium', CLARITY_TEXT[task.clarity])}>
            {clarityLabel}
          </span>
        </div>

        {/* 三阶段进度条 */}
        <div className="flex items-center gap-0.5">
          {(['fuzzy', 'scoped', 'actionable'] as const).map((stage, idx) => {
            const isActive = stage === task.clarity
            const isPast =
              (task.clarity === 'scoped' && stage === 'fuzzy') ||
              (task.clarity === 'actionable' && (stage === 'fuzzy' || stage === 'scoped'))

            return (
              <div key={stage} className="flex items-center flex-1">
                {/* 阶段段 */}
                <div
                  className={cn(
                    'h-2 rounded-full flex-1 transition-colors',
                    isActive || isPast
                      ? CLARITY_BAR[stage]
                      : 'bg-surface-card',
                    isActive && 'ring-2 ring-focus-ring ring-offset-1',
                  )}
                  title={CLARITY_LABELS[stage]}
                />
                {/* 连接线（除最后一段外） */}
                {idx < 2 && (
                  <div
                    className={cn(
                      'h-px w-2 shrink-0 transition-colors',
                      isPast || (isActive && idx === 1)
                        ? 'bg-success'
                        : isActive && idx === 0
                          ? 'bg-warning/50'
                          : 'bg-hairline',
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* 阶段标签 */}
        <div className="flex justify-between mt-1 text-[10px] text-muted-soft">
          <span className={cn(task.clarity === 'fuzzy' && 'text-warning font-medium')}>
            模糊
          </span>
          <span className={cn(task.clarity === 'scoped' && 'text-info font-medium')}>
            已界定
          </span>
          <span className={cn(task.clarity === 'actionable' && 'text-success font-medium')}>
            可执行
          </span>
        </div>
      </div>

      {/* ── 复杂度标签 ── */}
      {task.complexity.length > 0 && (
        <div className="mb-3">
          <span className="text-xs text-muted-soft">复杂度</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {task.complexity.map(tag => (
              <span
                key={tag}
                className="rounded bg-surface-card px-2 py-0.5 text-xs text-ink"
              >
                {COMPLEXITY_LABELS[tag] ?? tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── 拆分状态 ── */}
      {task.decomposition && (
        <div className="mb-3">
          <span className="text-xs text-muted-soft">拆分状态</span>
          <div className="mt-1">
            <span className="text-xs text-ink">
              {DECOMPOSITION_LABELS[task.decomposition] ?? task.decomposition}
            </span>
            {task.decomposition === 'splittable' && (
              <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                <Lightbulb className="size-3" />
                AI 建议：此任务可拆分为更小的子任务
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── AI 扩展信息 ── */}
      {Object.keys(task.aiTags).length > 0 && (
        <div className="border-t border-hairline pt-3">
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-soft hover:text-ink transition-colors">
              AI 扩展数据
            </summary>
            <pre className="mt-2 max-h-32 overflow-auto rounded bg-surface-card p-2 text-ink text-[11px]">
              {JSON.stringify(task.aiTags, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
