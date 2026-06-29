import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/app/actions/intent', () => ({ submitDynamicIntent: vi.fn().mockResolvedValue({ success: true }) }))
vi.mock('@/app/actions/timebox', () => ({
  updateTimebox: vi.fn().mockResolvedValue({ status: 'ok' }),
  deleteTimebox: vi.fn().mockResolvedValue({ status: 'ok' }),
}))

import { timeboxCnuiHandler } from '@/domains/timebox/cnui/handlers'
import { submitDynamicIntent } from '@/app/actions/intent'
import { updateTimebox, deleteTimebox } from '@/app/actions/timebox'

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

describe('[023] A2.6 adjustRemainingSchedule CNUI handler', () => {
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
    const r = await mod.timeboxCnuiHandler.open('adjustRemainingSchedule', {})
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
    const r = await timeboxCnuiHandler.submit('adjustRemainingSchedule', {
      items: [{ id: 'tb-1', title: '会议', startTime: '14:00', endTime: '15:00', status: 'planned', cancel: true, _origTitle: '会议', _origStart: '14:00', _origEnd: '15:00' }],
    })
    expect(r.success).toBe(true)
    expect(deleteTimebox).toHaveBeenCalledWith('tb-1')
    expect(updateTimebox).not.toHaveBeenCalled()
    expect(submitDynamicIntent).not.toHaveBeenCalled()
  })

  it('submit 无改动（与 _orig* 一致）不调用 updateTimebox/deleteTimebox', async () => {
    const r = await timeboxCnuiHandler.submit('adjustRemainingSchedule', {
      items: [{ id: 'tb-1', title: '会议', startTime: '14:00', endTime: '15:00', status: 'planned', _origTitle: '会议', _origStart: '14:00', _origEnd: '15:00' }],
    })
    expect(r.success).toBe(true)
    expect(updateTimebox).not.toHaveBeenCalled()
    expect(deleteTimebox).not.toHaveBeenCalled()
  })

  it('submit 有字段改动 → 调 updateTimebox', async () => {
    const r = await timeboxCnuiHandler.submit('adjustRemainingSchedule', {
      items: [{ id: 'tb-1', title: '会议延迟', startTime: '15:00', endTime: '16:00', status: 'planned', _origTitle: '会议', _origStart: '14:00', _origEnd: '15:00' }],
    })
    expect(r.success).toBe(true)
    expect(updateTimebox).toHaveBeenCalledWith('tb-1', { title: '会议延迟', startTime: '15:00', endTime: '16:00' })
    expect(deleteTimebox).not.toHaveBeenCalled()
  })
})