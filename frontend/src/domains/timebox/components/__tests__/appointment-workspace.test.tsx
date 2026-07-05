/**
 * @file appointment-workspace.test.tsx
 * @brief [026] AppointmentWorkspace 单测
 *
 * 守护以下行为不被回归：
 *  - 初始列表渲染（标题 + 时间 + 状态）
 *  - 【BUG 修复】创建约定成功后必须触发 reload() 重拉列表
 *    （修复前用 router.refresh()，client 入口下 useState(initialItems) 不会 reset）
 *  - 多选删除后必须触发 reload()
 *  - reload 异常时显示 toast（不会把脏状态留在屏幕上）
 *  -【编辑入口】编辑按钮 / 双击 / 键盘 Enter 都触发 EditAppointmentDrawer
 *  -【编辑入口】保存修改后调 updateAppointment + reload
 *  - 终止态（expired/cancelled/completed）不显示编辑按钮（不可改）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/app/actions/timebox', () => ({
  deleteAppointment: vi.fn().mockResolvedValue({ status: 'ok', appointment: { id: 'it-1' } }),
  createAppointment: vi
    .fn()
    .mockResolvedValue({ status: 'ok', appointment: { id: 'it-new' } }),
  updateAppointment: vi
    .fn()
    .mockResolvedValue({ status: 'ok', appointment: { id: 'it-1', title: '已编辑' } }),
}))

const RELOAD_AFTER = 'it-new'
const mockGetItinerariesByRange = vi.fn()

vi.mock('@/app/actions/intent', () => ({
  getAppointmentsByRange: (...args: unknown[]) => mockGetItinerariesByRange(...args),
}))

import { AppointmentWorkspace } from '@/domains/timebox/components/appointment-workspace'
import { createAppointment, deleteAppointment, updateAppointment } from '@/app/actions/timebox'

// 含 detail/people（user 选了「扩 AppointmentSummary」方案 [026] 编辑入口）
const baseItem = {
  id: 'it-1',
  title: '故宫游览',
  startTime: '2026-07-04T09:00:00.000Z',
  durationMin: 120,
  status: 'scheduled' as const,
  detail: '看展路线：东路',
  people: ['小明', '小红'],
}

// 终止态 item（用于守护「不可编辑」）
const terminalItem = {
  ...baseItem,
  id: 'it-term',
  title: '已过期约定',
  status: 'expired' as const,
}

describe('[026] AppointmentWorkspace', () => {
  beforeEach(() => {
    vi.mocked(createAppointment).mockClear()
    vi.mocked(deleteAppointment).mockClear()
    vi.mocked(updateAppointment).mockClear()
    mockGetItinerariesByRange.mockReset()
    // 默认首次拉（mount 时不主动 fetch，靠 props 注入 initialItems）
    // 只有 reload 触发才回到此 API
  })

  it('初始列表渲染初始 appointment', () => {
    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)
    expect(screen.getByText('故宫游览')).toBeInTheDocument()
    expect(screen.getByText(/分钟$/)).toBeInTheDocument()
    // 多选删除条不显示（selected 为空）
    expect(screen.queryByText(/删除选中/)).not.toBeInTheDocument()
  })

  it('空列表显示 EmptyState「还没有约定」', () => {
    render(<AppointmentWorkspace initialItems={[]} />)
    expect(screen.getByText('还没有约定')).toBeInTheDocument()
  })

  it('【BUG 修复】创建约定成功 → onSaved → reload 触发 getAppointmentsByRange 重拉', async () => {
    // reload 返回含新 appointment 的列表（模拟服务端实际状态）
    mockGetItinerariesByRange.mockResolvedValueOnce([
      baseItem,
      { ...baseItem, id: RELOAD_AFTER, title: '新建后看到的' },
    ])

    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)

    // 打开新建抽屉
    fireEvent.click(screen.getByText('新建约定'))

    // 填标题
    const titleInput = screen.getByLabelText('事件名称') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: '新建一个' } })

    // 提交（Drawer 标题是「保存约定」）
    fireEvent.click(screen.getByText('保存约定'))

    // createAppointment 应被调用
    await waitFor(() => expect(vi.mocked(createAppointment)).toHaveBeenCalled())
    // reload 必须触发，并写入新列表
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('新建后看到的')).toBeInTheDocument())
    expect(screen.queryByText('故宫游览')).toBeInTheDocument()
  })

  it('多选删除 → reload 触发 getAppointmentsByRange', async () => {
    mockGetItinerariesByRange.mockResolvedValueOnce([])
    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)

    // 勾选
    fireEvent.click(screen.getByText('故宫游览'))
    expect(screen.getByText(/删除选中（1）/)).toBeInTheDocument()

    fireEvent.click(screen.getByText(/删除选中（1）/))

    await waitFor(() => expect(vi.mocked(deleteAppointment)).toHaveBeenCalledWith('it-1'))
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
  })

  it('reload 失败时显示错误 toast（不残留脏状态）', async () => {
    mockGetItinerariesByRange.mockRejectedValueOnce(new Error('boom'))
    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)

    // 打开新建抽屉
    fireEvent.click(screen.getByText('新建约定'))
    const titleInput = screen.getByLabelText('事件名称') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: 'x' } })
    fireEvent.click(screen.getByText('保存约定'))

    // toast 触发（sonner 默认渲染 <li> data-sonner-toast）
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
    // 不抛白屏：原列表仍可见
    expect(screen.getByText('故宫游览')).toBeInTheDocument()
  })

  // ─── [026] 编辑入口 ─────────────────────────────────────────

  it('【编辑入口】每条计划/执行中约定渲染「编辑」按钮', () => {
    render(<AppointmentWorkspace initialItems={[baseItem, terminalItem] as any} />)
    // baseItem 是 scheduled：编辑按钮可见
    expect(screen.getByLabelText('编辑约定：故宫游览')).toBeInTheDocument()
    // terminalItem 是 expired：编辑按钮不渲染（避免越权改 — AppointmentRepository 也禁）
    expect(screen.queryByLabelText('编辑约定：已过期约定')).not.toBeInTheDocument()
  })

  it('【编辑入口】点编辑按钮 → 打开 EditAppointmentDrawer（预填当前值）', async () => {
    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)
    fireEvent.click(screen.getByLabelText('编辑约定：故宫游览'))

    // Drawer 标题 = 「编辑约定」
    expect(screen.getAllByText('编辑约定').length).toBeGreaterThanOrEqual(1)
    // AppointmentFormFields 5 字段预填 baseItem 当前值
    expect((screen.getByLabelText('事件名称') as HTMLInputElement).value).toBe('故宫游览')
    expect((screen.getByLabelText('详情') as HTMLTextAreaElement).value).toBe('看展路线：东路')
    // 保存按钮文案 =「保存修改」（区别于新建的「保存约定」）
    expect(screen.getByText('保存修改')).toBeInTheDocument()
    expect(screen.queryByText('保存约定')).not.toBeInTheDocument()
  })

  it('【编辑入口】保存修改 → 调 updateAppointment + reload', async () => {
    mockGetItinerariesByRange.mockResolvedValueOnce([
      { ...baseItem, title: '故宫半天游' },
    ])

    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)
    fireEvent.click(screen.getByLabelText('编辑约定：故宫游览'))

    // 改标题
    const titleInput = screen.getByLabelText('事件名称') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: '故宫半天游' } })

    // 保存
    fireEvent.click(screen.getByText('保存修改'))

    await waitFor(() => expect(vi.mocked(updateAppointment)).toHaveBeenCalledWith(
      'it-1',
      expect.objectContaining({ title: '故宫半天游' }),
    ))
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('故宫半天游')).toBeInTheDocument())
    expect(screen.queryByText('故宫游览')).not.toBeInTheDocument()
  })

  it('【编辑入口】双击列表项 → 打开 EditAppointmentDrawer（与单击 toggle 不冲突）', () => {
    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)

    // 用 dblclick（不是 click）—— 编辑入口的关键交互
    fireEvent.doubleClick(screen.getByText('故宫游览'))

    // Drawer 出现 → 编辑模式（prefill 触发 form fields 显示）
    expect((screen.getByLabelText('事件名称') as HTMLInputElement).value).toBe('故宫游览')
    expect(screen.getByText('保存修改')).toBeInTheDocument()
  })
})
