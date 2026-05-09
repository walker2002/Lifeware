// Timebox Domain Plugin — 四钩子实现
// 遵循 Constitution Principle VI: 纯粹被动组件

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

const timeboxManifest: DomainManifest = {
  domainId: 'timebox',
  version: '0.2.0',
  requiredFields: ['title', 'startTime', 'duration'],
  subscribedEvents: [
    'TimeboxCreated',
    'TimeboxStarted',
    'TimeboxOvertime',
    'TimeboxEnded',
    'TimeboxCancelled',
    'TimeboxLogged',
  ],
}

const SUBSCRIBED_EVENTS = new Set(timeboxManifest.subscribedEvents)

const MIN_DURATION = 5
const MAX_DURATION = 480
const UPCOMING_THRESHOLD_MS = 15 * 60 * 1000

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
  if (!SUBSCRIBED_EVENTS.has(event.type)) {
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

  // 优先级 0: overtime 时间盒 → tile, weight 95
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

  // 优先级 1: running 时间盒 → tile, weight 90
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

  // 优先级 2: planned 即将开始 → cue, weight 80
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

  // 优先级 3: ended 时间盒 → cue, weight 70
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

export const timeboxPlugin: DomainPlugin = {
  manifest: timeboxManifest,
  onValidate,
  onEvent,
  onActionSurfaceRequest,
}
