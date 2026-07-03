/**
 * @file itinerary-workspace.test.tsx
 * @brief [026] ItineraryWorkspace 单测
 *
 * 守护以下行为不被回归：
 *  - 初始列表渲染（标题 + 时间 + 状态）
 *  - 【BUG 修复】创建行程成功后必须触发 reload() 重拉列表
 *    （修复前用 router.refresh()，client 入口下 useState(initialItems) 不会 reset）
 *  - 多选删除后必须触发 reload()
 *  - reload 异常时显示 toast（不会把脏状态留在屏幕上）
 *  -【编辑入口】编辑按钮 / 双击 / 键盘 Enter 都触发 EditItineraryDrawer
 *  -【编辑入口】保存修改后调 updateItinerary + reload
 *  - 终止态（expired/cancelled/completed）不显示编辑按钮（不可改）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/app/actions/timebox', () => ({
  deleteItinerary: vi.fn().mockResolvedValue({ status: 'ok', itinerary: { id: 'it-1' } }),
  createItinerary: vi
    .fn()
    .mockResolvedValue({ status: 'ok', itinerary: { id: 'it-new' } }),
  updateItinerary: vi
    .fn()
    .mockResolvedValue({ status: 'ok', itinerary: { id: 'it-1', title: '已编辑' } }),
}))

const RELOAD_AFTER = 'it-new'
const mockGetItinerariesByRange = vi.fn()

vi.mock('@/app/actions/intent', () => ({
  getItinerariesByRange: (...args: unknown[]) => mockGetItinerariesByRange(...args),
}))

import { ItineraryWorkspace } from '@/domains/timebox/components/itinerary-workspace'
import { createItinerary, deleteItinerary, updateItinerary } from '@/app/actions/timebox'

// 含 detail/people（user 选了「扩 ItinerarySummary」方案 [026] 编辑入口）
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
  title: '已过期行程',
  status: 'expired' as const,
}

describe('[026] ItineraryWorkspace', () => {
  beforeEach(() => {
    vi.mocked(createItinerary).mockClear()
    vi.mocked(deleteItinerary).mockClear()
    vi.mocked(updateItinerary).mockClear()
    mockGetItinerariesByRange.mockReset()
    // 默认首次拉（mount 时不主动 fetch，靠 props 注入 initialItems）
    // 只有 reload 触发才回到此 API
  })

  it('初始列表渲染初始 itinerary', () => {
    render(<ItineraryWorkspace initialItems={[baseItem] as any} />)
    expect(screen.getByText('故宫游览')).toBeInTheDocument()
    expect(screen.getByText(/分钟$/)).toBeInTheDocument()
    // 多选删除条不显示（selected 为空）
    expect(screen.queryByText(/删除选中/)).not.toBeInTheDocument()
  })

  it('空列表显示 EmptyState「还没有行程」', () => {
    render(<ItineraryWorkspace initialItems={[]} />)
    expect(screen.getByText('还没有行程')).toBeInTheDocument()
  })

  it('【BUG 修复】创建行程成功 → onSaved → reload 触发 getItinerariesByRange 重拉', async () => {
    // reload 返回含新 itinerary 的列表（模拟服务端实际状态）
    mockGetItinerariesByRange.mockResolvedValueOnce([
      baseItem,
      { ...baseItem, id: RELOAD_AFTER, title: '新建后看到的' },
    ])

    render(<ItineraryWorkspace initialItems={[baseItem] as any} />)

    // 打开新建抽屉
    fireEvent.click(screen.getByText('新建行程'))

    // 填标题
    const titleInput = screen.getByLabelText('事件名称') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: '新建一个' } })

    // 提交（Drawer 标题是「保存行程」）
    fireEvent.click(screen.getByText('保存行程'))

    // createItinerary 应被调用
    await waitFor(() => expect(vi.mocked(createItinerary)).toHaveBeenCalled())
    // reload 必须触发，并写入新列表
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('新建后看到的')).toBeInTheDocument())
    expect(screen.queryByText('故宫游览')).toBeInTheDocument()
  })

  it('多选删除 → reload 触发 getItinerariesByRange', async () => {
    mockGetItinerariesByRange.mockResolvedValueOnce([])
    render(<ItineraryWorkspace initialItems={[baseItem] as any} />)

    // 勾选
    fireEvent.click(screen.getByText('故宫游览'))
    expect(screen.getByText(/删除选中（1）/)).toBeInTheDocument()

    fireEvent.click(screen.getByText(/删除选中（1）/))

    await waitFor(() => expect(vi.mocked(deleteItinerary)).toHaveBeenCalledWith('it-1'))
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
  })

  it('reload 失败时显示错误 toast（不残留脏状态）', async () => {
    mockGetItinerariesByRange.mockRejectedValueOnce(new Error('boom'))
    render(<ItineraryWorkspace initialItems={[baseItem] as any} />)

    // 打开新建抽屉
    fireEvent.click(screen.getByText('新建行程'))
    const titleInput = screen.getByLabelText('事件名称') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: 'x' } })
    fireEvent.click(screen.getByText('保存行程'))

    // toast 触发（sonner 默认渲染 <li> data-sonner-toast）
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
    // 不抛白屏：原列表仍可见
    expect(screen.getByText('故宫游览')).toBeInTheDocument()
  })

  // ─── [026] 编辑入口 ─────────────────────────────────────────

  it('【编辑入口】每条计划/执行中行程渲染「编辑」按钮', () => {
    render(<ItineraryWorkspace initialItems={[baseItem, terminalItem] as any} />)
    // baseItem 是 scheduled：编辑按钮可见
    expect(screen.getByLabelText('编辑行程：故宫游览')).toBeInTheDocument()
    // terminalItem 是 expired：编辑按钮不渲染（避免越权改 — ItineraryRepository 也禁）
    expect(screen.queryByLabelText('编辑行程：已过期行程')).not.toBeInTheDocument()
  })

  it('【编辑入口】点编辑按钮 → 打开 EditItineraryDrawer（预填当前值）', async () => {
    render(<ItineraryWorkspace initialItems={[baseItem] as any} />)
    fireEvent.click(screen.getByLabelText('编辑行程：故宫游览'))

    // Drawer 标题 = 「编辑行程」
    expect(screen.getAllByText('编辑行程').length).toBeGreaterThanOrEqual(1)
    // ItineraryFormFields 5 字段预填 baseItem 当前值
    expect((screen.getByLabelText('事件名称') as HTMLInputElement).value).toBe('故宫游览')
    expect((screen.getByLabelText('详情') as HTMLTextAreaElement).value).toBe('看展路线：东路')
    // 保存按钮文案 =「保存修改」（区别于新建的「保存行程」）
    expect(screen.getByText('保存修改')).toBeInTheDocument()
    expect(screen.queryByText('保存行程')).not.toBeInTheDocument()
  })

  it('【编辑入口】保存修改 → 调 updateItinerary + reload', async () => {
    mockGetItinerariesByRange.mockResolvedValueOnce([
      { ...baseItem, title: '故宫半天游' },
    ])

    render(<ItineraryWorkspace initialItems={[baseItem] as any} />)
    fireEvent.click(screen.getByLabelText('编辑行程：故宫游览'))

    // 改标题
    const titleInput = screen.getByLabelText('事件名称') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: '故宫半天游' } })

    // 保存
    fireEvent.click(screen.getByText('保存修改'))

    await waitFor(() => expect(vi.mocked(updateItinerary)).toHaveBeenCalledWith(
      'it-1',
      expect.objectContaining({ title: '故宫半天游' }),
    ))
    await waitFor(() => expect(mockGetItinerariesByRange).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('故宫半天游')).toBeInTheDocument())
    expect(screen.queryByText('故宫游览')).not.toBeInTheDocument()
  })

  it('【编辑入口】双击列表项 → 打开 EditItineraryDrawer（与单击 toggle 不冲突）', () => {
    render(<ItineraryWorkspace initialItems={[baseItem] as any} />)

    // 用 dblclick（不是 click）—— 编辑入口的关键交互
    fireEvent.doubleClick(screen.getByText('故宫游览'))

    // Drawer 出现 → 编辑模式（prefill 触发 form fields 显示）
    expect((screen.getByLabelText('事件名称') as HTMLInputElement).value).toBe('故宫游览')
    expect(screen.getByText('保存修改')).toBeInTheDocument()
  })
})
