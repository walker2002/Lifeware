/**
 * @file hooks
 * @brief Tasks 域钩子函数工厂
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
} from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID, ActionCategory } from '@/usom/types/primitives'
import type { DomainManifest } from '@/domains/manifest-loader/schema'

/**
 * 构建状态转换映射
 * @param transitions - 转换规则数组
 * @returns 状态转换映射表
 */
function buildTransitionMap(
  transitions: Array<{ from: string | string[] | null; to: string }>
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
  const projectTransitions = manifest.lifecycle.project
    ? buildTransitionMap(manifest.lifecycle.project.transitions)
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

    if (action === 'createProject' || action === 'updateProject') {
      const name = fields['name']
      if (action === 'createProject' && (!name || (typeof name === 'string' && name.trim() === ''))) {
        errors.push('项目名称必填')
      }
      if (typeof name === 'string' && name.length > 200) {
        errors.push('项目名称不能超过 200 字符')
      }
    }

    if (action === 'createTask' || action === 'updateTask') {
      const title = fields['title']
      if (action === 'createTask' && (!title || (typeof title === 'string' && title.trim() === ''))) {
        errors.push('任务标题必填')
      }
      const estimatedDuration = fields['estimatedDuration']
      if (estimatedDuration !== undefined && (typeof estimatedDuration !== 'number' || estimatedDuration <= 0)) {
        errors.push('预估时长必须大于 0')
      }
    }

    // 状态转换验证
    const targetStatus = fields['targetStatus'] as string | undefined
    const currentStatus = fields['currentStatus'] as string | undefined
    const targetType = fields['targetType'] as string | undefined

    if (targetStatus && currentStatus && targetType) {
      const transitions = targetType === 'project' ? projectTransitions : taskTransitions
      const allowed = transitions[currentStatus] ?? []
      if (!allowed.includes(targetStatus)) {
        errors.push(`${currentStatus} 状态不能转换为 ${targetStatus}`)
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

    const name = (event.payload['name'] || event.payload['title'] as string) || '未命名'

    switch (event.type) {
      case 'ProjectCreated':
        return {
          metrics: [{ metricKey: 'project_created', value: 1 }],
          suggestions: [{
            actionType: 'complete_task',
            label: `新项目已创建: ${name}，开始添加任务`,
            weight: 60,
          }],
        }

      case 'ProjectActivated':
        return {
          metrics: [],
          suggestions: [{ actionType: 'complete_task', label: `项目已激活: ${name}`, weight: 70 }],
        }

      case 'ProjectCompleted':
        return {
          metrics: [{ metricKey: 'project_completed', value: 1 }],
          suggestions: [{ actionType: 'review_okr', label: `项目已完成: ${name}`, weight: 80 }],
        }

      case 'ExecutionLogged': {
        const sourceType = event.payload['sourceType'] as string
        if (sourceType === 'task') {
          return { metrics: [], suggestions: [] }
        }
        return {
          metrics: [{ metricKey: 'task_execution_needs_update', value: 1 }],
          suggestions: [],
        }
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
    }

    const maxWeight = actions.length > 0 ? Math.max(...actions.map(a => a.weight)) : 0
    return { actions, category: 'cue', weight: maxWeight }
  }

  return { onValidate, onEvent, onActionSurfaceRequest }
}
