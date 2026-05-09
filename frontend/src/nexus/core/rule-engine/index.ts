// Rule Engine 入口
// T018: 工厂函数，注册 timebox 规则，暴露 evaluate 方法
// T027: 支持异步规则 + TimeOverlapRule 依赖注入

import { evaluateRules } from './evaluator'
import type { Rule, AggregatedResult } from './evaluator'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot } from '@/usom/types/process'
import type { ITimeboxRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'

import {
  FieldCompletenessRule,
  DurationRangeRule,
  StartTimeInFutureRule,
  DelayedStartRule,
} from './rules/timebox'
import { createTimeOverlapRule } from './rules/timebox-overlap'

// ─── 默认 timebox 基础规则集（不含异步规则）──────────────────

const BASE_RULES: Rule[] = [
  FieldCompletenessRule,
  DurationRangeRule,
  StartTimeInFutureRule,
  DelayedStartRule,
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
  ): Promise<AggregatedResult>
}

// ─── 工厂参数 ─────────────────────────────────────────────────

/** Rule Engine 工厂的可选依赖 */
export interface RuleEngineDeps {
  /** 时间盒仓库（用于 TimeOverlapRule） */
  timeboxRepo?: ITimeboxRepository
  /** 用户 ID（用于 TimeOverlapRule 的多租户查询） */
  userId?: USOM_ID
}

// ─── 工厂函数 ─────────────────────────────────────────────────

/**
 * 创建 Rule Engine 实例
 *
 * 当前内置 timebox 规则集：
 * 1. FieldCompletenessRule — title/startTime/duration 非空
 * 2. DurationRangeRule — 5 ≤ duration ≤ 480 分钟
 * 3. StartTimeInFutureRule — startTime > 当前时间
 * 4. TimeOverlapRule（需要 deps） — 检测时间区间冲突
 *
 * @param deps - 可选依赖（timeboxRepo + userId 启用重叠检测）
 * @returns RuleEngine 实例
 */
export function createRuleEngine(deps?: RuleEngineDeps): RuleEngine {
  // 组装规则集：基础规则 + 可选的异步重叠检测规则
  const rules: Rule[] = [...BASE_RULES]

  if (deps?.timeboxRepo && deps?.userId) {
    rules.push(createTimeOverlapRule(deps.timeboxRepo, deps.userId))
  }

  return {
    async evaluate(intent: StructuredIntent, snapshot: ContextSnapshot): Promise<AggregatedResult> {
      return evaluateRules(rules, intent, snapshot)
    },
  }
}

// 重导出类型，供外部使用
export type { Rule, RuleResult, AggregatedResult } from './evaluator'
