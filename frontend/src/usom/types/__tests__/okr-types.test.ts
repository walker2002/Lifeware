import { describe, it, expect } from 'vitest'
import type { ObjectiveStatus, KeyResultStatus, Timestamp, USOM_ID } from '../primitives'
import type { Objective, KeyResult } from '../objects'

describe('OKR 类型定义', () => {
  describe('T001: discarded 状态', () => {
    it('ObjectiveStatus 应包含 discarded', () => {
      const status: ObjectiveStatus = 'discarded'
      expect(status).toBe('discarded')
    })

    it('KeyResultStatus 应包含 discarded', () => {
      const status: KeyResultStatus = 'discarded'
      expect(status).toBe('discarded')
    })

    it('ObjectiveStatus 应包含所有 6 种状态', () => {
      const allStatuses: ObjectiveStatus[] = [
        'draft', 'active', 'paused', 'completed', 'discarded', 'archived',
      ]
      expect(allStatuses).toHaveLength(6)
    })
  })

  describe('T002: Objective 新增 okrType 和 discardedAt', () => {
    it('Objective 应包含 okrType 字段', () => {
      const obj: Objective = {
        id: 'test-id',
        status: 'draft',
        title: '测试目标',
        objectiveNumber: 'O001',
        priority: 'P1',
        cycleId: '' as USOM_ID, // [022-T3] 占位，T16 接线真实 cycleId
        period: { type: 'quarterly' as any, start: '2026-04-01', end: '2026-06-30' },
        keyResultIds: [],
        tags: [],
        createdAt: '2026-05-11T00:00:00Z',
        updatedAt: '2026-05-11T00:00:00Z',
        okrType: 'committed',
      }
      expect(obj.okrType).toBe('committed')
    })

    it('Objective okrType 应支持 visionary', () => {
      const obj: Objective = {
        id: 'test-id',
        status: 'draft',
        title: '愿景目标',
        objectiveNumber: 'O002',
        priority: 'P2',
        cycleId: '' as USOM_ID, // [022-T3] 占位，T16 接线真实 cycleId
        period: { type: 'quarterly' as any, start: '2026-04-01', end: '2026-06-30' },
        keyResultIds: [],
        tags: [],
        createdAt: '2026-05-11T00:00:00Z',
        updatedAt: '2026-05-11T00:00:00Z',
        okrType: 'visionary',
      }
      expect(obj.okrType).toBe('visionary')
    })

    it('Objective 应包含可选的 discardedAt', () => {
      const obj: Objective = {
        id: 'test-id',
        status: 'discarded',
        title: '废弃目标',
        objectiveNumber: 'O003',
        priority: 'P1',
        cycleId: '' as USOM_ID, // [022-T3] 占位，T16 接线真实 cycleId
        period: { type: 'quarterly' as any, start: '2026-04-01', end: '2026-06-30' },
        keyResultIds: [],
        tags: [],
        createdAt: '2026-05-11T00:00:00Z',
        updatedAt: '2026-05-11T00:00:00Z',
        okrType: 'committed',
        discardedAt: '2026-05-11T12:00:00Z' as Timestamp,
      }
      expect(obj.discardedAt).toBeDefined()
    })
  })

  describe('T003: KeyResult 新增 discardedAt', () => {
    it('KeyResult 应包含可选的 discardedAt', () => {
      const kr: KeyResult = {
        id: 'kr-id',
        objectiveId: 'obj-id',
        title: '测试 KR',
        targetValue: 100,
        currentValue: 0,
        unit: '%',
        progressRate: 0,
        confidence: 50,
        status: 'discarded',
        createdAt: '2026-05-11T00:00:00Z',
        updatedAt: '2026-05-11T00:00:00Z',
        discardedAt: '2026-05-11T12:00:00Z' as Timestamp,
      }
      expect(kr.discardedAt).toBeDefined()
    })
  })
})
