/**
 * @file appointment-actions.test
 * @brief [026.01] appointment server actions 测试
 *
 * 覆盖：
 * - createAppointment 加 archetype owner-check：有 archetypeId → 调 assertArchetypeOwned
 * - createAppointment 无 archetypeId → 跳过 owner-check
 * - updateAppointment 字段白名单：status 等生命周期列被丢弃
 * - updateAppointment 允许 activityArchetypeId
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// 必须在 import 前 mock 仓储 + 意图通道，避免 import-time 副作用
const { mockArchFindById, mockSubmit, mockServiceExecute, mockRepoFindById } = vi.hoisted(() => ({
  mockArchFindById: vi.fn(),
  mockSubmit: vi.fn(),
  mockServiceExecute: vi.fn(),
  mockRepoFindById: vi.fn(),
}))

vi.mock('@/lib/db/repositories/activity-archetype.repository', () => ({
  ActivityArchetypeRepository: class {
    findById = mockArchFindById
  },
}))

vi.mock('@/app/actions/intent', () => ({
  submitDynamicIntent: (...args: unknown[]) => mockSubmit(...args),
}))

vi.mock('@/domains/timebox/repository', () => ({
  AppointmentRepository: class { findById = mockRepoFindById },
  TimeboxRepository: class {},
}))

vi.mock('@/app/actions/timebox/mutation-service', () => ({
  createAppointmentMutationService: () => ({ execute: mockServiceExecute }),
  createTimeboxMutationService: () => ({ execute: mockServiceExecute }),
}))

// import-after-mock
// eslint-disable-next-line import/first
import { createAppointment, updateAppointment } from '../timebox'

const MVP = '00000000-0000-0000-0000-000000000001'

describe('createAppointment with archetype owner-check', () => {
  beforeEach(() => {
    mockArchFindById.mockReset()
    mockSubmit.mockReset()
    // 默认 owner-check 成功（archetype 归属当前用户）
    mockArchFindById.mockResolvedValue({ id: 'arch-1', userId: MVP })
    // 默认意图成功
    mockSubmit.mockResolvedValue({
      success: true,
      object: { id: 'a-new', status: 'scheduled', userId: MVP },
    })
  })

  it('calls assertArchetypeOwned (via ActivityArchetypeRepository.findById) when activityArchetypeId present', async () => {
    await createAppointment({
      title: '看牙医',
      startTime: '2026-07-15T14:00:00Z',
      durationMin: 60,
      activityArchetypeId: 'arch-1',
    } as any)

    // owner-check 已执行（archetype 归属 MVP）
    expect(mockArchFindById).toHaveBeenCalledWith('arch-1', MVP)
    // 意图通道收到 archetypeId 透传
    expect(mockSubmit).toHaveBeenCalledWith(
      'timebox', 'createAppointment',
      expect.objectContaining({ activityArchetypeId: 'arch-1' }),
      undefined,
    )
  })

  it('skips owner-check when activityArchetypeId absent', async () => {
    await createAppointment({
      title: '看牙医',
      startTime: '2026-07-15T14:00:00Z',
      durationMin: 60,
    })

    expect(mockArchFindById).not.toHaveBeenCalled()
    expect(mockSubmit).toHaveBeenCalledTimes(1)
  })

  it('archetype 不属于当前用户 → throw（owner-check fail-fast）', async () => {
    mockArchFindById.mockResolvedValue(null) // 找不到 → 跨用户场景
    await expect(createAppointment({
      title: 'x', startTime: '2026-07-15T14:00:00Z', durationMin: 60,
      activityArchetypeId: 'arch-other',
    } as any)).rejects.toThrow(/活动原型不存在或不属于当前用户/)
    // owner-check 失败后不应进入意图通道
    expect(mockSubmit).not.toHaveBeenCalled()
  })
})

describe('updateAppointment with archetype owner-check + ALLOWED_FIELDS', () => {
  beforeEach(() => {
    mockArchFindById.mockReset()
    mockServiceExecute.mockReset()
    mockRepoFindById.mockReset()
    // 默认 owner-check 成功
    mockArchFindById.mockResolvedValue({ id: 'arch-2', userId: MVP })
    // 默认 service 成功
    mockServiceExecute.mockResolvedValue({
      success: true,
      object: { id: 'a-1', status: 'scheduled', title: 'new' },
    })
  })

  it('blocks status field write via ALLOWED_FIELDS whitelist (status 被丢弃)', async () => {
    await updateAppointment('a-1' as any, {
      title: 'new',
      status: 'cancelled', // 应被白名单丢弃
    } as any)

    // service.execute 应被调用，但 steps 中不含 status
    expect(mockServiceExecute).toHaveBeenCalledTimes(1)
    const arg = mockServiceExecute.mock.calls[0][0]
    const stepFields = arg.steps.map((s: { field: string }) => s.field)
    expect(stepFields).not.toContain('status')
    // title 应被保留
    expect(stepFields).toContain('title')
  })

  it('allows activityArchetypeId in update fields + triggers owner-check', async () => {
    await updateAppointment('a-1' as any, {
      activityArchetypeId: 'arch-2',
      title: 'new',
    } as any)

    // owner-check 被调
    expect(mockArchFindById).toHaveBeenCalledWith('arch-2', MVP)
    // service.execute 含 activityArchetypeId
    const arg = mockServiceExecute.mock.calls[0][0]
    const stepFields = arg.steps.map((s: { field: string }) => s.field)
    expect(stepFields).toContain('activityArchetypeId')
    expect(stepFields).toContain('title')
  })

  it('omits owner-check when activityArchetypeId absent in patch', async () => {
    await updateAppointment('a-1' as any, {
      title: 'new',
    } as any)

    expect(mockArchFindById).not.toHaveBeenCalled()
  })

  it('no fields to write → read-back returns ok (不调 service)', async () => {
    // patch 中所有字段都是白名单外或 undefined → 无 field step
    mockRepoFindById.mockResolvedValue({
      id: 'a-1', status: 'scheduled', title: 'old', userId: MVP,
      detail: null, durationMin: 60, people: [], startTime: new Date('2026-07-15'),
      createdAt: new Date(), updatedAt: new Date(), schemaVersion: 1,
    } as any)
    const r = await updateAppointment('a-1' as any, {
      // 非白名单字段 → 被过滤
      status: 'cancelled',
      inProgressAt: new Date(),
    } as any)

    // service 未被调
    expect(mockServiceExecute).not.toHaveBeenCalled()
    // read-back 成功
    expect(r.status).toBe('ok')
  })
})