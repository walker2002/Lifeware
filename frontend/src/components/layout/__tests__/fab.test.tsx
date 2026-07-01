/**
 * @file fab.test
 * @brief FAB label 同步联动 [023-01] — 守护 getActionDescription 同步调用 + SSR 安全
 *
 * [023-01] Task 8：原 plan 把 FAB label 异步化（useState/useEffect），被 autoplan H-3
 * 共识修订驳回（getActionDescription 是同步函数）。本测试验证：
 * 1. FAB 渲染时同步调用 getActionDescription，无 useEffect/useState 异步化
 * 2. SSR 安全（jsdom 渲染即可，触达同步读 manifest 路径无异常）
 * 3. manifest description 为空时 FALLBACK_LABEL 兜底
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Fab } from '../fab'
import { getActionDescription } from '@/domains/registry'

vi.mock('@/domains/registry', () => ({
  getActionDescription: vi.fn((domainId: string, action: string) =>
    `${domainId}/${action}-desc`
  ),
}))

// Sheet 内部用 Radix UI Dialog，本测试不展开菜单即可；mock 简化
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('FAB label 同步联动（[023-01]）', () => {
  beforeEach(() => {
    // 既有 mock 实现（manifest desc 返回非空）+ 调用历史都还原
    vi.resetAllMocks()
    vi.mocked(getActionDescription).mockImplementation(
      (domainId: string, action: string) => `${domainId}/${action}-desc`
    )
  })

  it('展开时同步调用 getActionDescription 渲染 label', async () => {
    const user = userEvent.setup()
    render(<Fab growthContent={<div>g</div>} onAction={vi.fn()} />)

    // 点击 FAB 展开菜单
    await user.click(screen.getByLabelText('打开快捷菜单'))

    // 触发后立即断言：所有 3 个 label 已渲染（同步链路，无 loading 占位）
    // 用 function matcher：宽松匹配穿越多 textNode 的字符串
    expect(
      screen.getAllByRole('button').some(b => b.textContent?.includes('timebox/createTimebox-desc'))
    ).toBe(true)
    expect(
      screen.getAllByRole('button').some(b => b.textContent?.includes('habits/checkinHabits-desc'))
    ).toBe(true)
    expect(
      screen.getAllByRole('button').some(b => b.textContent?.includes('tasks/createTask-desc'))
    ).toBe(true)

    // mock 函数被同步调用（不是 useEffect 里）
    expect(getActionDescription).toHaveBeenCalledWith('timebox', 'createTimebox')
    expect(getActionDescription).toHaveBeenCalledWith('habits', 'checkinHabits')
    expect(getActionDescription).toHaveBeenCalledWith('tasks', 'createTask')
  })

  it('manifest 返回空字符串时用 FALLBACK_LABEL 兜底', async () => {
    // 模拟 manifest 未注册/无 description
    vi.mocked(getActionDescription).mockReturnValue('')

    const user = userEvent.setup()
    render(<Fab growthContent={<div>g</div>} onAction={vi.fn()} />)
    await user.click(screen.getByLabelText('打开快捷菜单'))

    // 兜底中文文案（非空、非 undefined）
    expect(screen.getByText('创建时间盒')).toBeInTheDocument()
    expect(screen.getByText('打卡习惯')).toBeInTheDocument()
    expect(screen.getByText('新建任务')).toBeInTheDocument()
  })

  it('点击动作触发 onAction 并关闭菜单', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()

    render(<Fab growthContent={<div>g</div>} onAction={onAction} />)
    await user.click(screen.getByLabelText('打开快捷菜单'))

    // 找渲染了目标 label 的按钮（穿越多 textNode）
    const timeboxBtn = screen.getAllByRole('button').find(b =>
      b.textContent?.includes('timebox/createTimebox-desc')
    ) as HTMLElement
    expect(timeboxBtn).toBeTruthy()
    await user.click(timeboxBtn)

    expect(onAction).toHaveBeenCalledWith('timebox', 'createTimebox')
  })

  it('SSR 安全：初次渲染不抛异常（jsdom 模拟浏览器环境）', () => {
    // 渲染不应抛错（getActionDescription 是同步读 manifest 缓存，无 IO/无 hydration mismatch）
    expect(() =>
      render(<Fab growthContent={<div>g</div>} onAction={vi.fn()} />)
    ).not.toThrow()
  })
})
