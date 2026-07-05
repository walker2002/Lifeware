/**
 * @file CreateSmartTimebox.test
 * @brief [023.08] T5 CNUI surface — AI 智能推荐 + proposal 接受/拒绝 + 撤销 batch
 *
 * 守护 F5 fold（data-testid selectors 给 E2E 用）+ G9 fold（accept button
 * 触发 onConfirm with createTimebox + items[]）。
 *
 * 不依赖 DB / AI：纯 RTL + vi.fn onConfirm/onDataChange 验证 surface 与
 * 用户交互契约。
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { CreateSmartTimebox } from '../CreateSmartTimebox'

describe('[023.08] T5 <CreateSmartTimebox>', () => {
  it('AI 编排建议面板渲染所有 proposals 标题 + 时间段', () => {
    render(
      <CreateSmartTimebox
        surfaceType="createSmartTimebox"
        dataModel={{
          proposals: [
            { id: 'p1', title: 'task 1', startTime: '08:00', endTime: '09:00' },
            { id: 'p2', title: 'task 2', startTime: '10:00', endTime: '11:00' },
          ],
          revertableBatches: [],
        }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/task 1/)).toBeTruthy()
    expect(screen.getByText(/task 2/)).toBeTruthy()
    // 时间段应展示在 proposal 卡片上
    expect(screen.getByText(/08:00 – 09:00/)).toBeTruthy()
    expect(screen.getByText(/10:00 – 11:00/)).toBeTruthy()
  })

  it('revertableBatches 非空时显示「撤销刚才创建的 N 个时间盒」', () => {
    render(
      <CreateSmartTimebox
        surfaceType="createSmartTimebox"
        dataModel={{
          proposals: [],
          revertableBatches: [{ batchId: 'batch-1', acceptedAt: Date.now(), count: 3 }],
        }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByTestId('revert-batch-btn')).toBeTruthy()
    expect(screen.getByText(/撤销刚刚创建的 3 个时间盒/)).toBeTruthy()
  })

  it('点击 revert → 触发 onConfirm(revertSmartTimeboxes, { batchId })', () => {
    const onConfirm = vi.fn()
    render(
      <CreateSmartTimebox
        surfaceType="createSmartTimebox"
        dataModel={{
          proposals: [],
          revertableBatches: [{ batchId: 'batch-1', acceptedAt: Date.now(), count: 3 }],
        }}
        onDataChange={vi.fn()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('revert-batch-btn'))
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'revertSmartTimeboxes',
        fields: expect.objectContaining({ batchId: 'batch-1' }),
      }),
    )
  })

  // [G9 fold] 接受按钮点击 → onConfirm with createTimebox + items[].startTime/endTime HH:MM + date
  it('[G9] 接受按钮点击 → onConfirm with createTimebox + items[] 含 HH:MM + date', () => {
    const onConfirm = vi.fn()
    render(
      <CreateSmartTimebox
        surfaceType="createSmartTimebox"
        dataModel={{
          proposals: [
            { id: 'p1', title: 'task 1', startTime: '08:00', endTime: '09:00' },
          ],
          revertableBatches: [],
        }}
        onDataChange={vi.fn()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('accept-all-btn'))
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'createTimebox',
        fields: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              title: 'task 1',
              startTime: '08:00',
              endTime: '09:00',
              date: expect.any(String),
            }),
          ]),
        }),
      }),
    )
  })

  // [G9 fold] 拒绝按钮 → 该 proposal 从 accepted list 排除
  it('[G9] 拒绝按钮 → 该 proposal 从 accepted list 排除', () => {
    const onConfirm = vi.fn()
    render(
      <CreateSmartTimebox
        surfaceType="createSmartTimebox"
        dataModel={{
          proposals: [
            { id: 'p1', title: 'keep', startTime: '08:00', endTime: '09:00' },
            { id: 'p2', title: 'reject-me', startTime: '10:00', endTime: '11:00' },
          ],
          revertableBatches: [],
        }}
        onDataChange={vi.fn()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    // p2 的 proposal-card 内的 reject-btn
    const p2Card = screen.getByText('reject-me').closest('[data-testid=proposal-card]') as HTMLElement
    fireEvent.click(p2Card.querySelector('[data-testid=reject-btn]') as HTMLElement)
    fireEvent.click(screen.getByTestId('accept-all-btn'))
    const args = onConfirm.mock.calls[0][0]
    expect(args.fields.items).toHaveLength(1)
    expect(args.fields.items[0].title).toBe('keep')
  })
})
