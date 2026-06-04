/**
 * @file cascade.test
 * @brief SM Cascade 机制单元测试
 */
import { describe, it, expect, vi } from 'vitest'
import type { USOM_ID } from '@/usom/types/primitives'
import type { GenericRepo } from '../index'

describe('SM Cascade — parent_child_status', () => {
  it('父对象 activate 时，子对象 draft→active', async () => {
    const childRepo: GenericRepo = {
      findById: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({}),
      updateStatus: vi.fn(async (id, status) => ({ id, status })),
      findByParent: vi.fn().mockResolvedValue([
        { id: 'kr-001', status: 'draft', objectiveId: 'obj-001' },
        { id: 'kr-002', status: 'draft', objectiveId: 'obj-001' },
      ]),
    }

    const cascadeRule = {
      type: 'parent_child_status' as const,
      parent_object: 'objective',
      child_object: 'key_result',
      child_query: 'findByParent',
      rules: [
        { parent_action: 'activate', child_filter: "status == 'draft'", child_to_status: 'active', event_type: 'KeyResultActivated' },
      ],
    }

    const { executeCascade } = await import('../cascade')
    const results = await executeCascade({
      rule: cascadeRule,
      parentObjectType: 'objective',
      parentAction: 'activate',
      parentId: 'obj-001' as USOM_ID,
      userId: 'user-001' as USOM_ID,
      getRepo: (_domainId: string, objectType: string) =>
        objectType === 'key_result' ? childRepo : childRepo,
    })

    expect(results).toHaveLength(1)
    expect(results[0].count).toBe(2)
    expect(results[0].toStatus).toBe('active')
    expect(childRepo.updateStatus).toHaveBeenCalledTimes(2)
  })

  it('无匹配规则时返回空数组', async () => {
    const childRepo: GenericRepo = {
      findById: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({}),
      updateStatus: vi.fn().mockResolvedValue({}),
      findByParent: vi.fn().mockResolvedValue([]),
    }

    const cascadeRule = {
      type: 'parent_child_status' as const,
      parent_object: 'objective',
      child_object: 'key_result',
      child_query: 'findByParent',
      rules: [
        { parent_action: 'activate', child_filter: "status == 'draft'", child_to_status: 'active', event_type: 'KeyResultActivated' },
      ],
    }

    const { executeCascade } = await import('../cascade')
    const results = await executeCascade({
      rule: cascadeRule,
      parentObjectType: 'objective',
      parentAction: 'pause',
      parentId: 'obj-001' as USOM_ID,
      userId: 'user-001' as USOM_ID,
      getRepo: (_domainId: string, _objectType: string) => childRepo,
    })

    expect(results).toHaveLength(0)
  })

  it('子对象过滤 — status not in 匹配', async () => {
    const childRepo: GenericRepo = {
      findById: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({}),
      updateStatus: vi.fn(async (id, status) => ({ id, status })),
      findByParent: vi.fn().mockResolvedValue([
        { id: 'kr-001', status: 'active', objectiveId: 'obj-001' },
        { id: 'kr-002', status: 'discarded', objectiveId: 'obj-001' },
        { id: 'kr-003', status: 'archived', objectiveId: 'obj-001' },
      ]),
    }

    const cascadeRule = {
      type: 'parent_child_status' as const,
      parent_object: 'objective',
      child_object: 'key_result',
      child_query: 'findByParent',
      rules: [
        { parent_action: 'discard', child_filter: "status not in ['discarded', 'archived']", child_to_status: 'discarded', event_type: 'KeyResultDiscarded' },
      ],
    }

    const { executeCascade } = await import('../cascade')
    const results = await executeCascade({
      rule: cascadeRule,
      parentObjectType: 'objective',
      parentAction: 'discard',
      parentId: 'obj-001' as USOM_ID,
      userId: 'user-001' as USOM_ID,
      getRepo: (_domainId: string, _objectType: string) => childRepo,
    })

    expect(results).toHaveLength(1)
    expect(results[0].count).toBe(1)
    expect(results[0].objectIds).toContain('kr-001')
  })

  it('父对象类型不匹配时返回空数组', async () => {
    const childRepo: GenericRepo = {
      findById: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({}),
      updateStatus: vi.fn().mockResolvedValue({}),
      findByParent: vi.fn().mockResolvedValue([]),
    }

    const cascadeRule = {
      type: 'parent_child_status' as const,
      parent_object: 'objective',
      child_object: 'key_result',
      child_query: 'findByParent',
      rules: [
        { parent_action: 'activate', child_filter: "status == 'draft'", child_to_status: 'active', event_type: 'KeyResultActivated' },
      ],
    }

    const { executeCascade } = await import('../cascade')
    const results = await executeCascade({
      rule: cascadeRule,
      parentObjectType: 'habit',  // 不匹配 rule.parent_object
      parentAction: 'activate',
      parentId: 'h-001' as USOM_ID,
      userId: 'user-001' as USOM_ID,
      getRepo: (_domainId: string, _objectType: string) => childRepo,
    })

    expect(results).toHaveLength(0)
  })
})
