/**
 * @file derive-current-timebox
 * @brief [023.12] T13 (AM4) — deriveCurrentTimebox 派生填充链单测
 *
 * 覆盖 5 个场景：
 * 1. 无 timeboxRepo → undefined（向后兼容）
 * 2. timeboxRepo.findByStatus 抛错 → undefined（静默空，plan §R9）
 * 3. 无 planned timebox → undefined
 * 4. 多个 planned timebox 含 1 个 running → 返回该 running summary
 * 5. 多个 planned timebox 多个 running → 返回 startTime 最早的
 */

import { describe, it, expect, vi } from 'vitest'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { ContextSnapshot } from '@/usom/types/process'
import type { Timebox } from '@/usom/types/objects'
import type { ITimeboxRepository } from '@/usom/interfaces/irepository'
import { deriveCurrentTimebox } from '../index'

/** 创建 mock ITimeboxRepository */
function makeTimeboxRepo(overrides: Partial<ITimeboxRepository> = {}): ITimeboxRepository {
  return {
    findById: vi.fn(),
    findRunning: vi.fn(),
    findByStatus: vi.fn().mockResolvedValue([]),
    findUpcoming: vi.fn(),
    findByDateRange: vi.fn(),
    save: vi.fn(),
    // [TD-003] T2: ITimeboxRepository.updateFields（OCC 必填）mock stub
    updateFields: vi.fn(),
    archive: vi.fn(),
    ...overrides,
  }
}

/** 创建 mock Timebox 全对象 */
function makeTimebox(overrides: Partial<Timebox> = {}): Timebox {
  return {
    id: 'tb-001' as USOM_ID,
    status: 'planned',
    title: '专注写作',
    startTime: '2026-05-03T09:00:00Z' as Timestamp,
    endTime: '2026-05-03T10:00:00Z' as Timestamp,
    taskIds: [],
    habitIds: [],
    isRecurring: false,
    tags: [],
    // [TD-003] T2: OCC + schemaVersion 字段补齐（USOM Timebox 新增）
    occVersion: 1,
    schemaVersion: 1,
    createdAt: '2026-05-01T00:00:00Z' as Timestamp,
    updatedAt: '2026-05-01T00:00:00Z' as Timestamp,
    ...overrides,
  }
}

/** 创建 mock ContextSnapshot */
function makeSnapshot(overrides: Partial<ContextSnapshot> = {}): ContextSnapshot {
  return {
    snapshotId: 'snap-001' as USOM_ID,
    userId: 'user-001' as USOM_ID,
    generatedAt: '2026-05-03T09:30:00Z' as Timestamp,
    generatedBy: 'state_machine',
    activeObjectives: [],
    activeKeyResults: [],
    activeTasks: [],
    pendingHabits: [],
    upcomingTimeboxes: [],
    pendingIntentions: [],
    currentTime: '2026-05-03T09:30:00Z' as Timestamp,
    currentDate: '2026-05-03' as any,
    dayOfWeek: 0,
    timeOfDay: 'morning' as any,
    energyState: { inferredLevel: 5, calibratedLevel: null, activeLevel: 5, source: 'system' },
    ...overrides,
  } as ContextSnapshot
}

describe('deriveCurrentTimebox [023.12 T13 AM4]', () => {
  it('无 timeboxRepo 时返回 undefined（向后兼容）', async () => {
    const snapshot = makeSnapshot()
    const result = await deriveCurrentTimebox(snapshot, undefined)
    expect(result).toBeUndefined()
  })

  it('timeboxRepo.findByStatus 抛错时返回 undefined（静默空）', async () => {
    const repo = makeTimeboxRepo({
      findByStatus: vi.fn().mockRejectedValue(new Error('DB down')),
    })
    const snapshot = makeSnapshot()
    const result = await deriveCurrentTimebox(snapshot, repo)
    expect(result).toBeUndefined()
  })

  it('无 planned timebox 时返回 undefined', async () => {
    const repo = makeTimeboxRepo({
      findByStatus: vi.fn().mockResolvedValue([]),
    })
    const snapshot = makeSnapshot()
    const result = await deriveCurrentTimebox(snapshot, repo)
    expect(result).toBeUndefined()
  })

  it('多个 planned 含 1 个 running 时返回该 running summary', async () => {
    // now = 09:30；只有 tb-mid (09:30-10:30) 是 running
    const planned = [
      makeTimebox({ id: 'tb-early' as USOM_ID, startTime: '2026-05-03T08:00:00Z' as Timestamp, endTime: '2026-05-03T09:00:00Z' as Timestamp }),
      makeTimebox({ id: 'tb-mid' as USOM_ID, startTime: '2026-05-03T09:30:00Z' as Timestamp, endTime: '2026-05-03T10:30:00Z' as Timestamp, title: '专注写作' }),
      makeTimebox({ id: 'tb-late' as USOM_ID, startTime: '2026-05-03T11:00:00Z' as Timestamp, endTime: '2026-05-03T12:00:00Z' as Timestamp }),
    ]
    const repo = makeTimeboxRepo({
      findByStatus: vi.fn().mockResolvedValue(planned),
    })
    const snapshot = makeSnapshot()
    const result = await deriveCurrentTimebox(snapshot, repo)
    expect(result).toBeDefined()
    expect(result?.id).toBe('tb-mid')
    expect(result?.title).toBe('专注写作')
    expect(result?.status).toBe('planned')
  })

  it('多个 running 时返回 startTime 最早的（first 规则）', async () => {
    // now = 10:00；tb-a (09:00-11:00) + tb-b (09:30-10:30) 都 running
    // 应取 tb-a（startTime 最早）
    const planned = [
      makeTimebox({ id: 'tb-b' as USOM_ID, startTime: '2026-05-03T09:30:00Z' as Timestamp, endTime: '2026-05-03T10:30:00Z' as Timestamp }),
      makeTimebox({ id: 'tb-a' as USOM_ID, startTime: '2026-05-03T09:00:00Z' as Timestamp, endTime: '2026-05-03T11:00:00Z' as Timestamp }),
    ]
    const repo = makeTimeboxRepo({
      findByStatus: vi.fn().mockResolvedValue(planned),
    })
    const snapshot = makeSnapshot()
    const result = await deriveCurrentTimebox(snapshot, repo)
    expect(result?.id).toBe('tb-a')
  })
})
