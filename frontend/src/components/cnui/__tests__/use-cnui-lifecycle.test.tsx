/**
 * @file use-cnui-lifecycle 测试
 * @brief [019.0] Lane B 回填契约：onSubmit 结果契约 + serverErrors 存储 + saved bug
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCnuiLifecycle, type CnuiSubmitResult } from '../use-cnui-lifecycle'

/** lifecycle onSubmit 的类型（[019.0] 结果契约） */
type OnSubmit = (surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => Promise<CnuiSubmitResult>

/** 驱动一次 save→confirm 流程并返回最终 surfaceState/serverErrors */
async function driveSubmit(onSubmit: ReturnType<typeof vi.fn<OnSubmit>>, result: CnuiSubmitResult) {
  onSubmit.mockResolvedValue(result)
  const { result: hook } = renderHook(() => useCnuiLifecycle(onSubmit))
  // result 是 { current: [state, actions] } ref，必须经 current 访问（@testing-library/react 约定）
  act(() => hook.current[1].requestSave('s1', 'tasks', 'createTask', { title: 'x' }))
  await act(async () => { await hook.current[1].confirmDialogAction() })
  return {
    surfaceState: hook.current[0].surfaceStates['s1'],
    serverErrors: hook.current[0].serverErrors['s1'],
  }
}

describe('useCnuiLifecycle [019.0] 回填契约', () => {
  it('成功：标记 saved 且无 serverErrors', async () => {
    const onSubmit = vi.fn<OnSubmit>()
    const { surfaceState, serverErrors } = await driveSubmit(onSubmit, { success: true })
    expect(surfaceState).toBe('saved')
    expect(serverErrors).toBeUndefined()
  })

  it('失败带 serverErrors：不标 saved，存字段错误', async () => {
    const onSubmit = vi.fn<OnSubmit>()
    const { surfaceState, serverErrors } = await driveSubmit(onSubmit, {
      success: false,
      serverErrors: ['标题不能为空'],
    })
    expect(surfaceState).toBeUndefined()
    expect(serverErrors).toEqual(['标题不能为空'])
  })

  it('失败无 serverErrors：兜底通用错误且不标 saved', async () => {
    const onSubmit = vi.fn<OnSubmit>()
    const { surfaceState, serverErrors } = await driveSubmit(onSubmit, { success: false })
    expect(surfaceState).toBeUndefined()
    expect(serverErrors).toEqual(['保存失败，请稍后重试'])
  })

  it('失败后再次成功：清空 serverErrors 并标 saved', async () => {
    const onSubmit = vi.fn<OnSubmit>()
    onSubmit.mockResolvedValueOnce({ success: false, serverErrors: ['err'] })
    const { result: hook } = renderHook(() => useCnuiLifecycle(onSubmit))
    act(() => hook.current[1].requestSave('s1', 'tasks', 'createTask', { title: 'x' }))
    await act(async () => { await hook.current[1].confirmDialogAction() })
    expect(hook.current[0].serverErrors['s1']).toEqual(['err'])

    onSubmit.mockResolvedValueOnce({ success: true })
    act(() => hook.current[1].requestSave('s1', 'tasks', 'createTask', { title: 'y' }))
    await act(async () => { await hook.current[1].confirmDialogAction() })
    expect(hook.current[0].surfaceStates['s1']).toBe('saved')
    expect(hook.current[0].serverErrors['s1']).toBeUndefined()
  })
})
