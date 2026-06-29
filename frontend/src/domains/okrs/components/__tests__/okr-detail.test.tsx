/**
 * @file okr-detail.test
 * @brief [024.1] T4 测试 — OKRDetail 编辑按钮在 active 状态可见
 *
 * 覆盖：
 *  1. active 状态渲染「编辑」按钮（[024.1] 放宽限制）
 *  2. 点击进入编辑模式（OKRForm 渲染）
 *  3. draft 状态仍然显示「编辑」按钮（向后兼容）
 *  4. completed 状态不显示「编辑」按钮（终态不可编辑）
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OKRDetail } from '../okr-detail'
import type { ObjectiveWithKR } from '@/usom/types/objects'

const baseKR = {
  id: 'kr1',
  title: 'KR1',
  targetValue: 100,
  currentValue: 0,
  unit: '%',
  confidence: 50,
  status: 'draft',
  objectiveId: 'o1',
  createdAt: '',
  updatedAt: '',
}

const makeData = (status: 'draft' | 'active' | 'completed' | 'paused'): ObjectiveWithKR => ({
  id: 'o1',
  title: '测试目标',
  description: '',
  cycleId: 'c1',
  okrType: 'committed',
  priority: 'P1',
  status,
  objectiveNumber: 'O1',
  period: { start: '2026-07-01', end: '2026-09-30' },
  createdAt: '',
  updatedAt: '',
  keyResults: [baseKR],
}) as any

const noopAsync = async () => null

describe('[024.1] OKRDetail 编辑按钮', () => {
  it('active 状态渲染「编辑」按钮', async () => {
    const onLoad = vi.fn().mockResolvedValue(makeData('active'))
    render(
      <OKRDetail
        objectiveId="o1"
        onLoad={onLoad}
        onUpdate={noopAsync}
        onActivate={noopAsync}
        onChangeStatus={noopAsync}
        onAddKR={noopAsync}
        onUpdateKRProgress={noopAsync}
        onDeleteKR={vi.fn()}
        onBack={() => {}}
      />,
    )
    await waitFor(() => expect(screen.queryByText('编辑')).toBeInTheDocument())
  })

  it('draft 状态渲染「编辑」按钮（向后兼容）', async () => {
    const onLoad = vi.fn().mockResolvedValue(makeData('draft'))
    render(
      <OKRDetail
        objectiveId="o1"
        onLoad={onLoad}
        onUpdate={noopAsync}
        onActivate={noopAsync}
        onChangeStatus={noopAsync}
        onAddKR={noopAsync}
        onUpdateKRProgress={noopAsync}
        onDeleteKR={vi.fn()}
        onBack={() => {}}
      />,
    )
    await waitFor(() => expect(screen.queryByText('编辑')).toBeInTheDocument())
  })

  it('completed 状态不渲染「编辑」按钮（终态不可编辑）', async () => {
    const onLoad = vi.fn().mockResolvedValue(makeData('completed'))
    render(
      <OKRDetail
        objectiveId="o1"
        onLoad={onLoad}
        onUpdate={noopAsync}
        onActivate={noopAsync}
        onChangeStatus={noopAsync}
        onAddKR={noopAsync}
        onUpdateKRProgress={noopAsync}
        onDeleteKR={vi.fn()}
        onBack={() => {}}
      />,
    )
    await waitFor(() => expect(screen.queryByText('激活')).not.toBeInTheDocument())
    expect(screen.queryByText('编辑')).not.toBeInTheDocument()
  })

  it('点击「编辑」进入 OKRForm 编辑模式', async () => {
    const user = userEvent.setup()
    const onLoad = vi.fn().mockResolvedValue(makeData('active'))
    render(
      <OKRDetail
        objectiveId="o1"
        onLoad={onLoad}
        onUpdate={noopAsync}
        onActivate={noopAsync}
        onChangeStatus={noopAsync}
        onAddKR={noopAsync}
        onUpdateKRProgress={noopAsync}
        onDeleteKR={vi.fn()}
        onBack={() => {}}
      />,
    )
    await waitFor(() => expect(screen.queryByText('编辑')).toBeInTheDocument())
    await user.click(screen.getByText('编辑'))
    // 编辑模式下 OKRForm 渲染 — 标题输入框应出现
    await waitFor(() => expect(screen.queryByDisplayValue('测试目标')).toBeInTheDocument())
  })
})