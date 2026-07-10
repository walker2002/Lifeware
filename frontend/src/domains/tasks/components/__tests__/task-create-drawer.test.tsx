import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const createTaskMock = vi.fn()
const getThreadsMock = vi.fn()
const getArchetypesMock = vi.fn()
vi.mock('@/app/actions/tasks', () => ({
  createTask: (...args: unknown[]) => createTaskMock(...args),
  getThreads: (...args: unknown[]) => getThreadsMock(...args),
}))
vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: (...args: unknown[]) => getArchetypesMock(...args),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/nexus/rules/use-manifest-rules', () => ({
  useManifestRules: () => ({ errors: {}, validateField: vi.fn() }),
}))

import { TaskCreateDrawer, type TaskCreateDefaults } from '../task-create-drawer'

const baseProps = (defaults: TaskCreateDefaults = {}) => ({
  defaults,
  userId: 'user-1' as never,
  onClose: vi.fn(),
  onCreated: vi.fn(),
})

describe('TaskCreateDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getThreadsMock.mockResolvedValue([])
    getArchetypesMock.mockResolvedValue({ success: true, data: [] })
    createTaskMock.mockResolvedValue({ id: 'task-new', title: 'x' })
  })

  it('defaults.title 预填到标题输入框', () => {
    render(<TaskCreateDrawer {...baseProps({ title: '来自快速添加' })} />)
    expect((screen.getByPlaceholderText('例如：完成周报') as HTMLInputElement).value).toBe('来自快速添加')
  })

  it('填写后提交调用 createTask 含预填 parentId/title', async () => {
    const user = userEvent.setup()
    render(<TaskCreateDrawer {...baseProps({ parentId: 'parent-1' })} />)
    await user.type(screen.getByPlaceholderText('例如：完成周报'), '新子任务')
    await user.click(screen.getByRole('button', { name: /创建任务/ }))
    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledTimes(1)
    })
    const payload = createTaskMock.mock.calls[0][0] as Record<string, unknown>
    expect(payload.title).toBe('新子任务')
    expect(payload.parentId).toBe('parent-1')
  })

  it('空标题时禁用提交按钮', () => {
    render(<TaskCreateDrawer {...baseProps()} />)
    expect(screen.getByRole('button', { name: /创建任务/ })).toBeDisabled()
  })

  it('[027-A] 渲染「活动原型」选择字段', async () => {
    render(<TaskCreateDrawer {...baseProps()} />)
    expect(await screen.findByText('活动原型')).toBeInTheDocument()
  })
})
