/**
 * @file appointment-page-banner.test
 * @brief [026.02] T3 — AppointmentPageBanner 组件测试
 */

import { render, screen } from '@testing-library/react'
import { AppointmentPageBanner } from '../appointment-page-banner'

describe('AppointmentPageBanner', () => {
  it('渲染标题「约定管理」', () => {
    render(<AppointmentPageBanner />)
    expect(screen.getByText('约定管理')).toBeInTheDocument()
  })

  it('不渲染任何 banner image 容器时, 不崩', () => {
    const { container } = render(<AppointmentPageBanner />)
    expect(container).toBeInTheDocument()
  })
})