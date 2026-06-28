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
