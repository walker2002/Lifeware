import type {
  DomainPlugin,
  DomainManifest,
  USOMSnapshot,
  SystemEvent,
  DerivedSignals,
  ActionCandidate,
  ActionSurfaceSuggestion,
  MetricUpdate,
} from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID, ActionCategory } from '@/usom/types/primitives'

const TASK_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'archived'],
  active: ['in_progress', 'on_hold', 'archived'],
  in_progress: ['on_hold', 'completed', 'archived'],
  on_hold: ['active', 'archived'],
  completed: ['archived'],
  archived: [],
}

const PROJECT_TRANSITIONS: Record<string, string[]> = {
  planning: ['active', 'archived'],
  active: ['paused', 'completed', 'archived'],
  paused: ['active', 'archived'],
  completed: ['archived'],
  archived: [],
}

const tasksManifest: DomainManifest = {
  domainId: 'tasks',
  version: '1.1.0',
  requiredFields: ['name'],
  subscribedEvents: [
    'TimeBoxStarted',
    'TimeBoxEnded',
    'HabitCompleted',
    'ProjectCreated',
    'ProjectActivated',
    'ProjectPaused',
    'ProjectResumed',
    'ProjectCompleted',
    'ProjectArchived',
    'TaskCreated',
    'TaskActivated',
    'TaskCompleted',
    'TaskArchived',
  ],
}

const SUBSCRIBED_EVENTS = new Set(tasksManifest.subscribedEvents)

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
    const transitions = targetType === 'project' ? PROJECT_TRANSITIONS : TASK_TRANSITIONS
    const allowed = transitions[currentStatus] ?? []
    if (!allowed.includes(targetStatus)) {
      errors.push(`${currentStatus} 状态不能转换为 ${targetStatus}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

function onEvent(
  event: SystemEvent,
  _snapshot: USOMSnapshot,
): { metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] } {
  if (!SUBSCRIBED_EVENTS.has(event.type)) {
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

    default:
      return { metrics: [], suggestions: [] }
  }
}

function onActionSurfaceRequest(
  snapshot: USOMSnapshot,
  _signals: Readonly<DerivedSignals>,
): { actions: ActionCandidate[]; category: ActionCategory; weight: number } {
  const actions: ActionCandidate[] = []
  const tasks = snapshot.activeTasks ?? []

  // 高优先级任务未启动
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

export const tasksPlugin: DomainPlugin = {
  manifest: tasksManifest,
  onValidate,
  onEvent,
  onActionSurfaceRequest,
}
