// Timebox Domain Hooks — 工厂函数模式
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

const MIN_DURATION = 5
const MAX_DURATION = 480
const UPCOMING_THRESHOLD_MS = 15 * 60 * 1000

export function createTimeboxHooks(manifest: DomainManifest) {
  const subscribedEvents = new Set(manifest.subscribed_events)

  function onValidate(
    intent: StructuredIntent,
    _snapshot: USOMSnapshot,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const { fields } = intent

    const title = fields['title']
    if (!title || (typeof title === 'string' && title.trim() === '')) {
      errors.push('title 不能为空')
    }

    const startTime = fields['startTime']
    if (!startTime || typeof startTime !== 'string' || isNaN(Date.parse(startTime))) {
      errors.push('startTime 必须是有效的 ISO 8601 时间格式')
    }

    const duration = fields['duration']
    if (
      typeof duration !== 'number' ||
      !Number.isInteger(duration) ||
      duration < MIN_DURATION ||
      duration > MAX_DURATION
    ) {
      errors.push(`duration 必须是 ${MIN_DURATION}~${MAX_DURATION} 之间的整数（分钟）`)
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

    const title = (event.payload['title'] as string) || '未命名时间盒'
    const metrics: MetricUpdate[] = []

    switch (event.type) {
      case 'TimeboxCreated':
        return {
          metrics,
          suggestions: [{
            actionType: 'start_timebox',
            label: `时间盒已创建: ${title}`,
            weight: 60,
          }],
        }

      case 'TimeboxStarted':
        return {
          metrics,
          suggestions: [{
            actionType: 'start_timebox',
            label: `时间盒开始: ${title}`,
            weight: 70,
          }],
        }

      case 'TimeboxOvertime':
        return {
          metrics,
          suggestions: [{
            actionType: 'start_timebox',
            label: `时间盒超时: ${title}`,
            weight: 85,
          }],
        }

      case 'TimeboxEnded':
        return {
          metrics,
          suggestions: [{
            actionType: 'capture_intent',
            label: '时间盒结束，请记录执行结果',
            weight: 70,
          }],
        }

      case 'TimeboxCancelled':
        return {
          metrics,
          suggestions: [{
            actionType: 'skip',
            label: `时间盒已取消: ${title}`,
            weight: 40,
          }],
        }

      case 'TimeboxLogged':
        return {
          metrics,
          suggestions: [{
            actionType: 'start_timebox',
            label: `已记录: ${title}`,
            weight: 50,
          }],
        }

      default:
        return { metrics, suggestions: [] }
    }
  }

  function onActionSurfaceRequest(
    snapshot: USOMSnapshot,
    _signals: Readonly<DerivedSignals>,
  ): { actions: ActionCandidate[]; category: ActionCategory; weight: number } {
    const actions: ActionCandidate[] = []
    const now = new Date(snapshot.currentTime).getTime()

    if (snapshot.currentTimebox && snapshot.currentTimebox.status === 'overtime') {
      const tb = snapshot.currentTimebox
      actions.push({
        id: `action-${tb.id}-overtime` as USOM_ID,
        sourceObjectId: tb.id,
        sourceObjectType: 'timebox',
        label: `已超时: ${tb.title}`,
        actionType: 'start_timebox',
        category: 'tile',
        weight: 95,
      })
      return { actions, category: 'tile', weight: 95 }
    }

    if (snapshot.currentTimebox && snapshot.currentTimebox.status === 'running') {
      const tb = snapshot.currentTimebox
      actions.push({
        id: `action-${tb.id}-running` as USOM_ID,
        sourceObjectId: tb.id,
        sourceObjectType: 'timebox',
        label: `进行中: ${tb.title}`,
        actionType: 'start_timebox',
        category: 'tile',
        weight: 90,
      })
      return { actions, category: 'tile', weight: 90 }
    }

    for (const tb of snapshot.upcomingTimeboxes) {
      if (tb.status === 'planned') {
        const startMs = new Date(tb.startTime).getTime()
        const diff = startMs - now
        if (diff >= 0 && diff <= UPCOMING_THRESHOLD_MS) {
          actions.push({
            id: `action-${tb.id}-upcoming` as USOM_ID,
            sourceObjectId: tb.id,
            sourceObjectType: 'timebox',
            label: `即将开始: ${tb.title}`,
            actionType: 'start_timebox',
            category: 'cue',
            weight: 80,
          })
        }
      }
    }
    if (actions.length > 0) {
      return { actions, category: 'cue', weight: 80 }
    }

    if (snapshot.currentTimebox && snapshot.currentTimebox.status === 'ended') {
      const tb = snapshot.currentTimebox
      actions.push({
        id: `action-${tb.id}-ended` as USOM_ID,
        sourceObjectId: tb.id,
        sourceObjectType: 'timebox',
        label: `记录执行结果: ${tb.title}`,
        actionType: 'capture_intent',
        category: 'cue',
        weight: 70,
      })
      return { actions, category: 'cue', weight: 70 }
    }

    return { actions, category: 'cue', weight: 0 }
  }

  return { onValidate, onEvent, onActionSurfaceRequest }
}
