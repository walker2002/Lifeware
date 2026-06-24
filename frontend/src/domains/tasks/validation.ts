/**
 * @file validation
 * @brief Tasks Domain 字段验证规则
 *
 * 遵循 Constitution：Domain 层的纯函数验证，无副作用。
 * [020] RT1：realtime 单字段规则的 message 在此单源定义（TASK_RULE_MESSAGES），
 * 供 rules-registry.ts 与本文件 submit 聚合校验共用，防漂移致回填失配。
 */

import { Priority, EnergyLevel } from '../../usom/types/primitives'

/**
 * [020] F1：rule message 单源，registry realtime 与 submit 校验共用，防漂移致回填失配。
 * 文本逐字取自原 manifest L 区 rules 声明。
 */
export const TASK_RULE_MESSAGES = {
  estimatedDurationPositive: '预估时长必须大于 0',
  estimatedDurationMax: '预估时长不能超过 24 小时（1440 分钟）',
  priorityValid: '优先级必须是 critical/high/medium/low 之一',
  energyRequiredValid: '能量要求必须是 high/medium/low 之一',
  dueDateFormat: '截止日期格式必须是 YYYY-MM-DD',
  colorFormat: '颜色格式必须是 #RRGGBB',
} as const

// ─── 任务字段验证 ────────────────────────────────────────────────

/**
 * 验证任务字段
 * @param fields - 字段对象
 * @param action - 操作类型
 * @returns 验证结果
 */
export function validateTaskFields(
  fields: Record<string, unknown>,
  action: 'createTask' | 'updateTask',
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // title 验证
  const title = fields['title']
  if (action === 'createTask') {
    if (!title || (typeof title === 'string' && title.trim() === '')) {
      errors.push('任务标题必填')
    }
  }
  if (typeof title === 'string' && title.length > 200) {
    errors.push('任务标题不能超过 200 字符')
  }

  // description 验证
  const description = fields['description']
  if (typeof description === 'string' && description.length > 5000) {
    errors.push('任务描述不能超过 5000 字符')
  }

  // estimatedDuration 验证
  const estimatedDuration = fields['estimatedDuration']
  if (estimatedDuration !== undefined) {
    if (typeof estimatedDuration !== 'number' || estimatedDuration <= 0) {
      errors.push(TASK_RULE_MESSAGES.estimatedDurationPositive)
    }
    if (typeof estimatedDuration === 'number' && estimatedDuration > 1440) {
      errors.push(TASK_RULE_MESSAGES.estimatedDurationMax)
    }
  }

  // priority 验证
  const priority = fields['priority']
  if (priority !== undefined) {
    const validPriorities = Object.values(Priority)
    if (!validPriorities.includes(priority as Priority)) {
      errors.push(TASK_RULE_MESSAGES.priorityValid)
    }
  }

  // energyRequired 验证
  const energyRequired = fields['energyRequired']
  if (energyRequired !== undefined) {
    const validLevels = Object.values(EnergyLevel)
    if (!validLevels.includes(energyRequired as EnergyLevel)) {
      errors.push(TASK_RULE_MESSAGES.energyRequiredValid)
    }
  }

  // dueDate 格式验证
  const dueDate = fields['dueDate']
  if (dueDate !== undefined && dueDate !== null) {
    if (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      errors.push(TASK_RULE_MESSAGES.dueDateFormat)
    }
  }

  return { valid: errors.length === 0, errors }
}

// ─── 主线字段验证 ────────────────────────────────────────────────

/**
 * 验证主线字段
 * @param fields - 字段对象
 * @param action - 操作类型
 * @returns 验证结果
 */
export function validateThreadFields(
  fields: Record<string, unknown>,
  action: 'createThread' | 'updateThread',
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // name 验证
  const name = fields['name']
  if (action === 'createThread') {
    if (!name || (typeof name === 'string' && name.trim() === '')) {
      errors.push('主线名称必填')
    }
  }
  if (typeof name === 'string' && name.length > 200) {
    errors.push('主线名称不能超过 200 字符')
  }

  // color 格式验证
  const color = fields['color']
  if (color !== undefined && color !== null) {
    if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      errors.push(TASK_RULE_MESSAGES.colorFormat)
    }
  }

  return { valid: errors.length === 0, errors }
}
