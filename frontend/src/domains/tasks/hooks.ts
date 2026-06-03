/**
 * @file hooks
 * @brief Tasks 域钩子函数工厂（重构后）
 *
 * 工厂函数模式，遵循 Constitution Principle VI: 无副作用、无数据库调用
 * 提供意图验证、事件响应和动作表面请求处理能力
 */

import type {
  USOMSnapshot,
  SystemEvent,
  DerivedSignals,
  ActionCandidate,
  ActionSurfaceSuggestion,
  MetricUpdate,
} from '../../usom/types/process'
import type { StructuredIntent } from '../../usom/types/objects'
import type { USOM_ID, ActionCategory } from '../../usom/types/primitives'
import type { DomainManifest } from '../../domains/manifest-loader/schema'
import { validateTaskFields, validateThreadFields } from './validation'

/**
 * 构建状态转换映射
 * @param transitions - 生命周期转换列表
 * @returns 源状态到目标状态的映射
 */
function buildTransitionMap(
  transitions: Array<{ from: string | string[] | null; to: string }>,
): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const t of transitions) {
    const fromStates = t.from === null ? [] : Array.isArray(t.from) ? t.from : [t.from]
    for (const from of fromStates) {
      if (!map[from]) map[from] = []
      if (!map[from].includes(t.to)) map[from].push(t.to)
    }
  }
  return map
}

/**
 * 创建任务域钩子函数
 * @param manifest - 域 manifest
 * @returns 钩子函数对象
 */
export function createTasksHooks(manifest: DomainManifest) {
  const subscribedEvents = new Set(manifest.subscribed_events)
  const taskTransitions = manifest.lifecycle.task
    ? buildTransitionMap(manifest.lifecycle.task.transitions)
    : {}
  const threadTransitions = manifest.lifecycle.thread
    ? buildTransitionMap(manifest.lifecycle.thread.transitions)
    : {}

  /**
   * 验证意图
   * @param intent - 结构化意图
   * @param _snapshot - USOM 快照
   * @returns 验证结果
   */
  function onValidate(
    intent: StructuredIntent,
    _snapshot: USOMSnapshot,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const { fields, action } = intent

    if (action === 'createTask' || action === 'updateTask') {
      const result = validateTaskFields(fields, action as 'createTask' | 'updateTask')
      errors.push(...result.errors)
    }

    if (action === 'createThread' || action === 'updateThread') {
      const result = validateThreadFields(fields, action as 'createThread' | 'updateThread')
      errors.push(...result.errors)
    }

    // 生命周期状态转换验证
    const targetStatus = fields['targetStatus'] as string | undefined
    const currentStatus = fields['currentStatus'] as string | undefined
    const targetType = fields['targetType'] as 'task' | 'thread' | undefined

    if (targetStatus && currentStatus && targetType) {
      const transitions = targetType === 'thread' ? threadTransitions : taskTransitions
      const allowed = transitions[currentStatus] ?? []
      if (!allowed.includes(targetStatus)) {
        errors.push(`${currentStatus} 状态不能转换为 ${targetStatus}`)
      }
    }

    if (action === 'promoteToThread') {
      const taskId = fields['taskId']
      if (!taskId || typeof taskId !== 'string') {
        errors.push('taskId 必填')
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * 处理系统事件
   * @param event - 系统事件
   * @param _snapshot - USOM 快照
   * @returns 指标更新和动作表面建议
   */
  function onEvent(
    event: SystemEvent,
    _snapshot: USOMSnapshot,
  ): { metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] } {
    if (!subscribedEvents.has(event.type)) {
      return { metrics: [], suggestions: [] }
    }

    const title = (event.payload['title'] || event.payload['name'] || '未命名') as string

    switch (event.type) {
      case 'ThreadCreated':
        return {
          metrics: [{ metricKey: 'thread_created', value: 1 }],
          suggestions: [{
            actionType: 'create_task',
            label: `新主线已创建: ${title}，添加第一个任务`,
            weight: 60,
          }],
        }

      case 'TaskCreated': {
        const clarity = event.payload['clarity'] as string
        if (clarity === 'fuzzy') {
          return {
            metrics: [],
            suggestions: [{
              actionType: 'refine_task',
              label: `新任务很模糊，需要细化: ${title}`,
              weight: 70,
            }],
          }
        }
        return {
          metrics: [{ metricKey: 'task_created', value: 1 }],
          suggestions: [],
        }
      }

      case 'TaskActivated':
      case 'TaskPlanned':
        return {
          metrics: [],
          suggestions: [{
            actionType: 'complete_task',
            label: `任务已就绪: ${title}`,
            weight: 50,
          }],
        }

      case 'TaskCompleted':
        return {
          metrics: [{ metricKey: 'task_completed', value: 1 }],
          suggestions: [{
            actionType: 'review_task',
            label: `任务已完成: ${title}，进行复盘`,
            weight: 60,
          }],
        }

      case 'ExecutionLogged':
        return {
          metrics: [{ metricKey: 'task_execution_logged', value: 1 }],
          suggestions: [],
        }

      default:
        return { metrics: [], suggestions: [] }
    }
  }

  /**
   * 处理动作表面请求
   * @param snapshot - USOM 快照
   * @param _signals - 派生信号
   * @returns 动作候选列表、分类和权重
   */
  function onActionSurfaceRequest(
    snapshot: USOMSnapshot,
    _signals: Readonly<DerivedSignals>,
  ): { actions: ActionCandidate[]; category: ActionCategory; weight: number } {
    const actions: ActionCandidate[] = []
    const tasks = snapshot.activeTasks ?? []

    for (const task of tasks) {
      if (task.priority === 'critical' || task.priority === 'high') {
        actions.push({
          id: `task-priority-${task.id}` as unknown as USOM_ID,
          sourceObjectId: task.id as unknown as USOM_ID,
          sourceObjectType: 'task',
          label: `高优先级任务待处理: ${task.title}`,
          actionType: 'complete_task',
          category: 'cue',
          weight: task.priority === 'critical' ? 90 : 70,
        })
      }

      if (task.clarity === 'fuzzy') {
        actions.push({
          id: `task-refine-${task.id}` as unknown as USOM_ID,
          sourceObjectId: task.id as unknown as USOM_ID,
          sourceObjectType: 'task',
          label: `任务需要细化: ${task.title}`,
          actionType: 'refine_task',
          category: 'cue',
          weight: 65,
        })
      }

      if (task.decomposition === 'splittable') {
        actions.push({
          id: `task-split-${task.id}` as unknown as USOM_ID,
          sourceObjectId: task.id as unknown as USOM_ID,
          sourceObjectType: 'task',
          label: `任务建议拆分: ${task.title}`,
          actionType: 'split_task',
          category: 'cue',
          weight: 55,
        })
      }
    }

    const maxWeight = actions.length > 0 ? Math.max(...actions.map(a => a.weight)) : 0
    return { actions, category: 'cue', weight: maxWeight }
  }

  return { onValidate, onEvent, onActionSurfaceRequest }
}
