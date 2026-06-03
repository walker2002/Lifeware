/**
 * @file tag-calculator.test
 * @brief 标签计算器单元测试
 */

import { describe, it, expect } from 'vitest'
import {
  calculateClarity,
  calculateComplexity,
  calculateDecomposition,
  recommendParentComplexity,
  recalculateAITags,
} from '../tag-calculator'
import type { Task } from '../../../usom/types/objects'

// ─── 测试辅助 ────────────────────────────────────────────────────

/**
 * 构建测试用 Task 对象
 * @param partial - 部分覆盖字段
 * @returns 完整的 Task 对象
 */
function makeTask(partial: Partial<Task> = {}): Task {
  return {
    id: 'test-id',
    status: 'todo',
    title: partial.title ?? '测试任务',
    description: partial.description,
    priority: 'medium',
    energyRequired: 'medium',
    estimatedDuration: partial.estimatedDuration,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clarity: 'fuzzy',
    complexity: [],
    captureMode: 'ad_hoc',
    tracking: 'check_in',
    aiTags: partial.aiTags ?? {},
    ...partial,
  } as Task
}

// ─── calculateClarity ────────────────────────────────────────────

describe('calculateClarity', () => {
  it('没有 description 时应返回 fuzzy', () => {
    const task = makeTask({ description: undefined })
    expect(calculateClarity(task)).toBe('fuzzy')
  })

  it('description 与 title 高度重复时应返回 fuzzy', () => {
    const task = makeTask({ title: '完成周报', description: '完成周报' })
    expect(calculateClarity(task)).toBe('fuzzy')
  })

  it('description 正好 10 个字符时应返回 scoped（边界：>= 10 视为有意义）', () => {
    const task = makeTask({ title: '测试', description: '一二三四五六七八九十一' })
    expect(calculateClarity(task)).toBe('scoped')
  })

  it('description 9 个字符时应返回 fuzzy', () => {
    const task = makeTask({ title: '测试', description: '一二三四五六七八九' })
    expect(calculateClarity(task)).toBe('fuzzy')
  })

  it('description 超过 10 字符且有意义时应按后续规则判断', () => {
    const task = makeTask({
      title: '完成周报',
      description: '整理本周工作进展并提交',
      estimatedDuration: 30,
    })
    expect(calculateClarity(task)).toBe('actionable')
  })

  it('description 有意义但缺少 estimatedDuration 时应返回 scoped', () => {
    const task = makeTask({
      title: '完成周报',
      description: '整理本周工作进展，撰写周报文档并提交给上级',
    })
    expect(calculateClarity(task)).toBe('scoped')
  })

  it('所有核心字段完整时应返回 actionable', () => {
    const task = makeTask({
      title: '完成周报',
      description: '整理本周工作进展，撰写周报文档并提交给上级',
      estimatedDuration: 30,
    })
    expect(calculateClarity(task)).toBe('actionable')
  })
})

// ─── calculateComplexity ─────────────────────────────────────────

describe('calculateComplexity', () => {
  it('estimatedDuration > 180 时应包含 multi_step', () => {
    const task = makeTask({ estimatedDuration: 200 })
    expect(calculateComplexity(task)).toContain('multi_step')
  })

  it('estimatedDuration <= 180 且无子任务时不应包含 multi_step', () => {
    const task = makeTask({ estimatedDuration: 60 })
    expect(calculateComplexity(task)).not.toContain('multi_step')
  })

  it('childCount > 2 时应包含 multi_step', () => {
    const task = makeTask({ estimatedDuration: 60, aiTags: { childCount: 3 } })
    expect(calculateComplexity(task)).toContain('multi_step')
  })
})

// ─── calculateDecomposition ──────────────────────────────────────

describe('calculateDecomposition', () => {
  it('duration <= 120 且无子任务时应返回 atomic', () => {
    const task = makeTask({ estimatedDuration: 60 })
    expect(calculateDecomposition(task)).toBe('atomic')
  })

  it('duration > 120 且无子任务时应返回 splittable', () => {
    const task = makeTask({ estimatedDuration: 180 })
    expect(calculateDecomposition(task)).toBe('splittable')
  })

  it('有子任务且未全部完成时应返回 splitting_in_progress', () => {
    const task = makeTask({
      estimatedDuration: 200,
      aiTags: { childCount: 3, childCompletionRate: 0.5 },
    })
    expect(calculateDecomposition(task)).toBe('splitting_in_progress')
  })

  it('有子任务且全部完成时应返回 decomposed', () => {
    const task = makeTask({
      estimatedDuration: 200,
      aiTags: { childCount: 3, childCompletionRate: 1 },
    })
    expect(calculateDecomposition(task)).toBe('decomposed')
  })
})

// ─── recalculateAITags ────────────────────────────────────────────

describe('recalculateAITags', () => {
  it('应返回更新后的 clarity/complexity/decomposition', () => {
    const task = makeTask({
      title: '完成周报',
      description: '整理本周工作进展，撰写周报文档并提交给上级',
      estimatedDuration: 30,
    })
    const result = recalculateAITags(task)
    expect(result.clarity).toBe('actionable')
    expect(Array.isArray(result.complexity)).toBe(true)
    expect(result.decomposition).toBeDefined()
  })
})

// ─── recommendParentComplexity ───────────────────────────────────

describe('recommendParentComplexity', () => {
  it('应返回子任务有但父任务没有的标签', () => {
    const recommended = recommendParentComplexity(
      ['routine'],
      [['routine', 'multi_step'], ['creative']],
    )
    expect(recommended).toContain('multi_step')
    expect(recommended).toContain('creative')
    expect(recommended).not.toContain('routine')
  })
})
