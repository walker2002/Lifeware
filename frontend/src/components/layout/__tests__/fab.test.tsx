/**
 * @file fab.test
 * @brief FAB label 静态断言 — [023-01] /qa CRITICAL regression: Task 8 manifest 同步方案撤回
 *
 * [023-01] /qa ISSUE-001：Task 8 的 `getActionDescription` 同步联动方案
 * 因 registry.ts import chain 拉扯 `manifest-loader/loader.ts` (含 `import fs from 'fs'`)
 * 进入 Client Component bundle，编译失败 500 / 真实 dev server 不可用。
 *
 * /qa 修复回滚 fab.tsx 到 pre-Task-8 状态（硬编码 label '创建时间盒/打卡习惯/新建任务'）；
 * 同步重写本测试为静态 label 断言 + 外部 quickActions prop override 测试，
 * 不再 mock 不存在的 getActionDescription 调用。
 *
 * 真正"manifest 联动"的正确解法（下一轮 /lifeware-neat 或独立 task）：
 * - server component 包装 + 把 label 作为 prop 透传给 FAB（client）
 * - 或 registry.ts 拆 server/client 两份 manifest loader
 *
 * 回归测试（确保 issue 不再发）：
 * 1. 默认 DEFAULT_ACTIONS 显示硬编码「创建时间盒 / 打卡习惯 / 新建任务」
 * 2. 外部 quickActions prop 可覆盖 label
 * 3. 点击动作正确触发 onAction
 * 4. FAB toggle 展开/收起
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Fab } from '../fab'

// Sheet 内部用 Radix UI Dialog，本测试不展开菜单即可；mock 简化
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('FAB 静态 label + 交互（[023-01] /qa ISSUE-001 回归）', () => {
  it('展开后显示硬编码 DEFAULT_ACTIONS 三项 label', async () => {
    const user = userEvent.setup()
    render(<Fab growthContent={<div>g</div>} onAction={vi.fn()} />)

    // 点击 FAB 展开菜单
    await user.click(screen.getByLabelText('打开快捷菜单'))

    // 三个硬编码 label 均渲染
    expect(screen.getByText('创建时间盒')).toBeInTheDocument()
    expect(screen.getByText('打卡习惯')).toBeInTheDocument()
    expect(screen.getByText('新建任务')).toBeInTheDocument()
  })

  it('外部 quickActions prop 可覆盖 label（保持外部注入能力）', async () => {
    const user = userEvent.setup()
    render(
      <Fab
        quickActions={[
          { label: 'Custom Timebox', icon: () => null, domainId: 'timebox', action: 'createTimebox' },
        ]}
        growthContent={<div>g</div>}
        onAction={vi.fn()}
      />,
    )

    await user.click(screen.getByLabelText('打开快捷菜单'))

    expect(screen.getByText('Custom Timebox')).toBeInTheDocument()
    expect(screen.queryByText('创建时间盒')).not.toBeInTheDocument()
  })

  it('点击 action 触发 onAction 并关闭菜单', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()

    render(<Fab growthContent={<div>g</div>} onAction={onAction} />)
    await user.click(screen.getByLabelText('打开快捷菜单'))
    await user.click(screen.getByText('创建时间盒'))

    expect(onAction).toHaveBeenCalledWith('timebox', 'createTimebox')
  })

  it('SSR 安全：初次 render 不抛异常 + 默认折叠', () => {
    render(<Fab growthContent={<div>g</div>} onAction={vi.fn()} />)

    expect(screen.getByLabelText('打开快捷菜单')).toBeInTheDocument()
    // 折叠态：NONE of the action buttons 渲染
    expect(screen.queryByText('创建时间盒')).not.toBeInTheDocument()
  })

  it('FAB toggle：第 1 次点击展开，第 2 次收起', async () => {
    const user = userEvent.setup()
    render(<Fab growthContent={<div>g</div>} onAction={vi.fn()} />)

    // 初始折叠
    expect(screen.queryByText('创建时间盒')).not.toBeInTheDocument()

    // 第 1 次点击
    await user.click(screen.getByLabelText('打开快捷菜单'))
    expect(screen.getByText('创建时间盒')).toBeInTheDocument()

    // 第 2 次点击收起
    await user.click(screen.getByLabelText('关闭快捷菜单'))
    expect(screen.queryByText('创建时间盒')).not.toBeInTheDocument()
  })
})
