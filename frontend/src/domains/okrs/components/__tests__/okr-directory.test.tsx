/**
 * @file okr-directory.test
 * @brief [024] T12 OKRDirectory 二级树（周期-目标）测试
 *
 * 覆盖：
 *  1. 按周期分组渲染目标（周期名 + 目标标题）
 *  2. 目标 ⋯ 菜单含「删除目标」（[022.01] Phase 3 简化为仅删除）
 *  3. 空周期显示且 ⋯ 菜单含 添加目标/删除周期
 *
 * 备注：Radix DropdownMenu 需要 userEvent 触发 pointerdown/pointerup
 * 才能展开菜单，因此使用 @testing-library/user-event（项目惯例）。
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OKRDirectory, filterObjectivesByCycleStatus } from '../okr-directory'

import type { Cycle, Objective } from '@/usom/types/objects'

const cycles = [{ id: 'c1', name: '2026 Q3', status: 'in_progress', period: { start: '2026-07-01', end: '2026-09-30' } }] as unknown as Cycle[]
const objectives = [{ id: 'o1', title: '提升质量', cycleId: 'c1', objectiveNumber: 'O1' }] as unknown as Objective[]

describe('[024] OKRDirectory 二级树', () => {
  it('按周期分组渲染目标', () => {
    render(<OKRDirectory cycles={cycles} objectives={objectives} statusFilter="all" onStatusFilterChange={() => {}} onSelect={() => {}} selectedId={null} />)
    expect(screen.getByText('2026 Q3')).toBeInTheDocument()
    expect(screen.getByText('提升质量')).toBeInTheDocument()
  })
  it('目标 ⋯ 菜单含「删除目标」', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(<OKRDirectory cycles={cycles} objectives={objectives} statusFilter="all" onStatusFilterChange={() => {}} onSelect={() => {}} selectedId={null} onDeleteObjective={onDelete} />)
    // hover/点击目标行的 ⋯ 触发菜单
    await user.click(screen.getAllByLabelText('目标操作')[0])
    expect(screen.getByText('删除目标')).toBeInTheDocument()
  })
  it('空周期显示且 ⋯ 含 添加目标/删除周期', async () => {
    const user = userEvent.setup()
    render(<OKRDirectory cycles={[...cycles, { id: 'c2', name: '2026 Q4', status: 'in_progress', period: { start: '2026-10-01', end: '2026-12-31' } } as unknown as Cycle]} objectives={objectives} statusFilter="all" onStatusFilterChange={() => {}} onSelect={() => {}} selectedId={null} onAddObjectiveToCycle={vi.fn()} onDeleteCycle={vi.fn()} />)
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
  const activeObj = { id: 'o1', title: '进行中目标', cycleId: 'c1', objectiveNumber: 'O1' } as unknown as Objective
  const completedObj = { id: 'o2', title: '已完成目标', cycleId: 'c2', objectiveNumber: 'O2' } as unknown as Objective
  const c1 = { id: 'c1', name: '含进行中周期', status: 'in_progress', period: { start: '2026-07-01', end: '2026-09-30' } } as unknown as Cycle
  const c2 = { id: 'c2', name: '仅已完成周期', status: 'reviewed', period: { start: '2026-04-01', end: '2026-06-30' } } as unknown as Cycle
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

/**
 * [022.01] Task 4: 顶部筛选 tabs 改为 Cycle 状态
 *  - 筛选作用于 objective 所属 cycle 的状态，而非 objective 自身状态
 *  - statusFilter="all" → 显示所有 objective
 *  - statusFilter="in_progress" → 只显示 cycle.status==="in_progress" 的 objective
 */
describe('[022.01] OKRDirectory filterObjectivesByCycleStatus 按 cycle 状态筛选', () => {
  const cInProgress = {
    id: 'c1',
    name: '2026 Q3 进行中',
    status: 'in_progress' as const,
    period: { start: '2026-07-01', end: '2026-09-30' },
  } as Cycle
  const cDraft = {
    id: 'c2',
    name: '2026 Q4 草稿',
    status: 'draft' as const,
    period: { start: '2026-10-01', end: '2026-12-31' },
  } as Cycle
  // 注意：objective 的 status 与所属 cycle 的 status 解耦：
  //  - inProgress cycle 下挂一个 active objective + 一个 paused objective
  //  - draft cycle 下挂一个 draft objective
  const objs = [
    { id: 'o1', title: 'Active 目标 (in_progress cycle)', cycleId: 'c1' },
    { id: 'o2', title: 'Paused 目标 (in_progress cycle)', cycleId: 'c1' },
    { id: 'o3', title: 'Draft 目标 (draft cycle)', cycleId: 'c2' },
  ] as unknown as Objective[]
  it('statusFilter="in_progress" → 只显示对应 cycle 下的 objectives（无论 objective 自身 status）', () => {
    const result = filterObjectivesByCycleStatus(objs, [cInProgress, cDraft], 'in_progress')
    expect(result.map((o) => o.id).sort()).toEqual(['o1', 'o2'])
    expect(result.find((o) => o.id === 'o1')).toBeDefined()
    expect(result.find((o) => o.id === 'o2')).toBeDefined()
    expect(result.find((o) => o.id === 'o3')).toBeUndefined()
  })

  it('statusFilter="all" → 显示所有 objectives（所有 cycle 下挂的都包含）', () => {
    const result = filterObjectivesByCycleStatus(objs, [cInProgress, cDraft], 'all')
    expect(result.map((o) => o.id).sort()).toEqual(['o1', 'o2', 'o3'])
  })
})
