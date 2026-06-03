/**
 * @file tag-calculator
 * @brief 任务 AI 维护标签计算逻辑
 *
 * 根据任务字段状态自动计算 clarity、complexity、decomposition
 * 遵循 Spec §4.1 定义的计算规则
 */

import type { Task } from '../../usom/types/objects'
import type { ClarityLevel, ComplexityTag, DecompositionLevel } from '../../usom/types/primitives'

// ─── Clarity 计算 ────────────────────────────────────────────────

/**
 * 判断任务描述是否无意义
 * @param title - 任务标题
 * @param description - 任务描述
 * @returns 描述是否无意义（过短或与标题高度重复）
 */
function isDescriptionMeaningless(title: string, description: string | undefined): boolean {
  if (!description) return true
  if (description.length < 10) return true

  // 计算 Jaccard 相似度（简单字符集合版本）
  const titleChars = new Set(title.toLowerCase().split(''))
  const descChars = new Set(description.toLowerCase().split(''))
  const intersectionSize = Array.from(titleChars).filter(c => descChars.has(c)).length
  const unionSize = new Set(Array.from(titleChars).concat(Array.from(descChars))).size
  const jaccard = intersectionSize / unionSize

  return jaccard > 0.8
}

/**
 * 计算认知清晰度
 * @param task - 任务对象
 * @returns 清晰度级别
 */
export function calculateClarity(task: Task): ClarityLevel {
  // fuzzy: description 缺失或无意义
  if (!task.description || isDescriptionMeaningless(task.title, task.description)) {
    return 'fuzzy'
  }

  // scoped: title + description 有意义，但缺少执行参数
  if (!task.estimatedDuration) {
    return 'scoped'
  }

  // actionable: 所有核心字段完整
  if (task.estimatedDuration > 0) {
    return 'actionable'
  }

  return 'fuzzy'
}

// ─── Complexity 计算 ─────────────────────────────────────────────

/**
 * 计算任务复杂度标签（规则部分）
 * @param task - 任务对象
 * @returns 复杂度标签数组
 */
export function calculateComplexity(task: Task): ComplexityTag[] {
  const tags: ComplexityTag[] = []

  const estimatedDuration = task.estimatedDuration ?? 0
  const childCount = task.aiTags?.childCount as number ?? 0

  if (estimatedDuration > 180 || childCount > 2) {
    tags.push('multi_step')
  }

  return tags
}

/**
 * 自下而上聚合子任务复杂度
 * @param parentComplexity - 父任务当前复杂度
 * @param childComplexities - 子任务复杂度数组
 * @returns 推荐新增的复杂度标签
 */
export function recommendParentComplexity(
  parentComplexity: ComplexityTag[],
  childComplexities: ComplexityTag[][],
): ComplexityTag[] {
  const childUnion = new Set(childComplexities.flat())
  const parentSet = new Set(parentComplexity)
  const recommended: ComplexityTag[] = []

  for (const tag of Array.from(childUnion)) {
    if (!parentSet.has(tag)) {
      recommended.push(tag)
    }
  }

  return recommended
}

// ─── Decomposition 计算 ─────────────────────────────────────────

/**
 * 计算拆分建议状态
 * @param task - 任务对象
 * @returns 拆分状态
 */
export function calculateDecomposition(task: Task): DecompositionLevel {
  const childCount = task.aiTags?.childCount as number ?? 0
  const childCompletionRate = task.aiTags?.childCompletionRate as number ?? 0
  const estimatedDuration = task.estimatedDuration ?? 0

  if (!childCount && estimatedDuration <= 120) {
    return 'atomic'
  }

  if (!childCount && estimatedDuration > 120) {
    return 'splittable'
  }

  if (childCount && childCompletionRate < 1) {
    return 'splitting_in_progress'
  }

  if (childCount && childCompletionRate >= 1) {
    return 'decomposed'
  }

  return 'atomic'
}

// ─── 批量重计算 ──────────────────────────────────────────────────

/**
 * 重新计算任务的所有 AI 维护标签
 * @param task - 任务对象
 * @returns 更新后的标签（clarity / complexity / decomposition）
 */
export function recalculateAITags(task: Task): Pick<Task, 'clarity' | 'complexity' | 'decomposition'> {
  return {
    clarity: calculateClarity(task),
    complexity: calculateComplexity(task),
    decomposition: calculateDecomposition(task),
  }
}
