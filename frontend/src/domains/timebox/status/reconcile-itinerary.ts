/**
 * @file reconcile-itinerary.ts
 * @brief 行程状态 lazy reconcile 纯函数（[026] D2 reversal 决策大脑）
 *
 * 取代原 D2=C "deriveItineraryStatus 读时算"。新设计：状态全部存 DB，时间驱动的
 * transition（scheduled → in_progress 到日、scheduled/in_progress → expired 过日）
 * 由本函数计算 transition 计划，调用方在页面 server component 加载时逐条
 * submitDynamicIntent 走 SM 写库。零 cron、零后台 job。
 *
 * 纯函数：不 IO、不写库。按日历日（localDayKey：年*10000+月*100+日）比较，
 * 与 /timeboxes loadDay 日界对齐（T8 + T13 用）。
 *
 * 设计抉择：判别字段命名 kind，前缀 needs（"需要做"而非"动作本身"）——codex D6
 * 统一治理（brief Step 1 原本写 action: 'markInProgress'，与 Step 3 实现的
 * kind: 'needsMarkInProgress' 矛盾，按 codex 修复）。
 */
import type { Itinerary } from '@/usom/types/objects'

/** 本地日历日整数键（年*10000+月*100+日），按调用方进程的本地时区归一化 */
function localDayKey(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/** ReconcileAction：建议调用方执行的 transition（kind 强调"需要做"） */
export type ReconcileAction =
  | { itineraryId: string; kind: 'needsMarkInProgress'; at: Date }
  | { itineraryId: string; kind: 'needsMarkExpired'; at: Date }

/** 终态：不再 reconcile 推进 */
const TERMINAL: ReadonlyArray<Itinerary['status']> = [
  'expired',
  'cancelled',
  'completed',
]

/**
 * 计算所有需要推进的 transition（按日历日驱动）。
 *
 * 规则：
 * - 终态（expired/cancelled/completed）→ 跳过
 * - nowDay < startDay（未来）→ 跳过（scheduled 不变；in_progress 不可能发生在未来）
 * - nowDay === startDay（当日）→ scheduled → in_progress（in_progress 当日不变）
 * - nowDay > startDay（过日）→ scheduled 或 in_progress → expired
 *
 * @param itineraries 行程列表（已过滤 userId 等，仅当前用户可见数据）
 * @param now 当前时间（用于与 startTime 比较日界）
 * @returns transition 计划数组，由调用方逐条 submitDynamicIntent 落库
 */
export function reconcileItineraryStatuses(
  itineraries: ReadonlyArray<Itinerary>,
  now: Date,
): ReconcileAction[] {
  const nowDay = localDayKey(now)
  const actions: ReconcileAction[] = []

  for (const it of itineraries) {
    // 终态跳过（expired/cancelled/completed 不再推进）
    if ((TERMINAL as readonly string[]).includes(it.status)) continue

    const startDay = localDayKey(new Date(it.startTime))

    // 未来：scheduled 不变（in_progress 不可能发生在未来）
    if (nowDay < startDay) {
      // scheduled 留在 scheduled，in_progress 是不可能的（除非数据脏），跳过
      continue
    }

    // 当日：scheduled → in_progress
    if (nowDay === startDay) {
      if (it.status === 'scheduled') {
        actions.push({
          itineraryId: it.id,
          kind: 'needsMarkInProgress',
          at: now,
        })
      }
      // in_progress 当日不变
      continue
    }

    // 过日：scheduled → expired 或 in_progress → expired
    if (it.status === 'scheduled' || it.status === 'in_progress') {
      actions.push({
        itineraryId: it.id,
        kind: 'needsMarkExpired',
        at: now,
      })
    }
  }

  return actions
}