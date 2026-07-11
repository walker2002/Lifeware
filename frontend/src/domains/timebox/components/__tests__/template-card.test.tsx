/**
 * @file template-card.test
 * @brief TemplateCard 组件测试（[023-02]）
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TemplateCard } from '../template-card'
import type { TimeboxTemplate } from '@/lib/db/repositories/timebox-template'

const baseTemplate: TimeboxTemplate = {
  id: 't-1',
  userId: 'u-1',
  schemaVersion: 1,
  name: '工作日模板',
  daysOfWeek: [1, 2, 3, 4, 5],
  rows: [
    { id: 'r1', activityName: '起床', defaultStart: '07:00', defaultDuration: 30, source: 'custom' },
    { id: 'r2', activityName: '晨跑', defaultStart: '06:00', defaultDuration: 60, source: 'habit', sourceId: 'h-1' },
  ],
  createdAt: '',
  updatedAt: '',
}

describe('TemplateCard', () => {
  it('应渲染模板名', () => {
    render(<TemplateCard template={baseTemplate} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('工作日模板')).toBeInTheDocument()
  })

  it('应渲染星期 chips（短名）', () => {
    render(<TemplateCard template={baseTemplate} onEdit={vi.fn()} onDelete={vi.fn()} />)
    // daysOfWeek = [1,2,3,4,5] 对应 一二三四五
    expect(screen.getByText('一')).toBeInTheDocument()
    expect(screen.getByText('五')).toBeInTheDocument()
    expect(screen.queryByText('六')).not.toBeInTheDocument()
  })

  it('空 daysOfWeek 应显示「不限」', () => {
    render(
      <TemplateCard
        template={{ ...baseTemplate, daysOfWeek: [] }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('不限')).toBeInTheDocument()
  })

  it('行数 ≤ 4 时应全部展示', () => {
    const t = {
      ...baseTemplate,
      rows: [
        { id: 'a', activityName: 'A', defaultStart: '01:00', defaultDuration: 60, source: 'custom' as const },
        { id: 'b', activityName: 'B', defaultStart: '03:00', defaultDuration: 60, source: 'custom' as const },
      ],
    }
    render(<TemplateCard template={t} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText(/01:00.*A/)).toBeInTheDocument()
    expect(screen.getByText(/03:00.*B/)).toBeInTheDocument()
    expect(screen.queryByText(/还有/)).not.toBeInTheDocument()
  })

  it('行数 > 10 时应截断 + 显示「还有 N 条」', () => {
    const t = {
      ...baseTemplate,
      rows: [
        { id: '1', activityName: 'A', defaultStart: '01:00', defaultDuration: 60, source: 'custom' as const },
        { id: '2', activityName: 'B', defaultStart: '03:00', defaultDuration: 60, source: 'custom' as const },
        { id: '3', activityName: 'C', defaultStart: '05:00', defaultDuration: 60, source: 'custom' as const },
        { id: '4', activityName: 'D', defaultStart: '07:00', defaultDuration: 60, source: 'custom' as const },
        { id: '5', activityName: 'E', defaultStart: '09:00', defaultDuration: 60, source: 'custom' as const },
        { id: '6', activityName: 'F', defaultStart: '11:00', defaultDuration: 60, source: 'custom' as const },
        { id: '7', activityName: 'G', defaultStart: '13:00', defaultDuration: 60, source: 'custom' as const },
        { id: '8', activityName: 'H', defaultStart: '15:00', defaultDuration: 60, source: 'custom' as const },
        { id: '9', activityName: 'I', defaultStart: '17:00', defaultDuration: 60, source: 'custom' as const },
        { id: '10', activityName: 'J', defaultStart: '19:00', defaultDuration: 60, source: 'custom' as const },
        { id: '11', activityName: 'K', defaultStart: '21:00', defaultDuration: 60, source: 'custom' as const },
        { id: '12', activityName: 'L', defaultStart: '23:00', defaultDuration: 60, source: 'custom' as const },
      ],
    }
    render(<TemplateCard template={t} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('还有 2 条')).toBeInTheDocument()
    // 前 10 条可见（A..J）
    expect(screen.getByText(/A/)).toBeInTheDocument()
    expect(screen.getByText(/J/)).toBeInTheDocument()
    // 后 2 条不在静态文本中（被 Popover 包裹）
    expect(screen.queryByText('21:00')).not.toBeInTheDocument()
    expect(screen.queryByText('23:00')).not.toBeInTheDocument()
  })

  it('行按 start 升序显示', () => {
    const t = {
      ...baseTemplate,
      rows: [
        { id: '1', activityName: 'B', defaultStart: '09:00', defaultDuration: 60, source: 'custom' as const },
        { id: '2', activityName: 'A', defaultStart: '06:00', defaultDuration: 60, source: 'custom' as const },
      ],
    }
    const { container } = render(<TemplateCard template={t} onEdit={vi.fn()} onDelete={vi.fn()} />)
    const lines = container.querySelectorAll('[data-testid="row-line"]')
    expect(lines[0]?.textContent).toMatch(/06:00/)
    expect(lines[1]?.textContent).toMatch(/09:00/)
  })

  it('点击「编辑」应触发 onEdit', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<TemplateCard template={baseTemplate} onEdit={onEdit} onDelete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /编辑/ }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('点击「删除」应触发 onDelete', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(<TemplateCard template={baseTemplate} onEdit={vi.fn()} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: /删除/ }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('点击「还有 N 条」应展开 Popover 并显示完整行列表', async () => {
    const user = userEvent.setup()
    const t = {
      ...baseTemplate,
      rows: [
        { id: '1', activityName: 'Alpha', defaultStart: '01:00', defaultDuration: 60, source: 'custom' as const },
        { id: '2', activityName: 'Beta', defaultStart: '03:00', defaultDuration: 60, source: 'custom' as const },
        { id: '3', activityName: 'Gamma', defaultStart: '05:00', defaultDuration: 60, source: 'custom' as const },
        { id: '4', activityName: 'Delta', defaultStart: '07:00', defaultDuration: 60, source: 'custom' as const },
        { id: '5', activityName: 'Epsilon', defaultStart: '09:00', defaultDuration: 60, source: 'custom' as const },
        { id: '6', activityName: 'Zeta', defaultStart: '11:00', defaultDuration: 60, source: 'custom' as const },
        { id: '7', activityName: 'Eta', defaultStart: '13:00', defaultDuration: 60, source: 'custom' as const },
        { id: '8', activityName: 'Theta', defaultStart: '15:00', defaultDuration: 60, source: 'custom' as const },
        { id: '9', activityName: 'Iota', defaultStart: '17:00', defaultDuration: 60, source: 'custom' as const },
        { id: '10', activityName: 'Kappa', defaultStart: '19:00', defaultDuration: 60, source: 'custom' as const },
        { id: '11', activityName: 'Lambda', defaultStart: '21:00', defaultDuration: 60, source: 'custom' as const },
        { id: '12', activityName: 'Mu', defaultStart: '23:00', defaultDuration: 60, source: 'custom' as const },
      ],
    }
    render(<TemplateCard template={t} onEdit={vi.fn()} onDelete={vi.fn()} />)

    // 初始：前 10 条可见（按 start 升序为 Alpha..Kappa）；Lambda、Mu 不在主 DOM
    expect(screen.queryByText('21:00')).not.toBeInTheDocument()
    expect(screen.queryByText('23:00')).not.toBeInTheDocument()

    // 打开 popover
    const trigger = screen.getByRole('button', { name: /还有 2 条/ })
    await user.click(trigger)

    // 完整 12 行应全部在 document 中（popover 内容）
    // Lambda/Mu 仅在 popover 内可见 → 用 getByText 限定 popover
    expect(screen.getByText(/^21:00.*Lambda$/)).toBeInTheDocument()
    expect(screen.getByText(/^23:00.*Mu$/)).toBeInTheDocument()
    // 限定到 popover 内容，确保 Lambda / Mu 真在 popover 中
    const popover = screen.getByRole('dialog')
    const withinPopover = within(popover)
    expect(withinPopover.getByText(/Epsilon/)).toBeInTheDocument()
    expect(withinPopover.getByText(/Zeta/)).toBeInTheDocument()
    expect(withinPopover.getByText(/Alpha/)).toBeInTheDocument()
  })

  it('0 行时应显示「暂无安排」', () => {
    render(
      <TemplateCard
        template={{ ...baseTemplate, rows: [] }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('暂无安排')).toBeInTheDocument()
  })

  it('空名模板应回退为「未命名」', () => {
    render(
      <TemplateCard
        template={{ ...baseTemplate, name: '' }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('未命名')).toBeInTheDocument()
  })
})
