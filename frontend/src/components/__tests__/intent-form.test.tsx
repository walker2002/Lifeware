// IntentForm 组件测试
// T025: 验证表单渲染、验证逻辑和提交行为

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IntentForm } from '@/components/intent-form'
import type { TemplateFormFields } from '@/components/intent-form'

describe('IntentForm', () => {
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染所有字段和提交按钮', () => {
    render(<IntentForm onSubmit={mockOnSubmit} isLoading={false} />)

    expect(screen.getByLabelText('标题')).toBeInTheDocument()
    expect(screen.getByLabelText('开始时间')).toBeInTheDocument()
    expect(screen.getByLabelText(/时长/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建时间盒' })).toBeInTheDocument()
  })

  it('有效输入时调用 onSubmit', async () => {
    const user = userEvent.setup()
    render(<IntentForm onSubmit={mockOnSubmit} isLoading={false} />)

    await user.type(screen.getByLabelText('标题'), '市场调研报告')
    await user.type(screen.getByLabelText('开始时间'), '2026-05-03T10:00')
    await user.type(screen.getByLabelText(/时长/), '120')
    await user.click(screen.getByRole('button', { name: '创建时间盒' }))

    expect(mockOnSubmit).toHaveBeenCalledTimes(1)
    expect(mockOnSubmit).toHaveBeenCalledWith({
      title: '市场调研报告',
      startTime: '2026-05-03T10:00',
      duration: 120,
    })
  })

  it('空标题时显示验证错误', async () => {
    const user = userEvent.setup()
    render(<IntentForm onSubmit={mockOnSubmit} isLoading={false} />)

    // 只填写部分字段
    await user.type(screen.getByLabelText('开始时间'), '2026-05-03T10:00')
    await user.type(screen.getByLabelText(/时长/), '60')
    await user.click(screen.getByRole('button', { name: '创建时间盒' }))

    expect(mockOnSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('请输入标题')).toBeInTheDocument()
  })

  it('空开始时间时显示验证错误', async () => {
    const user = userEvent.setup()
    render(<IntentForm onSubmit={mockOnSubmit} isLoading={false} />)

    await user.type(screen.getByLabelText('标题'), '测试')
    await user.type(screen.getByLabelText(/时长/), '60')
    await user.click(screen.getByRole('button', { name: '创建时间盒' }))

    expect(mockOnSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('请选择开始时间')).toBeInTheDocument()
  })

  it('时长小于 5 分钟时显示验证错误', async () => {
    const user = userEvent.setup()
    render(<IntentForm onSubmit={mockOnSubmit} isLoading={false} />)

    await user.type(screen.getByLabelText('标题'), '测试')
    await user.type(screen.getByLabelText('开始时间'), '2026-05-03T10:00')
    await user.type(screen.getByLabelText(/时长/), '3')
    await user.click(screen.getByRole('button', { name: '创建时间盒' }))

    expect(mockOnSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('最短 5 分钟')).toBeInTheDocument()
  })

  it('时长超过 480 分钟时显示验证错误', async () => {
    const user = userEvent.setup()
    render(<IntentForm onSubmit={mockOnSubmit} isLoading={false} />)

    await user.type(screen.getByLabelText('标题'), '测试')
    await user.type(screen.getByLabelText('开始时间'), '2026-05-03T10:00')
    await user.type(screen.getByLabelText(/时长/), '500')
    await user.click(screen.getByRole('button', { name: '创建时间盒' }))

    expect(mockOnSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('最长 480 分钟')).toBeInTheDocument()
  })

  it('loading 状态时禁用按钮和输入', () => {
    render(<IntentForm onSubmit={mockOnSubmit} isLoading={true} />)

    expect(screen.getByLabelText('标题')).toBeDisabled()
    expect(screen.getByLabelText('开始时间')).toBeDisabled()
    expect(screen.getByLabelText(/时长/)).toBeDisabled()
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText('处理中')).toBeInTheDocument()
  })

  it('显示服务端错误信息', () => {
    render(
      <IntentForm
        onSubmit={mockOnSubmit}
        isLoading={false}
        error="服务器错误"
      />,
    )

    expect(screen.getByText('服务器错误')).toBeInTheDocument()
  })
})
