// Rule Engine 评估器
// T016: 顺序执行规则，聚合结果，返回最高严重级别

import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot } from '@/usom/types/process'

// ─── 规则接口 ─────────────────────────────────────────────────

/** 单条规则的计算结果 */
export type RuleResult =
  | { severity: 'pass' }
  | { severity: 'warning'; message: string }
  | { severity: 'confirm'; message: string }

/** 规则定义 */
export interface Rule {
  name: string
  evaluate(intent: StructuredIntent, snapshot: ContextSnapshot): RuleResult
}

// ─── 聚合结果类型 ─────────────────────────────────────────────

/** 所有规则评估后的聚合结果 */
export interface AggregatedResult {
  /** 最高严重级别：pass < warning < confirm */
  severity: 'pass' | 'warning' | 'confirm'
  /** 所有 warning 消息 */
  warnings: string[]
  /** 所有 confirm 消息 */
  confirmations: string[]
}

// ─── 严重级别排序 ─────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  pass: 0,
  warning: 1,
  confirm: 2,
}

/**
 * 返回两个严重级别中更高的那个
 */
function higherSeverity(
  a: 'pass' | 'warning' | 'confirm',
  b: 'pass' | 'warning' | 'confirm',
): 'pass' | 'warning' | 'confirm' {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b
}

// ─── 核心评估函数 ─────────────────────────────────────────────

/**
 * 顺序执行规则数组，聚合所有结果
 *
 * 评估逻辑：
 * 1. 逐条执行规则，收集 warning 和 confirm 消息
 * 2. 返回最高严重级别作为聚合结果的 severity
 * 3. 即使遇到 confirm 也不中断，继续评估以收集所有问题
 *
 * @param rules    - 规则数组
 * @param intent   - 待评估的结构化意图
 * @param snapshot - 当前上下文快照
 * @returns 聚合评估结果
 */
export function evaluateRules(
  rules: Rule[],
  intent: StructuredIntent,
  snapshot: ContextSnapshot,
): AggregatedResult {
  let highestSeverity: 'pass' | 'warning' | 'confirm' = 'pass'
  const warnings: string[] = []
  const confirmations: string[] = []

  for (const rule of rules) {
    const result = rule.evaluate(intent, snapshot)

    switch (result.severity) {
      case 'warning':
        warnings.push(result.message)
        break
      case 'confirm':
        confirmations.push(result.message)
        break
    }

    highestSeverity = higherSeverity(highestSeverity, result.severity)
  }

  return {
    severity: highestSeverity,
    warnings,
    confirmations,
  }
}
