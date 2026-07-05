/**
 * @file orchestration-handler.test
 * @brief TimeboxOrchestrationHandler 单测 — 守护 [023.07] #3 谓词一致性与 bound 安全网
 */
import { describe, it, expect, vi } from 'vitest'
import { TimeboxOrchestrationHandler } from '../orchestration-handler'
import type { GenerationRequest } from '@/usom/types/process'

// 构造最小合法 GenerationRequest（contexts 提供 activeTasks 即可触发 buildTimeboxItems）
function buildRequest(overrides: Partial<GenerationRequest['contexts']> = {}): GenerationRequest {
  return {
    intent: {
      targetDomain: 'timebox',
      action: 'generateProposals',
      fields: { date: '2026-07-05' },
    },
    contexts: {
      activeTasks: [],
      pendingHabits: [],
      existingTimeboxes: [],
      energyCurve: { peakHours: [9, 10], lowHours: [13, 14] },
      ...overrides,
    },
  } as unknown as GenerationRequest
}

describe('[023.07] #3 generateProposals 谓词一致性 + bound', () => {
  it('findOccupyingSlot 与 isSlotOccupied 谓词一致：cursor 跨越 occupied 起点时两者都判为重叠', () => {
    const handler = new TimeboxOrchestrationHandler()
    // cursor=8:30, duration=60min → [8:30, 9:30]，与 occupied [9:00, 10:00] 重叠
    // 当前 bug：findOccupyingSlot(包含起点) 返 undefined（8:30 不在 [9:00,10:00) 内）
    // 统一后：findOccupyingSlot(重叠) 应返该 slot
    const occupied = [{ startHour: 9, startMinute: 0, endHour: 10, endMinute: 0 }]

    // @ts-expect-error — 访问 private method 做单元守护
    const isOcc = handler.isSlotOccupied(8, 30, 60, occupied)
    expect(isOcc).toBe(true)

    // @ts-expect-error — private；签名含 durationMinutes
    const overlap = handler.findOccupyingSlot(8, 30, 60, occupied)
    expect(overlap).toBeDefined()
    expect(overlap?.endHour).toBe(10)
    expect(overlap?.endMinute).toBe(0)
  })

  it('findOccupyingSlot 与 isSlotOccupied 一致：完全不重叠时都返 falsy', () => {
    const handler = new TimeboxOrchestrationHandler()
    const occupied = [{ startHour: 14, startMinute: 0, endHour: 15, endMinute: 0 }]
    // cursor=8:00 duration=60 → [8:00,9:00]，与 [14:00,15:00] 不重叠
    // @ts-expect-error
    expect(handler.isSlotOccupied(8, 0, 60, occupied)).toBe(false)
    // @ts-expect-error
    expect(handler.findOccupyingSlot(8, 0, 60, occupied)).toBeUndefined()
  })

  it('handle() 不死循环：多个相邻 occupied + 多 items 在合理时间内返回', async () => {
    const handler = new TimeboxOrchestrationHandler()
    // 构造 8:00-22:00 全占满（14 个 1 小时 slot）+ 3 个 task
    const existingTimeboxes: any[] = []
    for (let h = 8; h < 22; h++) {
      existingTimeboxes.push({
        id: `occ-${h}`,
        title: `占用${h}`,
        startTime: `2026-07-05T${String(h).padStart(2, '0')}:00:00Z`,
        endTime: `2026-07-05T${String(h + 1).padStart(2, '0')}:00:00Z`,
        status: 'planned',
        taskIds: [],
        habitIds: [],
      })
    }
    const request = buildRequest({
      activeTasks: [
        { id: 't1', title: '任务1', status: 'active', priority: 'P1', estimatedDuration: 60, energyRequired: 'medium' },
        { id: 't2', title: '任务2', status: 'active', priority: 'P2', estimatedDuration: 60, energyRequired: 'low' },
        { id: 't3', title: '任务3', status: 'active', priority: 'P2', estimatedDuration: 60, energyRequired: 'low' },
      ],
      existingTimeboxes,
    })

    // vitest 默认 5s timeout 守护 — 若 livelock 会 timeout fail
    const result = await handler.handle(request)
    // 全天占满 → 所有 proposals 被推到 22:00 后 break → proposals 可能为空或被 cursorHour>=22 截断
    expect(result).toBeDefined()
    expect(result.proposalSet).toBeDefined()
  })

  it('bound 安全网：spy 注入「谓词再次不一致」场景 → emit SCHEDULER_BOUND_EXCEEDED warning', async () => {
    const handler = new TimeboxOrchestrationHandler()
    // 模拟「未来回归」：isSlotOccupied 永返 true，findOccupyingSlot 永返 undefined
    // （即原 bug 的谓词不一致 + 异常数据 livelock 场景）
    // @ts-expect-error — spy private method
    vi.spyOn(handler, 'isSlotOccupied').mockReturnValue(true)
    // @ts-expect-error — spy private method（新签名含 durationMinutes）
    vi.spyOn(handler, 'findOccupyingSlot').mockReturnValue(undefined)

    const request = buildRequest({
      activeTasks: [
        { id: 't1', title: '任务1', status: 'active', priority: 'P1', estimatedDuration: 60, energyRequired: 'medium' },
      ],
    })

    const result = await handler.handle(request)
    const boundWarning = result.warnings?.find(w => w.code === 'SCHEDULER_BOUND_EXCEEDED')
    expect(boundWarning).toBeDefined()
    expect(boundWarning?.severity).toBe('warn')
  })
})
