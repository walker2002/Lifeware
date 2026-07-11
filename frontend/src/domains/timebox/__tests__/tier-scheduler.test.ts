/**
 * @file tier-scheduler.test @brief [028] T4 Tier0/1/2 槽位分配
 *
 * 测试矩阵：
 *   - Tier0 约定时段被跳过（不安排其他 item）
 *   - Tier2：item 主时段被占时，在 earliestStart/latestStart 窗口内安排
 *   - Tier2：窗口内也无法安排 → 舍弃 + warning 进报告
 *   - cursor 上限 22:00 不越界（沿用 [023.07] bound）→ SCHEDULER_BOUND_EXCEEDED
 */

import { describe, it, expect } from 'vitest'
import { scheduleByTiers, type Tier0Item, type Tier0Slot } from '../lib/tier-scheduler'

/**
 * 测试用 dependencies bundle — scheduleByTiers 注入必要的纯函数（不动 orchestration-handler 既有实现）。
 * 复用 orchestration-handler 现有语义：isSlotOccupied/findOccupyingSlot 用 UTC interval 重叠（[023.07]），
 * formatTime 输出 HH:MM，computeEnergyMatch 给 undefined（不读 energy curve，保证测试稳定）。
 */
const testDeps = {
  isSlotOccupied(
    startHour: number,
    startMinute: number,
    durationMinutes: number,
    occupied: Tier0Slot[],
  ): boolean {
    const sStart = startHour * 60 + startMinute
    const sEnd = sStart + durationMinutes
    for (const slot of occupied) {
      const oStart = slot.startHour * 60 + slot.startMinute
      const oEnd = slot.endHour * 60 + slot.endMinute
      if (sStart < oEnd && sEnd > oStart) return true
    }
    return false
  },
  findOccupyingSlot(
    startHour: number,
    startMinute: number,
    durationMinutes: number,
    occupied: Tier0Slot[],
  ): Tier0Slot | undefined {
    const sStart = startHour * 60 + startMinute
    const sEnd = sStart + durationMinutes
    for (const slot of occupied) {
      const oStart = slot.startHour * 60 + slot.startMinute
      const oEnd = slot.endHour * 60 + slot.endMinute
      if (sStart < oEnd && sEnd > oStart) return slot
    }
    return undefined
  },
  formatTime(hour: number, minute: number): string {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  },
  computeEnergyMatch() {
    return undefined
  },
}

describe('scheduleByTiers', () => {
  it('Tier0 约定时段被跳过（不安排其他 item）', () => {
    const items = [
      {
        id: 'i1',
        title: '工作',
        sourceType: 'task',
        priority: 'P1',
        durationMinutes: 60,
        earliestStart: 0,
        latestStart: 22,
        minDuration: 60,
      } as Tier0Item,
    ]
    // 2-3 点牙医（Tier0 已合并进 occupied）
    const occupied: Tier0Slot[] = [
      { startHour: 2, startMinute: 0, endHour: 3, endMinute: 0 },
    ]
    const { proposals } = scheduleByTiers(items, occupied, { dayStart: 0 }, testDeps)
    expect(proposals).toHaveLength(1)
    // 不安排在 Tier0 时段：起始不是 02:*（牙医 2-3 占用）
    expect(proposals[0].payload.startTime).not.toMatch(/^02:/)
    // 也不安排在 03:*（牙医 endHour=3:00，cursor 会跳过该时段）
    expect(proposals[0].payload.startTime).not.toMatch(/^03:/)
  })

  it('Tier2：item 主时段被占时，在 earliestStart/latestStart 窗口内安排', () => {
    // item earliestStart=8 latestStart=12, 主时段 8-9 被 Tier0 占，安排到 9-10
    const items = [
      {
        id: 'i1',
        title: '晨读',
        sourceType: 'planned',
        priority: 'P2',
        durationMinutes: 60,
        earliestStart: 8,
        latestStart: 12,
        minDuration: 60,
      } as Tier0Item,
    ]
    const occupied: Tier0Slot[] = [
      { startHour: 8, startMinute: 0, endHour: 9, endMinute: 0 },
    ]
    const { proposals, warnings } = scheduleByTiers(
      items,
      occupied,
      { dayStart: 8 },
      testDeps,
    )
    expect(proposals).toHaveLength(1)
    // Tier2 兜底：从 earliestStart=8 开始找，8 被占 → 安排到 9-10
    expect(proposals[0].payload.startTime).toBe('09:00')
    expect(proposals[0].payload.endTime).toBe('10:00')
    expect(warnings).toHaveLength(0)
  })

  it('Tier2：窗口内也无法安排 → 舍弃 + warning 进报告', () => {
    // 480 分钟（8 小时），但窗口只有 2 小时，强制塞不下 → 舍弃
    const items = [
      {
        id: 'i1',
        title: '长任务',
        sourceType: 'task',
        priority: 'P1',
        durationMinutes: 480,
        earliestStart: 8,
        latestStart: 10,
        minDuration: 480,
      } as Tier0Item,
    ]
    // 占满上午前：0-8 全占，即便 Tier2 也只能在 8-10 塞 120 分钟，不够 minDuration=480
    const occupied: Tier0Slot[] = [
      { startHour: 0, startMinute: 0, endHour: 8, endMinute: 0 },
    ]
    const { proposals, warnings } = scheduleByTiers(
      items,
      occupied,
      { dayStart: 8 },
      testDeps,
    )
    expect(proposals).toHaveLength(0)
    expect(warnings.some(w => w.code === 'ITEM_UNSCHEDULABLE')).toBe(true)
  })

  it('cursor 上限 22:00 不越界（沿用 [023.07] bound）→ SCHEDULER_BOUND_EXCEEDED warning', () => {
    // 三个 60 分钟 item，dayStart=21；第一个 21-22 边界，触发 bound break
    const items = [
      {
        id: 'i1',
        title: 'A',
        sourceType: 'task',
        priority: 'P1',
        durationMinutes: 60,
        earliestStart: 8,
        latestStart: 22,
        minDuration: 60,
      } as Tier0Item,
      {
        id: 'i2',
        title: 'B',
        sourceType: 'task',
        priority: 'P1',
        durationMinutes: 60,
        earliestStart: 8,
        latestStart: 22,
        minDuration: 60,
      } as Tier0Item,
      {
        id: 'i3',
        title: 'C',
        sourceType: 'task',
        priority: 'P1',
        durationMinutes: 60,
        earliestStart: 8,
        latestStart: 22,
        minDuration: 60,
      } as Tier0Item,
    ]
    // dayStart=21 → 第一个塞 21-22 后 cursor=22（≥ dayEnd），break + emit warning
    const { proposals, warnings } = scheduleByTiers(
      items,
      [],
      { dayStart: 21 },
      testDeps,
    )
    // 第一个 proposal 被排进 21-22
    expect(proposals).toHaveLength(1)
    expect(proposals[0].payload.startTime).toBe('21:00')
    expect(proposals[0].payload.endTime).toBe('22:00')
    // 全部 proposal endTime <= 22:00
    for (const p of proposals) {
      const [eh, em] = (p.payload.endTime as string).split(':').map(Number)
      const endMin = eh * 60 + em
      expect(endMin).toBeLessThanOrEqual(22 * 60)
    }
    // 应当收到 SCHEDULER_BOUND_EXCEEDED（break 触发）
    expect(warnings.some(w => w.code === 'SCHEDULER_BOUND_EXCEEDED')).toBe(true)
  })
})
