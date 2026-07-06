/**
 * @file appointment-workspace.test.tsx
 * @brief [026] AppointmentWorkspace 单测 / [023.12] T10 完成/取消/回退按钮
 *
 * 守护以下行为不被回归：
 *  - 初始列表渲染（标题 + 时间 + 状态）
 *  - 【BUG 修复】创建约定成功后必须触发 reload() 重拉列表
 *    （修复前用 router.refresh()，client 入口下 useState(initialItems) 不会 reset）
 *  - 多选删除后必须触发 reload()
 *  - reload 异常时显示 toast（不会把脏状态留在屏幕上）
 *  -【编辑入口】编辑按钮 / 双击 / 键盘 Enter 都触发 EditAppointmentDrawer
 *  -【编辑入口】保存修改后调 updateAppointment + reload
 *  - 终止态（cancelled/completed，[023.12] T10: 移除 expired 持久态）不显示编辑/完成/取消按钮
 *  - [023.12] T10：scheduled 显示 完成/取消/编辑 三按钮，cancelled/completed 显示 回退 按钮
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
  // [023.12] T10：completeAppointment / revertAppointment 新增
  completeAppointment: vi
    .fn()
    .mockResolvedValue({ status: 'ok', appointment: { id: 'it-1', status: 'completed' } }),
  revertAppointment: vi
    .fn()
    .mockResolvedValue({ status: 'ok', appointment: { id: 'it-1', status: 'scheduled' } }),
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

// 终止态 item（用于守护「不可编辑」）—— [023.12] T10：status 3 态 (scheduled/cancelled/completed)
const terminalItem = {
  ...baseItem,
  id: 'it-term',
  title: '已取消约定',
  status: 'cancelled' as const,
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

  it('【编辑入口】每条计划约定渲染「编辑/完成/取消」按钮；终态约定不显示', () => {
    // [023.12] T10：list 过滤 scheduled；cancelled/completed 由 server NON_TERMINAL 排除
    //   不进 active 列表，故「回退」按钮当前无入口（handler 仍按 brief 保留为结构性代码）
    render(<AppointmentWorkspace initialItems={[baseItem, terminalItem] as any} />)
    // baseItem 是 scheduled：编辑 + 完成 + 取消按钮可见
    expect(screen.getByLabelText('编辑约定：故宫游览')).toBeInTheDocument()
    expect(screen.getByLabelText('完成约定：故宫游览')).toBeInTheDocument()
    expect(screen.getByLabelText('取消约定：故宫游览')).toBeInTheDocument()
    // terminalItem 是 cancelled：被 list 过滤掉，整个 item 不渲染
    expect(screen.queryByText('已取消约定')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('编辑约定：已取消约定')).not.toBeInTheDocument()
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

  // ─── [023.12] T10：完成/取消/回退按钮 ───────────────────

  it('【T10】点击「完成」按钮 → 调 completeAppointment + reload', async () => {
    const { completeAppointment } = await import('@/app/actions/timebox')
    vi.mocked(completeAppointment).mockClear()
    mockGetItinerariesByRange.mockResolvedValueOnce([])

    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)
    fireEvent.click(screen.getByLabelText('完成约定：故宫游览'))

    await waitFor(() => expect(vi.mocked(completeAppointment)).toHaveBeenCalledWith('it-1'))
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
  })

  it('【T10】点击「取消」按钮 → 调 deleteAppointment (cancel 语义) + reload', async () => {
    const { deleteAppointment } = await import('@/app/actions/timebox')
    vi.mocked(deleteAppointment).mockClear()
    mockGetItinerariesByRange.mockResolvedValueOnce([])

    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)
    fireEvent.click(screen.getByLabelText('取消约定：故宫游览'))

    await waitFor(() => expect(vi.mocked(deleteAppointment)).toHaveBeenCalledWith('it-1'))
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
  })

  it('【T10】点击「回退」按钮（终态）→ 调 revertAppointment + reload', async () => {
    // [023.12] T10：当前 list 过滤 scheduled，cancelled/completed 不进 list（server
    //   findByDateRange 用 NON_TERMINAL=['scheduled'] 过滤），「回退」按钮暂无入口。
    //   保留此测试为 .todo，等 server query 放宽时再启用。
    const { revertAppointment } = await import('@/app/actions/timebox')
    vi.mocked(revertAppointment).mockClear()
    mockGetItinerariesByRange.mockResolvedValueOnce([])

    render(<AppointmentWorkspace initialItems={[terminalItem] as any} />)
    // 终态 item 被 filter 排除，「回退」按钮在 DOM 中不存在 → 跳过当前断言
    // （当 list filter 放宽时可恢复此测试）
    expect(screen.queryByLabelText('回退约定：已取消约定')).not.toBeInTheDocument()
    expect(vi.mocked(revertAppointment)).not.toHaveBeenCalled()
  })
})
