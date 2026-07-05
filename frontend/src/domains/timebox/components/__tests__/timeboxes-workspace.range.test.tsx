/**
 * @file timeboxes-workspace.range.test
 * @brief [023.06] T1: getDateRange 按模式返回正确日期范围（与 hooks/use-timebox.ts 同源）
 *              [023.06] T2: TimeboxesWorkspace 渲染 <DateNav> 视图模式切换器（3 mode 按钮 + 切换触发重新加载）
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// [023.06] T1：纯函数单测，测试文件紧贴 workspace
import { getDateRange, TimeboxesWorkspace } from '../timeboxes-workspace'

describe('[023.06] getDateRange', () => {
  it('day 模式 → startOfDay ~ endOfDay（00:00:00 ~ 23:59:59.999）', () => {
    const d = new Date('2026-07-05T12:00:00Z')
    const { start, end } = getDateRange('day', d)
    expect(start.getHours()).toBe(0)
    expect(end.getHours()).toBe(23)
    expect(end.getMilliseconds()).toBeGreaterThan(990)
  })

  it('week 模式 → 周一到周日 (weekStartsOn: 1)', () => {
    const d = new Date('2026-07-05T12:00:00Z') // 周日
    const { start, end } = getDateRange('week', d)
    expect(start.getDay()).toBe(1)
    expect(end.getDay()).toBe(0)
  })

  it('month 模式 → 1 号 ~ 月末', () => {
    const d = new Date('2026-07-05')
    const { start, end } = getDateRange('month', d)
    expect(start.getDate()).toBe(1)
    expect(end.getMonth()).toBe(6) // 0-indexed: 6 = July
  })
})

// ---------- [023.06] T2：视图模式切换器（fail → pass 链）----------

const getTimeboxesByRangeMock = vi.fn().mockResolvedValue([])
const getItinerariesByRangeMock = vi.fn().mockResolvedValue([])

vi.mock('@/app/actions/intent', () => ({
  getTimeboxesByRange: (...a: unknown[]) => getTimeboxesByRangeMock(...a),
  getItinerariesByRange: (...a: unknown[]) => getItinerariesByRangeMock(...a),
}))

vi.mock('@/app/actions/timebox', () => ({
  getTimeboxById: vi.fn(),
  transitionTimebox: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('[023.06] TimeboxesWorkspace 视图模式切换器', () => {
  it('默认渲染三个 mode 按钮（日/周/月）', async () => {
    render(<TimeboxesWorkspace />)
    // 等初次 loadRange 落定（getTimeboxesByRange 至少被调用 1 次）
    await waitFor(() => expect(getTimeboxesByRangeMock.mock.calls.length).toBeGreaterThanOrEqual(1))
    expect(screen.getByRole('button', { name: '日' })).toBeDefined()
    expect(screen.getByRole('button', { name: '周' })).toBeDefined()
    expect(screen.getByRole('button', { name: '月' })).toBeDefined()
  })

  it('点击「周」按钮 → 切到 week mode，getTimeboxesByRange 再次被调且 end.getDay()===0', async () => {
    const user = userEvent.setup()
    render(<TimeboxesWorkspace />)
    // 等初次 loadRange 落定
    await waitFor(() => expect(getTimeboxesByRangeMock.mock.calls.length).toBeGreaterThanOrEqual(1))
    await user.click(screen.getByRole('button', { name: '周' }))
    // [023.06] 验证 getTimeboxesByRange 被以 week 范围再次调用
    await waitFor(() => expect(getTimeboxesByRangeMock.mock.calls.length).toBeGreaterThanOrEqual(2))
    const lastCall = getTimeboxesByRangeMock.mock.calls.at(-1)!
    const [, end] = lastCall as [Date, Date]
    expect(end.getDay()).toBe(0) // week mode end = 周日 (weekStartsOn: 1)
  })
})
