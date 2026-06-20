/**
 * @file adapter
 * @brief [018-G3] realtime FieldIssue[] → ValidationResult 适配器
 *
 * submit 权威阶段重跑 phase: both 规则的 RealtimeCheck 后，经本适配器转为 ValidationResult，
 * 与 phase: submit 规则的 5 变体结果一起喂 aggregateValidation（§4.3 聚合语义）。
 * realtime 只硬错误：非空 issue = Rejected。
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { FieldIssue } from './types'

/**
 * 把 realtime 检查产出的 FieldIssue[] 适配为 ValidationResult。
 * - 空 → Passed
 * - 非空 → Rejected（errors = 各 issue.message；field 归属保留在 issue 中供 §4.4 回填）
 */
export function fieldIssuesToValidationResult(
  issues: FieldIssue[],
): ReturnType<typeof validationPassed> | ReturnType<typeof validationRejected> {
  if (issues.length === 0) return validationPassed()
  return validationRejected(issues.map((i) => i.message))
}
