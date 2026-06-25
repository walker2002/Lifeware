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
  ValidationResult,
} from '../../usom/types/process'
import type { StructuredIntent } from '../../usom/types/objects'
import type { USOM_ID, ActionCategory } from '../../usom/types/primitives'
import type { DomainManifest } from '../../domains/manifest-loader/schema'
import { evaluateDomainRules } from '@/nexus/rules'
import { taskRuleRegistry } from './rules-registry'

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
 * 规范化字段值 — 将自然语言表述转换为系统枚举。
 * 在 onValidate 中调用，确保 AI 解析的中文值能通过验证。
 * @param fields - 原始字段对象
 * @returns 规范化后的字段对象
 */
function normalizeFieldValues(fields: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...fields }

  // 优先级：中文 → 枚举
  if (typeof normalized.priority === 'string') {
    const priorityMap: Record<string, string> = {
      '高': 'high', '高优先级': 'high', '紧急': 'critical', '最重要': 'critical',
      '中': 'medium', '中等': 'medium', '普通': 'medium',
      '低': 'low', '低优先级': 'low', '不急': 'low',
    }
    const mapped = priorityMap[normalized.priority]
    if (mapped) normalized.priority = mapped
  }

  // 日期格式规范化：YYYY/MM/DD → YYYY-MM-DD
  for (const key of ['dueDate', 'startDate', 'endDate']) {
    if (typeof normalized[key] === 'string') {
      normalized[key] = (normalized[key] as string).replace(/\//g, '-')
    }
  }

  return normalized
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
   * 验证意图（[018-G3] R2：改调 evaluateDomainRules，规则声明式化）
   * 规则逻辑全部迁入 taskRuleRegistry（见 ./rules-registry）；本处仅薄壳委托。
   * normalizeFieldValues 保留为预处理（中文→枚举、日期格式规范化），
   * 规范化后的 fields 传入 evaluateDomainRules。
   * D 模式：聚合 submit 规则在 manifest 置首，submit 聚合保持「全部 errors」逐字输出。
   */
  async function onValidate(
    intent: StructuredIntent,
    snapshot: USOMSnapshot,
  ): Promise<ValidationResult> {
    // 规范化字段值（中文→枚举、日期格式等），保持与旧逻辑一致
    const normalizedFields = normalizeFieldValues(intent.fields)
    const normalizedIntent: StructuredIntent = { ...intent, fields: normalizedFields }
    return evaluateDomainRules('tasks', normalizedIntent, {
      repos: {},
      userId: snapshot.userId,
      now: snapshot.currentTime ? Date.parse(snapshot.currentTime) : 0,
    }, taskRuleRegistry)
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

      case 'ThreadPaused':
        return {
          metrics: [{ metricKey: 'thread_paused', value: 1 }],
          suggestions: [{
            actionType: 'resume_thread',
            label: `主线已暂停: ${title}，需要时恢复`,
            weight: 40,
          }],
        }

      case 'ThreadResumed':
        return {
          metrics: [{ metricKey: 'thread_resumed', value: 1 }],
          suggestions: [{
            actionType: 'add_task',
            label: `主线已恢复: ${title}，继续推进任务`,
            weight: 50,
          }],
        }

      case 'ThreadCompleted':
        return {
          metrics: [{ metricKey: 'thread_completed', value: 1 }],
          suggestions: [{
            actionType: 'archive_thread',
            label: `主线已完成: ${title}，可以归档了`,
            weight: 60,
          }],
        }

      case 'ThreadArchived':
        return {
          metrics: [{ metricKey: 'thread_archived', value: 1 }],
          suggestions: [],
        }

      case 'TaskCreated': {
        const clarity = event.payload['clarity'] as string
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
    }

    const maxWeight = actions.length > 0 ? Math.max(...actions.map(a => a.weight)) : 0
    return { actions, category: 'cue', weight: maxWeight }
  }

  return { onValidate, onEvent, onActionSurfaceRequest }
}
