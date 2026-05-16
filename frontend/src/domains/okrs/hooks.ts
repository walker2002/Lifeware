// OKR Domain Hooks — 四个纯函数钩子
// 遵循 Constitution Principle VI: 无副作用、无数据库调用

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

const SUBSCRIBED_EVENTS = new Set([
  'ObjectiveCreated',
  'ObjectiveActivated',
  'ObjectivePaused',
  'ObjectiveResumed',
  'ObjectiveCompleted',
  'ObjectiveDiscarded',
  'ObjectiveArchived',
  'KeyResultUpdated',
  'KeyResultCompleted',
  'KeyResultProgressUpdated',
  'TaskCompleted',
  'HabitLogged',
])

export function onValidate(
  intent: StructuredIntent,
  _snapshot: USOMSnapshot,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const { fields } = intent
  const action = intent.action

  if (action === 'createObjective' || action === 'updateObjective') {
    const title = fields['title']
    if (action === 'createObjective' && (!title || (typeof title === 'string' && title.trim() === ''))) {
      errors.push('title 必填')
    }
    if (typeof title === 'string' && title.length > 200) {
      errors.push('title 不能超过 200 字符')
    }

    const okrType = fields['okrType']
    if (okrType !== undefined && okrType !== 'visionary' && okrType !== 'committed') {
      errors.push('okrType 必须是 visionary 或 committed')
    }
  }

  if (action === 'activateObjective') {
    const objectiveId = fields['objectiveId']
    if (!objectiveId || typeof objectiveId !== 'string') {
      errors.push('objectiveId 必填')
    }
  }

  if (action === 'createKeyResult' || action === 'updateKeyResult') {
    const title = fields['title']
    if (action === 'createKeyResult' && (!title || (typeof title === 'string' && title.trim() === ''))) {
      errors.push('title 必填')
    }
    if (typeof title === 'string' && title.length > 200) {
      errors.push('title 不能超过 200 字符')
    }

    const targetValue = fields['targetValue']
    if (targetValue !== undefined && (typeof targetValue !== 'number' || targetValue <= 0)) {
      errors.push('targetValue 必须大于 0')
    }

    const unit = fields['unit']
    if (action === 'createKeyResult' && (!unit || (typeof unit === 'string' && unit.trim() === ''))) {
      errors.push('unit 必填')
    }
    if (typeof unit === 'string' && unit.length > 20) {
      errors.push('unit 不能超过 20 字符')
    }
  }

  if (action === 'updateKeyResultProgress') {
    const keyResultId = fields['keyResultId']
    if (!keyResultId || typeof keyResultId !== 'string') {
      errors.push('keyResultId 必填')
    }
    const currentValue = fields['currentValue']
    if (typeof currentValue !== 'number' || currentValue < 0) {
      errors.push('currentValue 必须是非负数')
    }
  }

  return { valid: errors.length === 0, errors }
}

export function onEvent(
  event: SystemEvent,
  _snapshot: USOMSnapshot,
): { metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] } {
  if (!SUBSCRIBED_EVENTS.has(event.type)) {
    return { metrics: [], suggestions: [] }
  }

  const title = (event.payload['title'] as string) || '未命名目标'

  switch (event.type) {
    case 'ObjectiveCreated':
      return {
        metrics: [],
        suggestions: [{
          actionType: 'review_okr',
          label: `新目标已创建: ${title}，请添加关键结果`,
          weight: 60,
        }],
      }

    case 'ObjectiveActivated':
      return {
        metrics: [],
        suggestions: [{
          actionType: 'review_okr',
          label: `目标已激活: ${title}`,
          weight: 70,
        }],
      }

    case 'ObjectiveCompleted':
      return {
        metrics: [{
          metricKey: 'objective_completed',
          value: 1,
        }],
        suggestions: [{
          actionType: 'review_okr',
          label: `目标已完成: ${title}`,
          weight: 80,
        }],
      }

    case 'ObjectiveDiscarded':
      return {
        metrics: [],
        suggestions: [{
          actionType: 'review_okr',
          label: `目标已废弃: ${title}`,
          weight: 40,
        }],
      }

    case 'KeyResultCompleted':
      return {
        metrics: [{
          metricKey: 'key_result_completed',
          value: 1,
        }],
        suggestions: [{
          actionType: 'review_okr',
          label: `关键结果已完成: ${(event.payload['krTitle'] as string) || ''}`,
          weight: 75,
        }],
      }

    case 'KeyResultProgressUpdated': {
      const progressRate = (event.payload['progressRate'] as number) || 0
      return {
        metrics: [{
          metricKey: 'kr_progress_updated',
          value: progressRate,
        }],
        suggestions: [],
      }
    }

    default:
      return { metrics: [], suggestions: [] }
  }
}

export function onActionSurfaceRequest(
  snapshot: USOMSnapshot,
  _signals: Readonly<DerivedSignals>,
): { actions: ActionCandidate[]; category: ActionCategory; weight: number } {
  const actions: ActionCandidate[] = []
  const objectives = snapshot.activeObjectives ?? []
  const keyResults = snapshot.activeKeyResults ?? []

  for (const kr of keyResults) {
    // KR 到期 < 7 天且进度 < 70%
    if (kr.dueDate) {
      const dueDate = new Date(kr.dueDate)
      const now = new Date(snapshot.currentDate)
      const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntilDue >= 0 && daysUntilDue < 7 && kr.progressRate < 0.7) {
        actions.push({
          id: `kr-due-warn-${kr.id}` as unknown as USOM_ID,
          sourceObjectId: kr.id as unknown as USOM_ID,
          sourceObjectType: 'key_result',
          label: `KR 即将到期 (${daysUntilDue}天): ${kr.title}`,
          actionType: 'review_okr',
          category: 'cue',
          weight: 85,
        })
      }
    }
  }

  // O 周期结束 < 14 天且未完成
  for (const obj of objectives) {
    const periodEnd = obj.period?.end
    if (periodEnd) {
      const endDate = new Date(periodEnd)
      const now = new Date(snapshot.currentDate)
      const daysUntilEnd = Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntilEnd >= 0 && daysUntilEnd < 14) {
        actions.push({
          id: `obj-period-warn-${obj.id}` as unknown as USOM_ID,
          sourceObjectId: obj.id as unknown as USOM_ID,
          sourceObjectType: 'objective',
          label: `目标周期即将结束 (${daysUntilEnd}天): ${obj.title}`,
          actionType: 'review_okr',
          category: 'guide',
          weight: 75,
        })
      }
    }
  }

  const maxWeight = actions.length > 0 ? Math.max(...actions.map(a => a.weight)) : 0
  return { actions, category: 'cue', weight: maxWeight }
}
