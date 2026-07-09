/**
 * @file handlers-edit-appointment.test
 * @brief [026.01] 测试 timeboxCnuiHandler 对 editAppointment 的解析优先 + 降级 + delete
 *
 * 覆盖：
 * - open('editAppointment') 3 路径（空 prompt 降级 / unsure 降级 / 解析命中 editing 模式）
 * - submit('editAppointment') op=update 透传 archetype + 缺失 id 报错
 * - submit('editAppointment') op=delete 走 deleteAppointment + 透传 SM reject 错误
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

// mock 端点：createAIRuntime 控制 LLM 响应
vi.mock('@/nexus/ai-runtime', () => ({
  createAIRuntime: vi.fn(),
}))

vi.mock('@/app/actions/timebox', () => ({
  updateAppointment: vi.fn(),
  deleteAppointment: vi.fn(),
}))

// mock AppointmentRepository.findActive —— open 路径用
vi.mock('@/domains/timebox/repository', () => ({
  AppointmentRepository: class {
    async findActive() {
      return [
        {
          id: 'a-1',
          title: '看牙医',
          startTime: '2026-07-15T14:00:00Z',
          durationMin: 60,
          detail: null,
          people: [],
          status: 'scheduled',
        },
      ]
    }
    async findById() { return null }
  },
  TimeboxRepository: class {},
}))

import { timeboxCnuiHandler } from '@/domains/timebox/cnui/handlers'
import { updateAppointment, deleteAppointment } from '@/app/actions/timebox'
import { createAIRuntime } from '@/nexus/ai-runtime'

/** 构造可控 LLM 响应 — text 字段含 JSON 即可被 parseAppointmentIntent 解析 */
function mockLLMText(text: string) {
  vi.mocked(createAIRuntime).mockReturnValue({
    generate: vi.fn().mockResolvedValue({ text, content: text }),
    stream: vi.fn(),
    gateway: {} as never,
    budget: { record: vi.fn(), getDailySummary: vi.fn() } as never,
    cache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn(), clear: vi.fn(), generateKey: vi.fn() } as never,
  } as any)
}

describe('timeboxCnuiHandler.open("editAppointment")', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns selecting mode when prompt is empty', async () => {
    mockLLMText('') // 兜底，prompt 空时 parseAppointmentIntent 不调 LLM
    const result = await timeboxCnuiHandler.open('editAppointment', {} as any)
    expect(result.dataSnapshot?.mode).toBe('selecting')
    // items 来自 findActive mock
    expect((result.dataSnapshot?.items as any[]).length).toBe(1)
  })

  it('returns selecting mode when LLM parse fails (unsure)', async () => {
    // parseAppointmentIntent 失败降级 → 返回 { kind: 'unsure' }
    // 用畸形 JSON 触发 parse 失败
    mockLLMText('not-json-at-all')
    const result = await timeboxCnuiHandler.open('editAppointment', { prompt: '改成下午3点' } as any)
    expect(result.dataSnapshot?.mode).toBe('selecting')
  })

  it('returns editing mode when parse succeeds with high confidence', async () => {
    // 高 confidence 命中 a-1 → editing 模式
    mockLLMText(JSON.stringify({
      kind: 'edit',
      appointmentId: 'a-1',
      newStartTime: '2026-07-15T15:00:00+08:00',
      confidence: 0.95,
    }))
    const result = await timeboxCnuiHandler.open('editAppointment', { prompt: '把看牙医改到下午3点' } as any)
    expect(result.dataSnapshot?.mode).toBe('editing')
    expect(result.dataSnapshot?.selectedId).toBe('a-1')
    // prefill 含 base 字段 + 解析出的新时间
    const prefill = result.dataSnapshot?.prefill as Record<string, unknown>
    expect(prefill.title).toBe('看牙医')
    expect(prefill.startTime).toBe('2026-07-15T15:00:00+08:00')
  })
})

describe('timeboxCnuiHandler.submit("editAppointment") with op=update', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('transmits activityArchetypeId to updateAppointment', async () => {
    vi.mocked(updateAppointment).mockResolvedValue({ status: 'ok', appointment: {} } as any)
    await timeboxCnuiHandler.submit('editAppointment', {
      selected: {
        id: 'a-1',
        title: '看牙医',
        startTime: '2026-07-15T14:00:00Z',
        durationMin: 60,
        detail: null,
        people: [],
        status: 'scheduled',
        activityArchetypeId: 'arch-123',
      },
    } as any)
    expect(updateAppointment).toHaveBeenCalledWith(
      'a-1',
      expect.objectContaining({ activityArchetypeId: 'arch-123' }),
    )
  })

  // [026.02.4] TD-022 #6: handler mapper 3-state 语义
  // undefined → 跳过该字段（不传 activityArchetypeId 给 updateAppointment）
  // null      → 透传 null（updateAppointment 写 SQL NULL）
  // string    → 透传 string（updateAppointment 设置值）
  it('transmits activityArchetypeId=null as explicit clear (3-state)', async () => {
    vi.mocked(updateAppointment).mockResolvedValue({ status: 'ok', appointment: {} } as any)
    await timeboxCnuiHandler.submit('editAppointment', {
      selected: {
        id: 'a-1',
        title: '看牙医',
        startTime: '2026-07-15T14:00:00Z',
        durationMin: 60,
        detail: null,
        people: [],
        status: 'scheduled',
        activityArchetypeId: null, // [026.02.4] 显式清除语义
      },
    } as any)
    const callArg = vi.mocked(updateAppointment).mock.calls[0]
    expect(callArg[0]).toBe('a-1')
    expect(callArg[1]).toHaveProperty('activityArchetypeId', null)
  })

  it('omits activityArchetypeId when undefined (skip semantics)', async () => {
    vi.mocked(updateAppointment).mockResolvedValue({ status: 'ok', appointment: {} } as any)
    await timeboxCnuiHandler.submit('editAppointment', {
      selected: {
        id: 'a-1',
        title: '看牙医',
        startTime: '2026-07-15T14:00:00Z',
        durationMin: 60,
        detail: null,
        people: [],
        status: 'scheduled',
        // activityArchetypeId 不传（undefined = skip）
      },
    } as any)
    const callArg = vi.mocked(updateAppointment).mock.calls[0]
    expect(callArg[0]).toBe('a-1')
    // undefined 时 mapper 应跳过该字段，不出现在 patch 对象中
    expect(callArg[1]).not.toHaveProperty('activityArchetypeId')
  })

  it('returns error when selected.id is missing', async () => {
    const result = await timeboxCnuiHandler.submit('editAppointment', { selected: {} } as any)
    expect(result.success).toBe(false)
    expect(result.error).toBe('未选择约定')
  })
})

describe('timeboxCnuiHandler.submit("editAppointment") with op=delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls deleteAppointment when operation is delete', async () => {
    vi.mocked(deleteAppointment).mockResolvedValue({ status: 'ok', appointment: {} } as any)
    await timeboxCnuiHandler.submit('editAppointment', {
      selected: {
        id: 'a-1', title: 't', startTime: '2026-07-15T14:00:00Z',
        durationMin: 60, people: [], detail: null, status: 'scheduled',
      },
      operation: 'delete',
    } as any)
    expect(deleteAppointment).toHaveBeenCalledWith('a-1')
  })

  it('returns error when deleteAppointment throws (SM rejection for terminal state)', async () => {
    vi.mocked(deleteAppointment).mockRejectedValue(new Error('已过期约定不可取消'))
    const result = await timeboxCnuiHandler.submit('editAppointment', {
      selected: {
        id: 'a-1', title: 't', startTime: '2026-07-15T14:00:00Z',
        durationMin: 60, people: [], detail: null, status: 'expired',
      },
      operation: 'delete',
    } as any)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/已过期约定/)
  })
})