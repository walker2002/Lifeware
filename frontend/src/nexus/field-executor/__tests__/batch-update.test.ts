/**
 * @file batch-update
 * @brief field-executor batch OCC 测试（[TD-003] T3）
 *
 * 验证 multi-field write 通过 validate-all-first + single atomic
 * repo.updateFields(dict) + post-write events 实现，不退化为 per-field
 * 多次 atomic UPDATE（后者会触发 multi-field OCC self-conflict）。
 *
 * 关键约束：
 *  - field-executor.executeBatch 必须消除硬码 0 占位符——timebox caller 真实
 *    传 expectedOccVersion，否则并发场景静默失败（T2 reviewer I-2）。
 *  - OCC atomic：validate-all → single updateFields(dict) → post-write events。
 *  - Phase 1 validate 失败 → 不调 updateFields + 0 events。
 *  - Phase 2 repo.updateFields 抛 ConflictError → propagate + 0 events。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GenericRepo } from '@/nexus/core/state-machine'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { FieldMetadata } from '@/usom/types/domain-types'
import { createFieldExecutor, type FieldExecutorContext } from '../index'
import { ConflictError } from '@/domains/timebox/errors/occ-conflict-error'

// 与 habits/tasks manifest field_metadata 等价的字段元数据
const FIELD_META: Record<string, FieldMetadata> = {
  title: { type: 'string', label: '标题', required: false, mutation_mode: 'FactField' },
  startTime: { type: 'date', label: '开始时间', required: false, mutation_mode: 'FactField' },
  endTime: { type: 'date', label: '结束时间', required: false, mutation_mode: 'FactField' },
  activityArchetypeId: { type: 'string', label: '活动原型', required: false, mutation_mode: 'FactField' },
  notes: { type: 'string', label: '备注', required: false, mutation_mode: 'FactField' },
  priority: {
    type: 'enum', label: '优先级', required: false,
    options: ['low', 'med', 'high'], mutation_mode: 'FactField',
  },
}

function makeRepo(overrides: Partial<GenericRepo> = {}): GenericRepo {
  return {
    findById: vi.fn().mockResolvedValue({ id: 'tb-1', occVersion: 1 }),
    save: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({}),
    updateStatus: vi.fn().mockResolvedValue({}),
    updateFields: vi.fn().mockResolvedValue({ id: 'tb-1', occVersion: 2 }),
    ...overrides,
  } as GenericRepo
}

function makeEventBus(): { bus: EventBus; published: any[] } {
  const published: any[] = []
  const bus: EventBus = {
    subscribe: vi.fn().mockReturnValue(() => {}),
    publish: vi.fn((e) => published.push(e)),
  }
  return { bus, published }
}

function makeCtx(opts: {
  repo: GenericRepo
  bus: EventBus
  fieldMetadata?: Record<string, FieldMetadata>
}): FieldExecutorContext {
  return {
    repo: opts.repo,
    eventBus: opts.bus,
    objectType: 'timebox',
    fieldMetadata: opts.fieldMetadata ?? FIELD_META,
    fieldUpdatedEventType: 'TimeboxFieldUpdated',
    tx: undefined,
  }
}

describe('[TD-003] field-executor batch OCC', () => {
  let mockRepo: GenericRepo
  let eventBusApi: { bus: EventBus; published: any[] }

  beforeEach(() => {
    mockRepo = makeRepo()
    eventBusApi = makeEventBus()
  })

  it('5 fields batch → 1 atomic repo.updateFields(dict) call + 5 events emitted post-write', async () => {
    const executor = createFieldExecutor()
    const startTime = new Date('2026-07-07T08:00:00.000Z')
    const endTime = new Date('2026-07-07T08:30:00.000Z')
    const steps = [
      { kind: 'field' as const, field: 'title', value: 'new title' },
      { kind: 'field' as const, field: 'startTime', value: startTime },
      { kind: 'field' as const, field: 'endTime', value: endTime },
      { kind: 'field' as const, field: 'activityArchetypeId', value: 'arch-1' },
      { kind: 'field' as const, field: 'notes', value: 'note' },
    ]

    await executor.executeBatch(
      'tb-1' as any,
      steps as any,
      'user-1' as any,
      makeCtx({ repo: mockRepo, bus: eventBusApi.bus }),
    )

    // 关键断言 1：repo.updateFields 只调 1 次（不是 5 次 per-field loop）
    expect(mockRepo.updateFields).toHaveBeenCalledTimes(1)
    const callArgs = (mockRepo.updateFields as any).mock.calls[0]
    expect(callArgs[0]).toBe('tb-1')
    expect(callArgs[1]).toEqual({
      title: 'new title',
      startTime,
      endTime,
      activityArchetypeId: 'arch-1',
      notes: 'note',
    })
    expect(callArgs[2]).toBe('user-1')
    // 关键断言 2：expectedOccVersion 是 number（不是硬码 0）
    // caller 未传 → 走 repo.findById fallback，期望读出 1
    expect(callArgs[3]).toBe(1)
    expect(callArgs[4]).toBeUndefined()  // tx

    // 关键断言 3：5 events post-write（顺序无关，每 field 一 event）
    expect(eventBusApi.published).toHaveLength(5)
    const fields = eventBusApi.published.map(e => e.payload.field)
    expect(fields.sort()).toEqual(['activityArchetypeId', 'endTime', 'notes', 'startTime', 'title'])
    for (const evt of eventBusApi.published) {
      expect(evt.type).toBe('TimeboxFieldUpdated')
      expect(evt.payload.objectId).toBe('tb-1')
      expect(evt.payload.objectType).toBe('timebox')
    }
  })

  it('caller 显式传 expectedOccVersion → 跳过 repo.findById fallback（OCC 0→1 atomic）', async () => {
    const executor = createFieldExecutor()
    const steps = [
      { kind: 'field' as const, field: 'title', value: 'x', expectedOccVersion: 5 },
      { kind: 'field' as const, field: 'notes', value: 'y', expectedOccVersion: 5 },
    ]

    await executor.executeBatch(
      'tb-1' as any,
      steps as any,
      'user-1' as any,
      makeCtx({ repo: mockRepo, bus: eventBusApi.bus }),
    )

    // 关键断言：未走 repo.findById fallback（caller 已显式传）
    expect(mockRepo.findById).not.toHaveBeenCalled()
    expect(mockRepo.updateFields).toHaveBeenCalledTimes(1)
    expect((mockRepo.updateFields as any).mock.calls[0][3]).toBe(5)
  })

  it('stale expectedOccVersion → ConflictError propagate + 0 events emitted', async () => {
    ;(mockRepo.updateFields as any).mockRejectedValue(new ConflictError(3, 1))

    const executor = createFieldExecutor()
    const steps = [
      { kind: 'field' as const, field: 'title', value: 'x' },
      { kind: 'field' as const, field: 'notes', value: 'y' },
    ]

    await expect(
      executor.executeBatch(
        'tb-1' as any,
        steps as any,
        'user-1' as any,
        makeCtx({ repo: mockRepo, bus: eventBusApi.bus }),
      ),
    ).rejects.toThrow(ConflictError)

    // 关键断言：conflict 后 0 events（事件必须 post-write 才发）
    expect(eventBusApi.published).toHaveLength(0)
  })

  it('validate 失败任意 field → 返回 Rejected，不调 updateFields + 0 events', async () => {
    const executor = createFieldExecutor()
    const steps = [
      { kind: 'field' as const, field: 'title', value: 'x' },
      { kind: 'field' as const, field: 'priority', value: 'invalid_enum' },
    ]

    const result = await executor.executeBatch(
      'tb-1' as any,
      steps as any,
      'user-1' as any,
      makeCtx({ repo: mockRepo, bus: eventBusApi.bus }),
    )

    // 关键断言：validate 失败 → 返回 Rejected（field-executor 内部契约）
    expect(result.kind).toBe('Rejected')
    // 关键断言：validate 失败 → 不调 repo + 不发 events
    expect(mockRepo.updateFields).not.toHaveBeenCalled()
    expect(eventBusApi.published).toHaveLength(0)
  })

  it('未声明字段（不在 fieldMetadata 内）→ validate 拒绝，不调 repo', async () => {
    const executor = createFieldExecutor()
    const steps = [
      { kind: 'field' as const, field: 'unknownField', value: 'x' },
    ]

    const result = await executor.executeBatch(
      'tb-1' as any,
      steps as any,
      'user-1' as any,
      makeCtx({ repo: mockRepo, bus: eventBusApi.bus }),
    )

    expect(result.kind).toBe('Rejected')
    expect(mockRepo.updateFields).not.toHaveBeenCalled()
    expect(eventBusApi.published).toHaveLength(0)
  })

  it('空 steps（无 field 步骤）→ 走 batch 但不调 updateFields（state-only 聚合场景占位）', async () => {
    const executor = createFieldExecutor()
    const steps: any[] = []  // 无 field 步骤（聚合写里只 state）

    // 不期望抛错——executeBatch 应跳过 updateFields 调用
    await executor.executeBatch(
      'tb-1' as any,
      steps,
      'user-1' as any,
      makeCtx({ repo: mockRepo, bus: eventBusApi.bus }),
    )

    expect(mockRepo.updateFields).not.toHaveBeenCalled()
    expect(eventBusApi.published).toHaveLength(0)
  })
})