/**
 * @file AIOrchestratePanel.test
 * @brief [023.08] T5 AI 编排建议展示面板 — proposal 卡片 + 接受/拒绝按钮
 *
 * [G12 fold] 4 case：
 * - 1. 渲染所有 proposal 卡片（标题 + 时间段）
 * - 2. 拒绝按钮点击 → onReject(propId)
 * - 3. 已拒绝 proposal 显示 opacity-50 + 「接受」按钮（可恢复）
 * - 4. 空 proposals 列表不渲染（container.firstChild === null）
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { AIOrchestratePanel } from '../AIOrchestratePanel'

describe('[023.08] T5 [G12] <AIOrchestratePanel>', () => {
  it('case 1：渲染 proposal 标题 + 时间段', () => {
    render(
      <AIOrchestratePanel
        proposals={[{ id: 'p1', title: 't1', startTime: '08:00', endTime: '09:00' }]}
        rejected={new Set()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    )
    expect(screen.getByText('t1')).toBeTruthy()
    // [023.08] 用 HTML en-dash U+2013 时间段分隔
    expect(screen.getByText(/08:00 – 09:00/)).toBeTruthy()
  })

  it('case 2：拒绝按钮点击 → onReject(propId)', () => {
    const onReject = vi.fn()
    render(
      <AIOrchestratePanel
        proposals={[{ id: 'p1', title: 't1', startTime: '08:00', endTime: '09:00' }]}
        rejected={new Set()}
        onAccept={vi.fn()}
        onReject={onReject}
      />,
    )
    fireEvent.click(screen.getByText('拒绝'))
    expect(onReject).toHaveBeenCalledWith('p1')
  })

  it('case 3：已拒绝 proposal 显示接受按钮 + opacity-50', () => {
    render(
      <AIOrchestratePanel
        proposals={[{ id: 'p1', title: 't1', startTime: '08:00', endTime: '09:00' }]}
        rejected={new Set(['p1'])}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    )
    // 已拒绝态：显示「接受」按钮（恢复）
    expect(screen.getByText('接受')).toBeTruthy()
    // card 上 opacity-50
    const card = screen.getByText('t1').closest('[data-testid=proposal-card]')
    expect(card?.className).toMatch(/opacity-50/)
  })

  it('case 4：空 proposals 不渲染（container.firstChild === null）', () => {
    const { container } = render(
      <AIOrchestratePanel
        proposals={[]}
        rejected={new Set()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})
