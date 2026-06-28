/**
 * @file okr-directory.test
 * @brief [024] T12 OKRDirectory 二级树（周期-目标）测试
 *
 * 覆盖：
 *  1. 按周期分组渲染目标（周期名 + 目标标题）
 *  2. 目标 active 状态 ⋯ 菜单含 暂停/完成/废弃
 *  3. 空周期显示且 ⋯ 菜单含 添加目标/删除周期
 *
 * 备注：Radix DropdownMenu 需要 userEvent 触发 pointerdown/pointerup
 * 才能展开菜单，因此使用 @testing-library/user-event（项目惯例）。
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OKRDirectory } from '../okr-directory'

const cycles = [{ id: 'c1', name: '2026 Q3', period: { start: '2026-07-01', end: '2026-09-30' } }] as any
const objectives = [{ id: 'o1', title: '提升质量', cycleId: 'c1', status: 'active', objectiveNumber: 'O1' }] as any

describe('[024] OKRDirectory 二级树', () => {
  it('按周期分组渲染目标', () => {
    render(<OKRDirectory cycles={cycles} objectives={objectives} statusFilter="all" onStatusFilterChange={() => {}} onSelect={() => {}} selectedId={null} />)
    expect(screen.getByText('2026 Q3')).toBeInTheDocument()
    expect(screen.getByText('提升质量')).toBeInTheDocument()
  })
  it('目标 active 状态 ⋯ 菜单含 暂停/完成/废弃', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<OKRDirectory cycles={cycles} objectives={objectives} statusFilter="all" onStatusFilterChange={() => {}} onSelect={() => {}} selectedId={null} onChangeObjectiveStatus={onChange} />)
    // hover/点击目标行的 ⋯ 触发菜单
    await user.click(screen.getAllByLabelText('目标操作')[0])
    expect(screen.getByText('暂停')).toBeInTheDocument()
    expect(screen.getByText('完成')).toBeInTheDocument()
    expect(screen.getByText('废弃')).toBeInTheDocument()
  })
  it('空周期显示且 ⋯ 含 添加目标/删除周期', async () => {
    const user = userEvent.setup()
    render(<OKRDirectory cycles={[...cycles, { id: 'c2', name: '2026 Q4', period: { start: '2026-10-01', end: '2026-12-31' } }] as any} objectives={objectives} statusFilter="all" onStatusFilterChange={() => {}} onSelect={() => {}} selectedId={null} onAddObjectiveToCycle={vi.fn()} onDeleteCycle={vi.fn()} />)
    await user.click(screen.getAllByLabelText('周期操作')[1])
    expect(screen.getByText('添加目标')).toBeInTheDocument()
    expect(screen.getByText('删除周期')).toBeInTheDocument()
  })
})

/**
 * [024.1] T1：周期折叠
 *  - 默认：含 active 目标的周期展开；其他收起
 *  - 点击 ChevronDown/Right 切换折叠
 *  - 收起时其下目标不渲染（不占 DOM）
 */
describe('[024.1] OKRDirectory 周期折叠', () => {
  const activeObj = { id: 'o1', title: '进行中目标', cycleId: 'c1', status: 'active', objectiveNumber: 'O1' } as any
  const completedObj = { id: 'o2', title: '已完成目标', cycleId: 'c2', status: 'completed', objectiveNumber: 'O2' } as any
  const c1 = { id: 'c1', name: '含进行中周期', period: { start: '2026-07-01', end: '2026-09-30' } } as any
  const c2 = { id: 'c2', name: '仅已完成周期', period: { start: '2026-04-01', end: '2026-06-30' } } as any

  it('默认 active 周期展开、无 active 周期收起', () => {
    render(
      <OKRDirectory
        cycles={[c1, c2]}
        objectives={[activeObj, completedObj]}
        statusFilter="all"
        onStatusFilterChange={() => {}}
        onSelect={() => {}}
        selectedId={null}
      />,
    )
    // active 周期展开：能看到「进行中目标」
    expect(screen.getByText('进行中目标')).toBeInTheDocument()
    // 但「已完成目标」所在周期默认收起，看不到标题
    expect(screen.queryByText('已完成目标')).not.toBeInTheDocument()
  })

  it('点击收起按钮可折叠 active 周期', async () => {
    const user = userEvent.setup()
    render(
      <OKRDirectory
        cycles={[c1]}
        objectives={[activeObj]}
        statusFilter="all"
        onStatusFilterChange={() => {}}
        onSelect={() => {}}
        selectedId={null}
      />,
    )
    expect(screen.getByText('进行中目标')).toBeInTheDocument()
    await user.click(screen.getByLabelText('收起周期'))
    expect(screen.queryByText('进行中目标')).not.toBeInTheDocument()
    expect(screen.getByLabelText('展开周期')).toBeInTheDocument()
  })

  it('点击展开按钮可展开收起周期', async () => {
    const user = userEvent.setup()
    render(
      <OKRDirectory
        cycles={[c2]}
        objectives={[completedObj]}
        statusFilter="all"
        onStatusFilterChange={() => {}}
        onSelect={() => {}}
        selectedId={null}
      />,
    )
    expect(screen.queryByText('已完成目标')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('展开周期'))
    expect(screen.getByText('已完成目标')).toBeInTheDocument()
    expect(screen.getByLabelText('收起周期')).toBeInTheDocument()
  })
})
