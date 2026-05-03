// Rule Engine 入口
// T018: 工厂函数，注册 timebox 规则，暴露 evaluate 方法

import { evaluateRules } from './evaluator'
import type { Rule, AggregatedResult } from './evaluator'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot } from '@/usom/types/process'

import {
  FieldCompletenessRule,
  DurationRangeRule,
  StartTimeInFutureRule,
} from './rules/timebox'

// ─── 默认 timebox 规则集 ──────────────────────────────────────

const TIMEBOX_RULES: Rule[] = [
  FieldCompletenessRule,
  DurationRangeRule,
  StartTimeInFutureRule,
]

// ─── Rule Engine 接口 ─────────────────────────────────────────

export interface RuleEngine {
  /**
   * 评估意图是否满足所有规则
   *
   * @param intent   - 待评估的结构化意图
   * @param snapshot - 当前上下文快照
   * @returns 聚合评估结果
   */
  evaluate(
    intent: StructuredIntent,
    snapshot: ContextSnapshot,
  ): AggregatedResult
}

// ─── 工厂函数 ─────────────────────────────────────────────────

/**
 * 创建 Rule Engine 实例
 *
 * 当前内置 timebox 规则集：
 * 1. FieldCompletenessRule — title/startTime/duration 非空
 * 2. DurationRangeRule — 5 ≤ duration ≤ 480 分钟
 * 3. StartTimeInFutureRule — startTime > 当前时间
 *
 * @returns RuleEngine 实例
 */
export function createRuleEngine(): RuleEngine {
  // 使用闭包持有规则集，未来可扩展为按 domain 动态注册
  const rules = [...TIMEBOX_RULES]

  return {
    evaluate(intent: StructuredIntent, snapshot: ContextSnapshot): AggregatedResult {
      return evaluateRules(rules, intent, snapshot)
    },
  }
}

// 重导出类型，供外部使用
export type { Rule, RuleResult, AggregatedResult } from './evaluator'
