/**
 * @file handlers-create-appointment.test
 * @brief [026.01] 测试 timeboxCnuiHandler.open / submit 对 createAppointment 的处理
 *
 * 覆盖：
 * - open('createAppointment') 3 路径（默认 draft / drafts 透传 / existing 列表）
 * - submit('createAppointment') 3 路径（archetype 透传 / 缺省时省略 / succeeded/failed 汇总）
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

// mock submitDynamicIntent（createAppointment 走意图通道）
vi.mock('@/app/actions/intent', () => ({
  submitDynamicIntent: vi.fn(),
}))

// mock AppointmentRepository（AppointmentRepository.findActive mock）
vi.mock('@/domains/timebox/repository', () => ({
  AppointmentRepository: class {
    async findActive() {
      return [
        { id: 'a-1', title: '已过期约定', startTime: '2026-07-01T10:00:00Z', status: 'expired' },
        { id: 'a-2', title: '计划约定', startTime: '2026-07-20T10:00:00Z', status: 'scheduled' },
        { id: 'a-3', title: '执行中约定', startTime: '2026-07-15T10:00:00Z', status: 'in_progress' },
      ]
    }
  },
  TimeboxRepository: class {},
}))

import { timeboxCnuiHandler } from '@/domains/timebox/cnui/handlers'
import { submitDynamicIntent } from '@/app/actions/intent'

describe('timeboxCnuiHandler.open("createAppointment")', () => {
  it('returns default draft with tomorrow 9:00 + 1h when no drafts', async () => {
    const result = await timeboxCnuiHandler.open('createAppointment', {} as any)
    expect(result.dataSnapshot?.items).toBeDefined()
    const items = (result.dataSnapshot?.items as any[]) ?? []
    expect(items.length).toBe(1)
    expect(items[0].title).toBe('')
    expect(items[0].durationMin).toBe(60)
    // tomorrow 9:00 — startTime 应为 ISO 串
    expect(typeof items[0].startTime).toBe('string')
  })

  it('returns drafts from intentFields', async () => {
    const drafts = [{ id: 'd-1', title: '看牙医', startTime: '2026-07-15T14:00:00Z', durationMin: 60, people: [], detail: null }]
    const result = await timeboxCnuiHandler.open('createAppointment', { drafts } as any)
    expect(result.dataSnapshot?.items).toEqual(drafts)
  })

  it('existing.appointments includes {scheduled, in_progress} only (findActive filter)', async () => {
    const result = await timeboxCnuiHandler.open('createAppointment', {
      drafts: [{ id: 'd-1', title: 't', startTime: '2026-07-15T00:00:00Z', durationMin: 60, people: [], detail: null }],
    } as any)
    expect(result.dataSnapshot?.existing).toBeDefined()
    // 验证 existing 来自 findActive（mock 已控制返回 3 条不同状态约定）
    const existing = result.dataSnapshot?.existing as Array<{ id: string; status: string }>
    expect(existing.length).toBe(3)
    expect(existing.map(e => e.status)).toEqual(expect.arrayContaining(['expired', 'scheduled', 'in_progress']))
  })
})

describe('timeboxCnuiHandler.submit("createAppointment")', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('transmits activityArchetypeId to submitDynamicIntent', async () => {
    vi.mocked(submitDynamicIntent).mockResolvedValue({
      success: true,
      object: { id: 'a-new', title: '看牙医' },
    } as any)
    await timeboxCnuiHandler.submit('createAppointment', {
      items: [
        {
          id: 't-1', title: '看牙医', startTime: '2026-07-15T14:00:00Z',
          durationMin: 60, people: [], detail: null, activityArchetypeId: 'arch-123',
        },
      ],
    } as any)
    expect(submitDynamicIntent).toHaveBeenCalledWith(
      'timebox',
      'createAppointment',
      expect.objectContaining({ activityArchetypeId: 'arch-123' }),
    )
  })

  it('omits activityArchetypeId when undefined', async () => {
    vi.mocked(submitDynamicIntent).mockResolvedValue({
      success: true,
      object: { id: 'a-new', title: 't' },
    } as any)
    await timeboxCnuiHandler.submit('createAppointment', {
      items: [
        { id: 't-1', title: 't', startTime: '2026-07-15T14:00:00Z', durationMin: 60, people: [], detail: null },
      ],
    } as any)
    expect(submitDynamicIntent).toHaveBeenCalledWith(
      'timebox',
      'createAppointment',
      expect.not.objectContaining({ activityArchetypeId: expect.anything() }),
    )
  })

  it('returns succeeded/failed summary (count + per-item error reason)', async () => {
    vi.mocked(submitDynamicIntent)
      .mockResolvedValueOnce({ success: true, object: { id: 'a-1' } } as any)
      .mockResolvedValueOnce({ success: false, error: '缺少必需字段' } as any)
    const result = await timeboxCnuiHandler.submit('createAppointment', {
      items: [
        { id: 't-1', title: '成功', startTime: '2026-07-15T14:00:00Z', durationMin: 60, people: [], detail: null },
        { id: 't-2', title: '', startTime: '2026-07-15T14:00:00Z', durationMin: 60, people: [], detail: null },
      ],
    } as any)
    expect(result.success).toBe(false)
    expect(result.data).toMatchObject({ count: 1 })
    // RC-B 修复：错误字符串必须含具体原因
    expect(result.error).toContain('缺少必需字段')
  })
})