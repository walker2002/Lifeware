/**
 * @file appointment-view-toggle.test
 * @brief [026.02] T4 — AppointmentViewToggle 组件测试
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentViewToggle } from '../appointment-view-toggle'

describe('AppointmentViewToggle', () => {
  it('渲染日/月两个按钮', () => {
    render(<AppointmentViewToggle viewMode="day" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /日视图/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /月视图/ })).toBeInTheDocument()
  })

  it('当前 viewMode 按钮显示激活态', () => {
    render(<AppointmentViewToggle viewMode="month" onChange={() => {}} />)
    const monthBtn = screen.getByRole('button', { name: /月视图/ })
    expect(monthBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('点击月按钮触发 onChange("month")', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AppointmentViewToggle viewMode="day" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /月视图/ }))
    expect(onChange).toHaveBeenCalledWith('month')
  })

  it('点击日按钮触发 onChange("day")', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AppointmentViewToggle viewMode="month" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /日视图/ }))
    expect(onChange).toHaveBeenCalledWith('day')
  })
})