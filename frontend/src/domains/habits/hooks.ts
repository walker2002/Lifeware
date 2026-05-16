// Habits Domain Hooks — 工厂函数模式
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
import type { DomainManifest } from '@/domains/manifest-loader/schema'

const HH_MM_REGEX = /^\d{2}:\d{2}$/

function isValidHHMM(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (!HH_MM_REGEX.test(value)) return false
  const [h, m] = value.split(':').map(Number)
  return h >= 0 && h < 24 && m >= 0 && m < 60
}

export function createHabitsHooks(manifest: DomainManifest) {
  const subscribedEvents = new Set(manifest.subscribed_events)
  const validFrequencyTypes = new Set(
    manifest.field_metadata.frequencyType?.options ?? ['daily', 'weekly', 'custom']
  )

  function onValidate(
    intent: StructuredIntent,
    _snapshot: USOMSnapshot,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const { fields } = intent
    const action = intent.action

    if (action === 'createHabit' || action === 'updateHabit') {
      const title = fields['title']
      if (action === 'createHabit' && (!title || (typeof title === 'string' && title.trim() === ''))) {
        errors.push('title 必填')
      }

      const defaultTime = fields['defaultTime']
      if (defaultTime !== undefined && !isValidHHMM(defaultTime)) {
        errors.push('defaultTime 必须是有效的 HH:MM 格式')
      }

      const defaultDuration = fields['defaultDuration']
      if (defaultDuration !== undefined && (typeof defaultDuration !== 'number' || defaultDuration <= 0)) {
        errors.push('defaultDuration 必须大于 0')
      }

      const minDuration = fields['minDuration']
      if (minDuration !== undefined && (typeof minDuration !== 'number' || minDuration <= 0)) {
        errors.push('minDuration 必须大于 0')
      }

      if (typeof minDuration === 'number' && typeof defaultDuration === 'number' && minDuration > defaultDuration) {
        errors.push('minDuration 不能大于 defaultDuration')
      }

      const frequencyType = fields['frequencyType']
      if (frequencyType !== undefined && !validFrequencyTypes.has(frequencyType as string)) {
        errors.push(`frequencyType 必须是 ${[...validFrequencyTypes].join('/')}`)
      }
    }

    if (action === 'logHabit') {
      const habitId = fields['habitId']
      if (!habitId || typeof habitId !== 'string') {
        errors.push('habitId 必填')
      }
    }

    if (action === 'createTemplate') {
      const name = fields['name']
      if (!name || (typeof name === 'string' && name.trim() === '')) {
        errors.push('name 必填')
      }

      const applicableDays = fields['applicableDays']
      if (!Array.isArray(applicableDays) || applicableDays.length === 0) {
        errors.push('applicableDays 不能为空')
      }
    }

    if (action === 'addHabitToTemplate') {
      const templateId = fields['templateId']
      if (!templateId || typeof templateId !== 'string') {
        errors.push('templateId 必填')
      }

      const habitId = fields['habitId']
      if (!habitId || typeof habitId !== 'string') {
        errors.push('habitId 必填')
      }

      const timeOverride = fields['timeOverride']
      if (timeOverride !== undefined && !isValidHHMM(timeOverride)) {
        errors.push('timeOverride 必须是有效的 HH:MM 格式')
      }
    }

    if (action === 'removeHabitFromTemplate') {
      const templateId = fields['templateId']
      if (!templateId || typeof templateId !== 'string') {
        errors.push('templateId 必填')
      }

      const habitId = fields['habitId']
      if (!habitId || typeof habitId !== 'string') {
        errors.push('habitId 必填')
      }
    }

    if (action === 'applyTemplate') {
      const templateId = fields['templateId']
      if (!templateId || typeof templateId !== 'string') {
        errors.push('templateId 必填')
      }

      const date = fields['date']
      if (!date || typeof date !== 'string') {
        errors.push('date 必填')
      }
    }

    return { valid: errors.length === 0, errors }
  }

  function onEvent(
    event: SystemEvent,
    _snapshot: USOMSnapshot,
  ): { metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] } {
    if (!subscribedEvents.has(event.type)) {
      return { metrics: [], suggestions: [] }
    }

    const title = (event.payload['title'] as string) || '未命名习惯'
    const streak = (event.payload['streak'] as number) || 0

    switch (event.type) {
      case 'HabitCreated':
        return {
          metrics: [],
          suggestions: [{
            actionType: 'log_habit',
            label: `新习惯已激活: ${title}`,
            weight: 50,
          }],
        }

      case 'HabitActivated':
        return {
          metrics: [],
          suggestions: [{
            actionType: 'log_habit',
            label: `习惯已激活: ${title}`,
            weight: 50,
          }],
        }

      case 'HabitStreakMilestone':
        return {
          metrics: [{
            metricKey: 'habit_streak',
            value: streak,
          }],
          suggestions: [{
            actionType: 'log_habit',
            label: `${streak}天连续成就: ${title}`,
            weight: 90,
          }],
        }

      case 'HabitLogged': {
        const trackable = (event.payload['trackable'] as boolean) ?? false
        const metrics: MetricUpdate[] = []
        if (trackable) {
          metrics.push({
            metricKey: 'habit_metrics_needs_update',
            value: 1,
          })
        }
        return {
          metrics,
          suggestions: [{
            actionType: 'log_habit',
            label: `已打卡: ${title}`,
            weight: 40,
          }],
        }
      }

      case 'HabitSkipped':
        return {
          metrics: [],
          suggestions: [{
            actionType: 'log_habit',
            label: `streak 保护提醒: ${title}`,
            weight: streak > 3 ? 80 : 60,
          }],
        }

      case 'HabitSuspended':
        return {
          metrics: [],
          suggestions: [{
            actionType: 'log_habit',
            label: `习惯已暂停: ${title}`,
            weight: 45,
          }],
        }

      case 'HabitArchived':
        return {
          metrics: [],
          suggestions: [{
            actionType: 'log_habit',
            label: `习惯已归档: ${title}`,
            weight: 30,
          }],
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
    const habits = snapshot.pendingHabits ?? []

    for (const habit of habits) {
      if (habit.trackable && !habit.todayLogged) {
        actions.push({
          id: `log-${habit.id}` as unknown as USOM_ID,
          sourceObjectId: habit.id as unknown as USOM_ID,
          sourceObjectType: 'habit',
          label: `待打卡: ${habit.title}`,
          actionType: 'log_habit',
          category: 'tile',
          weight: 70,
        })
      }

      if (habit.trackable && habit.streak === 6) {
        actions.push({
          id: `milestone-${habit.id}` as unknown as USOM_ID,
          sourceObjectId: habit.id as unknown as USOM_ID,
          sourceObjectType: 'habit',
          label: `再坚持1天就达成7天连续: ${habit.title}`,
          actionType: 'streak_milestone_hint',
          category: 'cue',
          weight: 85,
        })
      }
    }

    const maxWeight = actions.length > 0 ? Math.max(...actions.map(a => a.weight)) : 0
    return { actions, category: 'cue', weight: maxWeight }
  }

  return { onValidate, onEvent, onActionSurfaceRequest }
}
