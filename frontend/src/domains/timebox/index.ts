// Timebox Domain Plugin — 四钩子实现
// 遵循 Constitution Principle VI: 纯粹被动组件，禁止直接写状态、自主执行、跨域访问

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

// ─── Manifest 定义 ───────────────────────────────────────────
// 与 manifest.yaml 保持一致
const timeboxManifest: DomainManifest = {
  domainId: 'timebox',
  version: '0.1.0',
  requiredFields: ['title', 'startTime', 'duration'],
  subscribedEvents: [
    'TimeboxCreated',
    'TimeboxStarted',
    'TimeboxPaused',
    'TimeboxEnded',
    'TimeboxLogged',
  ],
}

// ─── 订阅事件集合（用于快速查找） ───────────────────────────
const SUBSCRIBED_EVENTS = new Set(timeboxManifest.subscribedEvents)

// ─── 常量 ────────────────────────────────────────────────────
const MIN_DURATION = 5   // 最短 5 分钟
const MAX_DURATION = 480 // 最长 480 分钟（8 小时）
const UPCOMING_THRESHOLD_MS = 15 * 60 * 1000 // 15 分钟

// ─── onValidate: 结构性验证 ─────────────────────────────────
function onValidate(
  intent: StructuredIntent,
  _snapshot: USOMSnapshot,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const { fields } = intent

  // title 非空
  const title = fields['title']
  if (!title || (typeof title === 'string' && title.trim() === '')) {
    errors.push('title 不能为空')
  }

  // startTime 合法（ISO 8601）
  const startTime = fields['startTime']
  if (!startTime || typeof startTime !== 'string' || isNaN(Date.parse(startTime))) {
    errors.push('startTime 必须是有效的 ISO 8601 时间格式')
  }

  // duration 合法（正整数，5 ≤ duration ≤ 480）
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

// ─── onEvent: 事件响应 ───────────────────────────────────────
function onEvent(
  event: SystemEvent,
  _snapshot: USOMSnapshot,
): { metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] } {
  // 未订阅事件直接返回空
  if (!SUBSCRIBED_EVENTS.has(event.type)) {
    return { metrics: [], suggestions: [] }
  }

  const title = (event.payload['title'] as string) || '未命名时间盒'

  // MVP: metrics 暂不实现，返回空数组
  const metrics: MetricUpdate[] = []

  // 根据事件类型生成 suggestion
  switch (event.type) {
    case 'TimeboxCreated':
      return {
        metrics,
        suggestions: [
          {
            actionType: 'start_timebox',
            label: `时间盒已创建: ${title}`,
            weight: 60,
          },
        ],
      }

    case 'TimeboxStarted':
      return {
        metrics,
        suggestions: [
          {
            actionType: 'start_timebox',
            label: `时间盒开始: ${title}`,
            weight: 70,
          },
        ],
      }

    case 'TimeboxEnded':
      return {
        metrics,
        suggestions: [
          {
            actionType: 'capture_intent',
            label: '时间盒结束，请记录执行结果',
            weight: 70,
          },
        ],
      }

    case 'TimeboxLogged':
      return {
        metrics,
        suggestions: [
          {
            actionType: 'start_timebox',
            label: `已记录: ${title}`,
            weight: 50,
          },
        ],
      }

    case 'TimeboxPaused':
      // MVP: 暂无特定建议
      return { metrics, suggestions: [] }

    default:
      return { metrics, suggestions: [] }
  }
}

// ─── onActionSurfaceRequest: Action Surface 候选生成 ────────
function onActionSurfaceRequest(
  snapshot: USOMSnapshot,
  _signals: Readonly<DerivedSignals>,
): { actions: ActionCandidate[]; category: ActionCategory; weight: number } {
  const actions: ActionCandidate[] = []
  const now = new Date(snapshot.currentTime).getTime()

  // 优先级 1: 有 running 时间盒 → tile, weight 90
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
    // running 优先级最高，直接返回
    return { actions, category: 'tile', weight: 90 }
  }

  // 优先级 2: 有 planned 时间盒且距 startTime < 15min → cue, weight 80
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

  // 优先级 3: 有 ended 时间盒 → cue, weight 70
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

  // 无匹配条件
  return { actions, category: 'cue', weight: 0 }
}

// ─── 导出 Timebox Domain Plugin ─────────────────────────────
export const timeboxPlugin: DomainPlugin = {
  manifest: timeboxManifest,
  onValidate,
  onEvent,
  onActionSurfaceRequest,
  // onOutboundRequest: MVP 不实现
}
