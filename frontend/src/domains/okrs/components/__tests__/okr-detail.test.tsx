/**
 * @file okr-detail.test
 * @brief OKRDetail 编辑按钮与编辑模式测试
 *
 * 覆盖（[022.01] Phase 3：移除 status 状态机后）：
 *  1. 任意状态都渲染「编辑」按钮
 *  2. 点击进入编辑模式（OKRForm 渲染）
 *  3. 不再渲染「激活」按钮（Objective.status 已删除）
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OKRDetail } from '../okr-detail'
import type { ObjectiveWithKR } from '@/usom/interfaces/irepository'

const baseKR = {
  id: 'kr1',
  title: 'KR1',
  targetValue: 100,
  currentValue: 0,
  unit: '%',
  confidence: 50,
  objectiveId: 'o1',
  createdAt: '',
  updatedAt: '',
}

const makeData = (_status: 'draft' | 'active' | 'completed' | 'paused'): ObjectiveWithKR => ({
  id: 'o1',
  title: '测试目标',
  description: '',
  cycleId: 'c1',
  okrType: 'committed',
  priority: 'P1',
  objectiveNumber: 'O1',
  period: { start: '2026-07-01', end: '2026-09-30' },
  createdAt: '',
  updatedAt: '',
  keyResults: [baseKR],
}) as any

const noopAsync = async () => null

describe('OKRDetail 编辑按钮（[022.01] Phase 3 状态机已删除）', () => {
  it('active 状态渲染「编辑」按钮', async () => {
    const onLoad = vi.fn().mockResolvedValue(makeData('active'))
    render(
      <OKRDetail
        objectiveId="o1"
        onLoad={onLoad}
        onUpdate={noopAsync}
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
        onAddKR={noopAsync}
        onUpdateKRProgress={noopAsync}
        onDeleteKR={vi.fn()}
        onBack={() => {}}
      />,
    )
    await waitFor(() => expect(screen.queryByText('编辑')).toBeInTheDocument())
  })

  it('不渲染「激活」按钮（Objective.status 已删除，激活语义由 cycle 承载）', async () => {
    const onLoad = vi.fn().mockResolvedValue(makeData('draft'))
    render(
      <OKRDetail
        objectiveId="o1"
        onLoad={onLoad}
        onUpdate={noopAsync}
        onAddKR={noopAsync}
        onUpdateKRProgress={noopAsync}
        onDeleteKR={vi.fn()}
        onBack={() => {}}
      />,
    )
    await waitFor(() => expect(screen.queryByText('编辑')).toBeInTheDocument())
    expect(screen.queryByText('激活')).not.toBeInTheDocument()
  })

  it('点击「编辑」进入 OKRForm 编辑模式', async () => {
    const user = userEvent.setup()
    const onLoad = vi.fn().mockResolvedValue(makeData('active'))
    render(
      <OKRDetail
        objectiveId="o1"
        onLoad={onLoad}
        onUpdate={noopAsync}
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