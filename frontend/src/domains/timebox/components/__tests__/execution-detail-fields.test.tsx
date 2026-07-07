/**
 * @file execution-detail-fields 测试
 * @brief [023.13] 打卡专区共享组件：实际时间窗派生时长 + 专注超限红字 + 能量默认
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExecutionDetailFields } from '../execution-detail-fields'

describe('ExecutionDetailFields', () => {
  it('actualStart + actualEnd 齐备时显示派生实际时长', () => {
    render(
      <ExecutionDetailFields
        value={{ actualStartTime: '2026-07-07T09:00', actualEndTime: '2026-07-07T10:30' }}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText(/实际时长.*90/)).toBeTruthy()
  })

  it('focusMinutes > 实际时长 → 超限提示', () => {
    render(
      <ExecutionDetailFields
        value={{ actualStartTime: '2026-07-07T09:00', actualEndTime: '2026-07-07T10:00', focusMinutes: 90 }}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText(/专注.*超过.*实际/)).toBeTruthy()
  })

  it('有 archetypeId → 能量字段显示默认均值占位', () => {
    render(
      <ExecutionDetailFields
        value={{ energyActual: 7 }}
        onChange={() => {}}
        defaultEnergyActual={7}
      />,
    )
    const energy = screen.getByDisplayValue('7')
    expect(energy).toBeTruthy()
  })

  it('onChange 透传 focusMinutes 输入', () => {
    const onChange = vi.fn()
    render(<ExecutionDetailFields value={{}} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('深度专注时长（分钟）'), { target: { value: '45' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ focusMinutes: 45 }))
  })
})
