/**
 * @file appointment-filter-bar.test
 * @brief [026.02] T5 — AppointmentFilterBar 组件测试
 */

// jsdom 缺失 Pointer Capture / scrollIntoView API, Radix Select 触发时会抛错。
// shim 仅在测试环境生效, 不影响生产代码。
if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.setPointerCapture = () => {}
}
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentFilterBar } from '../appointment-filter-bar'

describe('AppointmentFilterBar', () => {
  const defaultRange = {
    start: new Date('2026-07-01T00:00:00Z'),
    end: new Date('2026-07-31T23:59:59Z'),
  }

  it('渲染状态筛选下拉', () => {
    render(
      <AppointmentFilterBar
        status="all"
        range={defaultRange}
        onStatusChange={() => {}}
        onRangeChange={() => {}}
      />,
    )
    expect(screen.getByRole('combobox', { name: /状态/ })).toBeInTheDocument()
  })

  it('显示当前 status 选中值', () => {
    render(
      <AppointmentFilterBar
        status="completed"
        range={defaultRange}
        onStatusChange={() => {}}
        onRangeChange={() => {}}
      />,
    )
    // shadcn Select 用 Radix, 当前选中值渲染在 combobox 内 (非 <input>),
    // 用 toHaveTextContent 校验比 getByDisplayValue 更稳。
    const trigger = screen.getByRole('combobox', { name: /状态/ })
    expect(trigger).toHaveTextContent('已完成')
  })

  it('切换 status 触发 onStatusChange', async () => {
    const user = userEvent.setup()
    const onStatusChange = vi.fn()
    render(
      <AppointmentFilterBar
        status="all"
        range={defaultRange}
        onStatusChange={onStatusChange}
        onRangeChange={() => {}}
      />,
    )
    // shadcn Select 基于 Radix Popover, click trigger → option 选择.
    const trigger = screen.getByRole('combobox', { name: /状态/ })
    await user.click(trigger)
    await user.click(screen.getByRole('option', { name: '计划' }))
    expect(onStatusChange).toHaveBeenCalledWith('scheduled')
  })

  it('渲染日期范围快捷选项', () => {
    render(
      <AppointmentFilterBar
        status="all"
        range={defaultRange}
        onStatusChange={() => {}}
        onRangeChange={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /本周/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /本月/ })).toBeInTheDocument()
  })

  it('点击「本月」触发 onRangeChange 范围本月', async () => {
    const user = userEvent.setup()
    const onRangeChange = vi.fn()
    render(
      <AppointmentFilterBar
        status="all"
        range={defaultRange}
        onStatusChange={() => {}}
        onRangeChange={onRangeChange}
      />,
    )
    await user.click(screen.getByRole('button', { name: /本月/ }))
    expect(onRangeChange).toHaveBeenCalledTimes(1)
    const [r] = onRangeChange.mock.calls[0]
    expect(r.start).toBeInstanceOf(Date)
    expect(r.end).toBeInstanceOf(Date)
  })
})