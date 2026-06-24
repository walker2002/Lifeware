/**
 * @file use-manifest-rules.test
 * @brief [020] useManifestRules/useServerErrorBackfill 单参 registry + RT4 hook 行为测试
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { realtimeMetaFromRegistry } from '../realtime'
import { useManifestRules, useServerErrorBackfill } from '../use-manifest-rules'
import { taskRuleRegistry } from '@/domains/tasks/rules-registry'

describe('[020] useManifestRules 单参 registry 派生 meta', () => {
  it('从 registry 派生的 meta 与原 getRealtimeRules(tasks) 等价', () => {
    const meta = realtimeMetaFromRegistry(taskRuleRegistry)
    const ids = meta.map((m) => m.id)
    expect(ids).toEqual(expect.arrayContaining([
      'task_estimated_duration_positive', 'task_estimated_duration_max',
      'task_priority_valid', 'task_energy_required_valid',
      'task_due_date_format', 'thread_color_format',
    ]))
    expect(meta.length).toBe(6)
  })
})

describe('[020] RT4 useManifestRules 单参 hook 行为', () => {
  it('validateField 对非法值产 error', () => {
    const { result } = renderHook(() => useManifestRules(taskRuleRegistry))
    act(() => { result.current.validateField('estimatedDuration', -1) })
    expect(result.current.errors.estimatedDuration).toBeTruthy()
  })

  it('validateField 合法值清 error', () => {
    const { result } = renderHook(() => useManifestRules(taskRuleRegistry))
    act(() => { result.current.validateField('estimatedDuration', -1) })
    expect(result.current.errors.estimatedDuration).toBeTruthy()
    act(() => { result.current.validateField('estimatedDuration', 30) })
    expect(result.current.errors.estimatedDuration).toBeUndefined()
  })

  it('validateAll 跑全部 realtime 字段（含非法值 → false）', () => {
    const { result } = renderHook(() => useManifestRules(taskRuleRegistry))
    let ok = true
    act(() => { ok = result.current.validateAll({ estimatedDuration: -1, priority: 'bad' }) })
    expect(ok).toBe(false)
    expect(result.current.errors.estimatedDuration).toBeTruthy()
    expect(result.current.errors.priority).toBeTruthy()
  })

  it('validateAll 全合法 → true', () => {
    const { result } = renderHook(() => useManifestRules(taskRuleRegistry))
    let ok = false
    act(() => { ok = result.current.validateAll({ estimatedDuration: 30, priority: 'high' }) })
    expect(ok).toBe(true)
  })

  it('clearField 清除指定字段 error', () => {
    const { result } = renderHook(() => useManifestRules(taskRuleRegistry))
    act(() => { result.current.validateField('estimatedDuration', -1) })
    expect(result.current.errors.estimatedDuration).toBeTruthy()
    act(() => { result.current.clearField('estimatedDuration') })
    expect(result.current.errors.estimatedDuration).toBeUndefined()
  })
})

describe('[020] useServerErrorBackfill 单参 registry', () => {
  it('服务端错误匹配 realtime 文案 → 回填字段', () => {
    const { result } = renderHook(() =>
      useServerErrorBackfill(['预估时长必须大于 0'], taskRuleRegistry),
    )
    expect(result.current.serverFieldErrors.estimatedDuration).toBe('预估时长必须大于 0')
    expect(result.current.formErrors).toEqual([])
  })

  it('无 serverErrors → 空结果', () => {
    const { result } = renderHook(() => useServerErrorBackfill(undefined, taskRuleRegistry))
    expect(result.current.serverFieldErrors).toEqual({})
    expect(result.current.formErrors).toEqual([])
  })

  it('未匹配的错误走表单级', () => {
    const { result } = renderHook(() =>
      useServerErrorBackfill(['某未知错误'], taskRuleRegistry),
    )
    expect(result.current.serverFieldErrors).toEqual({})
    expect(result.current.formErrors).toEqual(['某未知错误'])
  })
})
