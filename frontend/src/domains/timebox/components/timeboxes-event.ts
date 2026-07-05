/**
 * @file timeboxes-event
 * @brief /timeboxes 联合事件类型（[026] A3 D2 reversal / [023.03] T4 重命名 / [023.05] PR2 T9 itinerary→appointment）
 *
 * TimeboxesEvent 是 /timeboxes 页面读时合并的 discriminated union：
 * - kind: 'timebox'  来自 TimeboxRepository
 * - kind: 'appointment' 来自 AppointmentRepository
 *
 * [026] D2 reversal: appointment.status 直接来自 DB（5 态枚举），
 * 不再 read-time 计算（避免在每次翻日历页时推 N 次 SM）。
 *
 * [023.03] T4：route /schedule → /timeboxes，类型名 ScheduleEvent → TimeboxesEvent；
 * 文件路径 schedule-event.ts → timeboxes-event.ts。
 *
 * [023.05] PR2 T9：kind='itinerary' → 'appointment'（运行时字符串 producer/consumer
 * 同步） + ItinerarySummary/Status → AppointmentSummary/Status + itineraryToEvent →
 * appointmentToEvent。漏改一边 → schedule 事件落 else 分支 → 渲染错。
 *
 * [026] codex D5 决议：loadDay 不调 reconcileAndAdvanceAppointments（避免
 * /timeboxes 翻日历页重推 N 次 SM）。Trade-off：/timeboxes 可能显陈旧状态
 * （若用户未访问过 /appointments 触发 reconcile）。可接受 MVP——D5 修复
 * 优先于绝对时效性。
 */
import type { TimeboxSummary, AppointmentSummary } from '@/usom/types/summaries'
import type { AppointmentStatus } from '@/usom/types/primitives'

export type TimeboxesEvent =
  | {
      kind: 'timebox'
      id: string
      title: string
      start: string
      end: string
      status: string
      source: TimeboxSummary
    }
  | {
      kind: 'appointment'
      id: string
      title: string
      start: string
      end: string
      status: AppointmentStatus
      locked: boolean
      source: AppointmentSummary
    }

/** TimeboxSummary → TimeboxesEvent（kind='timebox'） */
export function timeboxToEvent(tb: TimeboxSummary): TimeboxesEvent {
  return {
    kind: 'timebox',
    id: tb.id,
    title: tb.title,
    start: tb.startTime,
    end: tb.endTime,
    status: tb.status,
    source: tb,
  }
}

/** AppointmentSummary → TimeboxesEvent（kind='appointment'）。
 * end = start + durationMin；status 直接来自 DB（D2 reversal）。 */
export function appointmentToEvent(it: AppointmentSummary): TimeboxesEvent {
  const end = new Date(
    new Date(it.startTime).getTime() + it.durationMin * 60_000,
  ).toISOString()
  return {
    kind: 'appointment',
    id: it.id,
    title: it.title,
    start: it.startTime,
    end,
    status: it.status,
    locked: true,
    source: it,
  }
}

/** 合并 timebox + appointment 为按 start 升序的 TimeboxesEvent 列表。 */
export function mergeEvents(
  timeboxes: TimeboxSummary[],
  appointments: AppointmentSummary[],
): TimeboxesEvent[] {
  return [
    ...timeboxes.map(timeboxToEvent),
    ...appointments.map(appointmentToEvent),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
}
