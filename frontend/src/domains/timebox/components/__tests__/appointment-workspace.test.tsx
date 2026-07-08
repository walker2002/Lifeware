/**
 * @file appointment-workspace.test.tsx
 * @brief [026] AppointmentWorkspace 单测 / [023.12] T10 完成/取消/回退按钮 /
 *        [026.02] T9 — 整合测试（视图状态 + 视图分发）
 *
 * 守护以下行为不被回归：
 *  - Drawer 功能（创建 / 编辑 / 完成 / 取消 / 删除选中）必须继续工作
 *  - 多选删除后必须触发 reload()
 *  - reload 异常时显示 toast（不会把脏状态留在屏幕上）
 *  - 【编辑入口】编辑按钮 / 双击 / 键盘 Enter 都触发 EditAppointmentDrawer
 *  - 【编辑入口】保存修改后调 updateAppointment + reload
 *
 * [026.02] T9 整合：
 *  - 渲染 PageBanner + ViewToggle + FilterBar
 *  - 默认 viewMode=day, 渲染 DayView（data-day-list + data-day-calendar）
 *  - 点击月按钮切到 MonthView（42 个 gridcell）
 *  - MonthView 点日期切回 DayView 并设 selectedDate
 *  - status 筛选联动 DayView 列表
 */

// jsdom 缺失 Pointer Capture / scrollIntoView API, Radix Select 触发时会抛错。
// shim 仅在测试环境生效, 不影响生产代码。
if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.setPointerCapture = () => {}
}
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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
// 默认返回空数组 — reload() 触发时 items 一定存在，避免 filterAppointments(undefined) 崩
const mockGetItinerariesByRange = vi.fn().mockResolvedValue([])

vi.mock('@/app/actions/intent', () => ({
  getAppointmentsByRange: (...args: unknown[]) => mockGetItinerariesByRange(...args),
}))

import { AppointmentWorkspace } from '@/domains/timebox/components/appointment-workspace'
import {
  createAppointment,
  deleteAppointment,
  updateAppointment,
  completeAppointment,
  revertAppointment,
} from '@/app/actions/timebox'

// 锁定系统时间到 currentDate，使 default filterRange（本月）+ selectedDate（今天）
// 落在可预测窗口；避免真实时间漂移导致本月范围漂出 7 月 → 测试数据落空。
// 与 appointment-mini-calendar.test.tsx 同款抗漂移策略（IRON RULE 同源）。
const currentDate = new Date('2026-07-15T12:00:00Z')
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(currentDate)
})
afterAll(() => {
  vi.useRealTimers()
})

// 含 detail/people（user 选了「扩 AppointmentSummary」方案 [026] 编辑入口）
const baseItem = {
  id: 'it-1',
  title: '故宫游览',
  // 当月 (07-15) + 14:00Z > now 12:00Z → 未来，落在本月 filterRange 内
  startTime: '2026-07-15T14:00:00.000Z',
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

// 集成测试 fixture：mk 生成 fixture items（status 类型放宽到 3 态，方便 status 筛选测试）
const mk = (overrides: Partial<typeof baseItem> = {}) => ({
  id: 'a-' + Math.random(),
  title: '测试',
  startTime: '2026-07-15T10:00:00.000Z',
  durationMin: 60,
  status: 'scheduled' as typeof baseItem.status | 'completed' | 'cancelled',
  ...overrides,
})

describe('[026] AppointmentWorkspace', () => {
  beforeEach(() => {
    vi.mocked(createAppointment).mockClear()
    vi.mocked(deleteAppointment).mockClear()
    vi.mocked(updateAppointment).mockClear()
    vi.mocked(completeAppointment).mockClear()
    vi.mocked(revertAppointment).mockClear()
    // [026.02] T9.6: mockReset 清掉默认返回 → reload() 后 setItems(undefined)
    // → useMemo filterAppointments(undefined) 抛 'Cannot read properties of
    // undefined' (5 个 unhandled React render 异常)。reset 后必须重新设默认
    // 返回 []；测试用 mockResolvedValueOnce 覆盖的下一次 reload 不受影响
    // (once-only 优先级 > 默认 resolvedValue)。
    mockGetItinerariesByRange.mockReset()
    mockGetItinerariesByRange.mockResolvedValue([])
  })

  it('初始列表渲染初始 appointment（DayView 左列表显示）', () => {
    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)
    expect(screen.getByText('故宫游览')).toBeInTheDocument()
    expect(screen.getByText(/分钟$/)).toBeInTheDocument()
    // 多选删除条不显示（selected 为空）
    expect(screen.queryByText(/删除选中/)).not.toBeInTheDocument()
  })

  it('空列表显示 DayView EmptyState「该日无约定」', () => {
    render(<AppointmentWorkspace initialItems={[]} />)
    expect(screen.getByText(/该日无约定/)).toBeInTheDocument()
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

  // ─── [026.02] T9 整合测试：视图状态 + 视图分发 ─────────────────

  it('渲染 PageBanner + ViewToggle + FilterBar', () => {
    render(<AppointmentWorkspace initialItems={[]} />)
    // PageBanner 显示 title="约定管理"
    expect(screen.getByText('约定管理')).toBeInTheDocument()
    // ViewToggle group
    expect(screen.getByRole('group', { name: /视图模式/ })).toBeInTheDocument()
    // FilterBar status select
    expect(screen.getByRole('combobox', { name: /状态/ })).toBeInTheDocument()
  })

  it('默认 viewMode=day, 渲染 DayView', () => {
    const { container } = render(<AppointmentWorkspace initialItems={[mk()]} />)
    expect(container.querySelector('[data-day-list]')).toBeInTheDocument()
    expect(container.querySelector('[data-day-calendar]')).toBeInTheDocument()
  })

  it('点击月按钮切到 MonthView', async () => {
    const user = userEvent.setup()
    const { container } = render(<AppointmentWorkspace initialItems={[mk()]} />)
    await user.click(screen.getByRole('button', { name: /月视图/ }))
    // 切到月视图后, 不再有 day-list/day-calendar, 改用 grid
    expect(container.querySelector('[data-day-list]')).toBeNull()
    expect(container.querySelectorAll('[role="gridcell"]').length).toBe(42)
  })

  it('MonthView 点日期切回 DayView 并设 selectedDate', async () => {
    const user = userEvent.setup()
    const items = [mk({ id: '1', startTime: '2026-07-15T10:00:00.000Z' })]
    const { container } = render(<AppointmentWorkspace initialItems={items} />)
    await user.click(screen.getByRole('button', { name: /月视图/ }))
    // 在 MonthView 点击 15 号
    const day15 = container.querySelector('[data-day-cell="2026-07-15"]') as HTMLElement
    expect(day15).toBeInTheDocument()
    await user.click(day15)
    // 切回日视图
    expect(container.querySelector('[data-day-list]')).toBeInTheDocument()
  })

  it('status 筛选联动 DayView 列表', async () => {
    const user = userEvent.setup()
    const items = [
      mk({ id: '1', title: '计划约定', status: 'scheduled' }),
      mk({ id: '2', title: '已完成约定', status: 'completed' }),
    ]
    render(<AppointmentWorkspace initialItems={items} />)
    // shadcn Select = Radix UI，无原生 <select>；点击 trigger → 点 option
    await user.click(screen.getByRole('combobox', { name: /状态/ }))
    await user.click(screen.getByRole('option', { name: '已完成' }))
    // status=completed 只显示「已完成约定」; filterRange 默认本月 → 07-15 在内
    expect(screen.queryByText('计划约定')).not.toBeInTheDocument()
    expect(screen.getByText('已完成约定')).toBeInTheDocument()
  })

  // ─── [026.02] T9.5 修复：per-item 动作 + multi-select ─────────────────

  it('点击 item 触发 selected toggle（aria-pressed 切换）', () => {
    const { container } = render(<AppointmentWorkspace initialItems={[baseItem] as any} />)
    const wrapper = container.querySelector(`[data-day-item="${baseItem.id}"]`) as HTMLElement
    expect(wrapper.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(wrapper)
    expect(wrapper.getAttribute('aria-pressed')).toBe('true')
  })

  it('selected.size > 0 时显示「删除选中」入口', async () => {
    const user = userEvent.setup()
    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)
    // 初始不显示
    expect(screen.queryByText(/删除选中/)).not.toBeInTheDocument()
    // 选中 item
    const wrapper = screen.getByLabelText(`约定：${baseItem.title}`)
    await user.click(wrapper)
    // 显示「删除选中（1）」
    expect(screen.getByText(/删除选中/)).toBeInTheDocument()
  })

  it('点击「删除选中」触发 deleteAppointment server action + reload', async () => {
    const user = userEvent.setup()
    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)
    // 选中
    await user.click(screen.getByLabelText(`约定：${baseItem.title}`))
    // 点击删除
    const deleteBtn = screen.getByText(/删除选中/)
    await user.click(deleteBtn)
    await waitFor(() => expect(vi.mocked(deleteAppointment)).toHaveBeenCalledWith(baseItem.id))
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
  })

  it('点击完成按钮触发 completeAppointment + reload', async () => {
    const user = userEvent.setup()
    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)
    await user.click(screen.getByLabelText(`完成约定：${baseItem.title}`))
    await waitFor(() => expect(vi.mocked(completeAppointment)).toHaveBeenCalledWith(baseItem.id))
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
  })

  it('点击取消按钮触发 deleteAppointment (cancel 语义) + reload', async () => {
    const user = userEvent.setup()
    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)
    await user.click(screen.getByLabelText(`取消约定：${baseItem.title}`))
    await waitFor(() => expect(vi.mocked(deleteAppointment)).toHaveBeenCalledWith(baseItem.id))
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
  })

  it('点击回退按钮触发 revertAppointment + reload（cancelled item）', async () => {
    const user = userEvent.setup()
    render(<AppointmentWorkspace initialItems={[terminalItem] as any} />)
    await user.click(screen.getByLabelText(`回退约定：${terminalItem.title}`))
    await waitFor(() => expect(vi.mocked(revertAppointment)).toHaveBeenCalledWith(terminalItem.id))
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
  })

  it('点击编辑按钮打开 EditAppointmentDrawer', async () => {
    const user = userEvent.setup()
    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)
    await user.click(screen.getByLabelText(`编辑约定：${baseItem.title}`))
    // 编辑 drawer 显示「保存修改」按钮（与新建「保存约定」按钮区分）
    expect(screen.getByText('保存修改')).toBeInTheDocument()
  })

  it('编辑 Drawer 保存修改触发 updateAppointment + reload', async () => {
    const user = userEvent.setup()
    render(<AppointmentWorkspace initialItems={[baseItem] as any} />)
    await user.click(screen.getByLabelText(`编辑约定：${baseItem.title}`))
    // 标题已填（来自 target），直接保存
    await user.click(screen.getByText('保存修改'))
    await waitFor(() => expect(vi.mocked(updateAppointment)).toHaveBeenCalledWith(
      baseItem.id,
      expect.objectContaining({ title: baseItem.title }),
    ))
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
  })

  it('scheduled item 只在 status=scheduled 时显示编辑/完成/取消按钮', () => {
    render(<AppointmentWorkspace initialItems={[terminalItem] as any} />)
    // 终态 item 不显示这些按钮
    expect(screen.queryByLabelText(`编辑约定：${terminalItem.title}`)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(`完成约定：${terminalItem.title}`)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(`取消约定：${terminalItem.title}`)).not.toBeInTheDocument()
    // 但回退按钮显示
    expect(screen.getByLabelText(`回退约定：${terminalItem.title}`)).toBeInTheDocument()
  })
})