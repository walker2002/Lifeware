/**
 * @file overlap-layout
 * @brief 时间盒重叠区间扫描 + 列分配（B3 算法，[023.03] T1）
 *
 * 对 TimeboxesEvent[] 按 startTime 升序，贪心装箱分配 column；
 * 同时间点 active 的最大 column 数 = totalCols；
 * totalCols > 4 → isOvercrowded=true（fallback 仅边框提示不缩宽）。
 *
 * itinerary 不参与（仅 kind='timebox'），输出 col=0, totalCols=1。
 *
 * [023.03] T4：route /schedule → /timeboxes，类型 ScheduleEvent → TimeboxesEvent。
 *
 * @see docs/superpowers/specs/2026-07-04-023.03-timebox-page-optimization-design.md §4
 */

import type { TimeboxesEvent } from '../components/timeboxes-event'

export interface OverlapLayout {
  event: TimeboxesEvent
  col: number
  totalCols: number
  isOvercrowded: boolean
}

export function computeOverlapLayout(events: TimeboxesEvent[]): OverlapLayout[] {
  const timeboxes = events.filter(e => e.kind === 'timebox')
  const others = events.filter(e => e.kind !== 'timebox')

  // 2. timebox 按 start 升序
  const sorted = [...timeboxes].sort((a, b) =>
    new Date(a.start).getTime() - new Date(b.start).getTime(),
  )

  // 3. 贪心 column 分配
  const cols: number[] = [] // index = col, value = last event end (ms)
  type Placement = { event: TimeboxesEvent; col: number; endMs: number }
  const placements: Placement[] = []
  for (const ev of sorted) {
    const startMs = new Date(ev.start).getTime()
    const endMs = new Date(ev.end).getTime()
    let placed = -1
    for (let c = 0; c < cols.length; c++) {
      if (cols[c] <= startMs) {
        placed = c
        cols[c] = endMs
        break
      }
    }
    if (placed === -1) {
      placed = cols.length
      cols.push(endMs)
    }
    placements.push({ event: ev, col: placed, endMs })
  }

  // 4. 对每个 placement 算 totalCols：所有与之有任一时间重叠的 placement 的最大 col 索引 + 1
  const totalColsByEvent = new Map<string, number>()
  for (const p of placements) {
    const pStart = new Date(p.event.start).getTime()
    const pEnd = new Date(p.event.end).getTime()
    const active = placements.filter(q => {
      const qStart = new Date(q.event.start).getTime()
      const qEnd = new Date(q.event.end).getTime()
      // 时间区间 [pStart, pEnd) 与 [qStart, qEnd) 有重叠
      return qStart < pEnd && qEnd > pStart
    })
    const maxCol = active.length > 0 ? Math.max(...active.map(a => a.col)) : p.col
    totalColsByEvent.set(p.event.id, maxCol + 1)
  }

  // 5. 输出
  return [
    ...placements.map(p => ({
      event: p.event,
      col: p.col,
      totalCols: totalColsByEvent.get(p.event.id)!,
      isOvercrowded: totalColsByEvent.get(p.event.id)! > 4,
    })),
    ...others.map(e => ({ event: e, col: 0, totalCols: 1, isOvercrowded: false })),
  ]
}
