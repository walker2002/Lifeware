import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/app/actions/intent', () => ({ submitDynamicIntent: vi.fn().mockResolvedValue({ success: true }) }))
vi.mock('@/app/actions/timebox', () => ({
  updateTimebox: vi.fn().mockResolvedValue({ status: 'ok' }),
  deleteTimebox: vi.fn().mockResolvedValue({ status: 'ok' }),
}))
vi.mock('@/nexus/ai-runtime/memory/batch-proposals', () => ({
  recordBatchProposals: vi.fn().mockResolvedValue('batch-xyz'),
  revertBatchProposals: vi.fn(),
  getRevertableBatches: vi.fn().mockResolvedValue([]),
}))

import { timeboxCnuiHandler } from '@/domains/timebox/cnui/handlers'
import { submitDynamicIntent } from '@/app/actions/intent'
import { updateTimebox, deleteTimebox } from '@/app/actions/timebox'
import { recordBatchProposals } from '@/nexus/ai-runtime/memory/batch-proposals'
import { surfaceHandlers } from '@/domains/timebox/cnui/handlers'
import { createTimeboxHandlers } from '@/domains/timebox/handlers'

describe('[023] A2 createTimebox CNUI handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(submitDynamicIntent as any).mockResolvedValue({ success: true, object: { id: 'tb-x' } })
  })

  it('open 返回 drafts 为 items', async () => {
    const r = await timeboxCnuiHandler.open('createTimebox', { drafts: [{ id: '1', title: '写作', startTime: '09:00', endTime: '10:00' }] })
    expect((r.dataSnapshot as any).items).toHaveLength(1)
  })

  it('submit 逐条调 submitDynamicIntent', async () => {
    const r = await timeboxCnuiHandler.submit('createTimebox', { items: [{ title: 'a' }, { title: 'b' }] })
    expect(r.success).toBe(true)
    expect(submitDynamicIntent).toHaveBeenCalledTimes(2)
  })

  it('submit 任一失败 → success false', async () => {
    ;(submitDynamicIntent as any).mockResolvedValueOnce({ success: false, error: '重叠' })
    const r = await timeboxCnuiHandler.submit('createTimebox', { items: [{ title: 'a' }, { title: 'b' }] })
    expect(r.success).toBe(false)
  })
})

describe('[023] A2.6 adjustRemainingTimeboxes CNUI handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(updateTimebox as any).mockResolvedValue({ status: 'ok' })
    ;(deleteTimebox as any).mockResolvedValue({ status: 'ok' })
  })

  it('open 返回 items 含 _origTitle/_origStart/_origEnd 初始快照（OV#P2-#3）', async () => {
    // [023] A2.6：open 注入 _orig* 用于 submit diff
    // handler 内调用 TimeboxRepository.findByDateRange，我们用 mock
    vi.doMock('@/domains/timebox/repository', () => ({
      TimeboxRepository: class {
        findByDateRange() {
          return [
            { id: 'tb-1', title: '会议', startTime: '14:00', endTime: '15:00', status: 'planned', taskIds: [] },
            { id: 'tb-2', title: '做PPT', startTime: '15:00', endTime: '16:00', status: 'planned', taskIds: [] },
          ]
        }
      },
    }))
    vi.doMock('@/domains/tasks/repository', () => ({
      TaskRepository: class {
        findByStatus() { return [] }
      },
    }))
    // 动态 re-import handler 以让 mock 生效
    vi.resetModules()
    const mod = await import('@/domains/timebox/cnui/handlers')
    const r = await mod.timeboxCnuiHandler.open('adjustRemainingTimeboxes', {})
    const items = (r.dataSnapshot as any).items
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      id: 'tb-1',
      title: '会议',
      startTime: '14:00',
      endTime: '15:00',
      _origTitle: '会议',
      _origStart: '14:00',
      _origEnd: '15:00',
    })
  })

  it('submit cancel 调 deleteTimebox（非 submitDynamicIntent）', async () => {
    const r = await timeboxCnuiHandler.submit('adjustRemainingTimeboxes', {
      items: [{ id: 'tb-1', title: '会议', startTime: '14:00', endTime: '15:00', status: 'planned', cancel: true, _origTitle: '会议', _origStart: '14:00', _origEnd: '15:00' }],
    })
    expect(r.success).toBe(true)
    expect(deleteTimebox).toHaveBeenCalledWith('tb-1')
    expect(updateTimebox).not.toHaveBeenCalled()
    expect(submitDynamicIntent).not.toHaveBeenCalled()
  })

  it('submit 无改动（与 _orig* 一致）不调用 updateTimebox/deleteTimebox', async () => {
    const r = await timeboxCnuiHandler.submit('adjustRemainingTimeboxes', {
      items: [{ id: 'tb-1', title: '会议', startTime: '14:00', endTime: '15:00', status: 'planned', _origTitle: '会议', _origStart: '14:00', _origEnd: '15:00' }],
    })
    expect(r.success).toBe(true)
    expect(updateTimebox).not.toHaveBeenCalled()
    expect(deleteTimebox).not.toHaveBeenCalled()
  })

  it('submit 有字段改动 → 调 updateTimebox', async () => {
    const r = await timeboxCnuiHandler.submit('adjustRemainingTimeboxes', {
      items: [{ id: 'tb-1', title: '会议延迟', startTime: '15:00', endTime: '16:00', status: 'planned', _origTitle: '会议', _origStart: '14:00', _origEnd: '15:00' }],
    })
    expect(r.success).toBe(true)
    expect(updateTimebox).toHaveBeenCalledWith('tb-1', { title: '会议延迟', startTime: '15:00', endTime: '16:00' })
    expect(deleteTimebox).not.toHaveBeenCalled()
  })
})

describe('[023] A2.7 logTimebox CNUI handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(submitDynamicIntent as any).mockResolvedValue({ success: true, object: { id: 'tb-log' } })
  })

  it('open 返回当日 planned timebox 列表（过滤终态 logged/cancelled）', async () => {
    // [023.12] T13 (AM3) — logTimebox filter 改 t.status !== 'planned'：
    //   新 model 下 'planned' 是唯一可 log 状态（'logged'/'cancelled' 是终态）。
    //   历史 'ended' 已废（4 态收敛）。
    vi.doMock('@/domains/timebox/repository', () => ({
      TimeboxRepository: class {
        findByDateRange() {
          return [
            { id: 'tb-1', title: '写作', startTime: '09:00', endTime: '10:00', status: 'planned', taskIds: [] },
            { id: 'tb-2', title: '会议', startTime: '10:00', endTime: '11:00', status: 'logged', taskIds: [] },
            { id: 'tb-3', title: '做PPT', startTime: '11:00', endTime: '12:00', status: 'planned', taskIds: [] },
          ]
        }
      },
    }))
    vi.resetModules()
    const mod = await import('@/domains/timebox/cnui/handlers')
    const r = await mod.timeboxCnuiHandler.open('logTimebox', {})
    const items = (r.dataSnapshot as any).items
    expect(items).toHaveLength(2)
    expect(items.map((i: any) => i.id)).toEqual(['tb-1', 'tb-3'])
  })

  it('open targetId 置顶：intentFields.targetId 命中的项移到首位置', async () => {
    vi.doMock('@/domains/timebox/repository', () => ({
      TimeboxRepository: class {
        findByDateRange() {
          return [
            { id: 'tb-1', title: '写作', startTime: '09:00', endTime: '10:00', status: 'planned', taskIds: [] },
            { id: 'tb-2', title: '会议', startTime: '10:00', endTime: '11:00', status: 'planned', taskIds: [] },
            { id: 'tb-3', title: '做PPT', startTime: '11:00', endTime: '12:00', status: 'planned', taskIds: [] },
          ]
        }
      },
    }))
    vi.resetModules()
    const mod = await import('@/domains/timebox/cnui/handlers')
    const r = await mod.timeboxCnuiHandler.open('logTimebox', { targetId: 'tb-3' })
    const items = (r.dataSnapshot as any).items
    expect(items[0].id).toBe('tb-3')
  })

  it('submit 跳过的项不调用 submitDynamicIntent（state=skipped 或无 state）', async () => {
    const r = await timeboxCnuiHandler.submit('logTimebox', {
      items: [
        { id: 'tb-1', title: '写作', state: 'completed' },
        { id: 'tb-2', title: '会议', state: 'skipped' },
        { id: 'tb-3', title: '做PPT' /* 无 state */ },
        { id: 'tb-4', title: '复盘', state: 'incomplete' },
      ],
    })
    expect(r.success).toBe(true)
    expect((r.data as any).count).toBe(2)
    expect(submitDynamicIntent).toHaveBeenCalledTimes(2)
    // 跳过的不被调用
    const calls = (submitDynamicIntent as any).mock.calls
    const objectIds = calls.map((c: any[]) => c[2].objectId)
    expect(objectIds).toEqual(['tb-1', 'tb-4'])
    expect(objectIds).not.toContain('tb-2')
    expect(objectIds).not.toContain('tb-3')
  })

  it('submit completed 调 logTimebox intent 且 executionRecord.completionStatus=completed', async () => {
    // [023.13] Fix #3 — notes 由 detailed.notes owns(LogTimebox 已删除 outer notes 字段)
    const r = await timeboxCnuiHandler.submit('logTimebox', {
      items: [{ id: 'tb-1', title: '写作', state: 'completed', detailed: { notes: '顺利' } }],
    })
    expect(r.success).toBe(true)
    expect(submitDynamicIntent).toHaveBeenCalledWith('timebox', 'logTimebox', {
      objectId: 'tb-1',
      executionRecord: expect.objectContaining({
        mode: 'detailed',
        completionStatus: 'completed',
        sourceType: 'timebox',
        actualDuration: 0,
        plannedDuration: 0,
        deviationMinutes: 0,
        notes: '顺利',
      }),
    })
  })

  it('submit incomplete 映射为 executionRecord.completionStatus=partial', async () => {
    // [023.13] Fix #3 — detailed.notes 透传 (notes 单源: ExecutionDetailFields)
    const r = await timeboxCnuiHandler.submit('logTimebox', {
      items: [{ id: 'tb-1', title: '写作', state: 'incomplete', detailed: { notes: '被打断' } }],
    })
    expect(r.success).toBe(true)
    expect(submitDynamicIntent).toHaveBeenCalledWith('timebox', 'logTimebox', {
      objectId: 'tb-1',
      executionRecord: expect.objectContaining({
        mode: 'detailed',
        completionStatus: 'partial',
        sourceType: 'timebox',
        actualDuration: 0,
        plannedDuration: 0,
        deviationMinutes: 0,
        notes: '被打断',
      }),
    })
  })
})

describe('[028] T9 scheduleProposal action registration + R12', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(submitDynamicIntent as any).mockResolvedValue({ success: true, object: { id: 'tb-9' } })
    ;(recordBatchProposals as any).mockResolvedValue('batch-xyz')
  })

  it('surfaceHandlers 含 schedule-proposal surface (注册点 1+2)', () => {
    expect(surfaceHandlers['schedule-proposal']).toBeDefined()
  })

  it('createTimeboxHandlers() 返回 scheduleProposal key (注册点 3 / R13)', () => {
    const handlers = createTimeboxHandlers({})
    expect(handlers.scheduleProposal).toBeDefined()
    expect((handlers as { createSmartTimeboxes?: unknown }).createSmartTimeboxes).toBeUndefined()
  })

  // [028] T9-fix：scheduleProposal submit 自含 batch 落库（fold-in，不依赖 createTimebox 分支 _source === 'createSmartTimebox'）
  it('submit scheduleProposal → 自含 batch 落库 + 不返 deprecated', async () => {
    // [028] T9-fix：items 走 createTimebox 意图逐条提交 + 收 succeeded → recordBatchProposals
    const r = await timeboxCnuiHandler.submit('scheduleProposal', {
      items: [
        { id: 'draft-1', title: '上午写作', date: '2026-07-11', startTime: '09:00', endTime: '11:00' },
        { id: 'draft-2', title: '下午会议', date: '2026-07-11', startTime: '14:00', endTime: '15:00' },
      ],
    })
    expect(r.success).toBe(true)
    // 不返 deprecated 错（旧 createSmartTimeboxes 分支已退役）
    expect(r.error ?? '').not.toContain('弃用')
    // submitDynamicIntent 被调 2 次（每个 item 一次）
    expect(submitDynamicIntent).toHaveBeenCalledTimes(2)
    // recordBatchProposals 被调一次（自含 batch 落库），无 _source 分支依赖
    expect(recordBatchProposals).toHaveBeenCalledTimes(1)
    // batch 内 proposals 走真实 timeboxId（不是空占位）
    const call = (recordBatchProposals as any).mock.calls[0][0]
    expect(call.proposals).toHaveLength(2)
    expect(call.proposals[0].timeboxId).toBe('tb-9')
  })

  it('R12：record/open/revert 用同一 SESSION_KEY（无单/复数不一致）', () => {
    // [028] T9 R12 — 验证：handlers.ts 内 'timebox-createSmartTimebox' (单数) + 'timebox-createSmartTimeboxes' (复数) 均 0 hit
    // sessionId 走 SESSION_KEY = 'timebox-scheduleProposal' 单一常量
    const fs = require('fs')
    const src = fs.readFileSync(require('path').resolve(__dirname, '../cnui/handlers.ts'), 'utf-8')
    expect(src).not.toMatch(/'timebox-createSmartTimebox[^s]/)  // 单数 0 hit
    expect(src).not.toMatch(/'timebox-createSmartTimeboxes'/)  // 复数 0 hit
  })

  it('R11：registry getHandler 复用 timeboxCnuiHandler（schedule-proposal 走 timeboxCnuiHandler）', () => {
    expect(surfaceHandlers['schedule-proposal']).toBe(timeboxCnuiHandler)
    expect(surfaceHandlers['create-smart-timebox']).toBe(timeboxCnuiHandler)
  })
})