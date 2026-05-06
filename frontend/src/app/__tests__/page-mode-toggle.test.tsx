// 模式切换集成测试
// T026: 验证 AI/表单模式切换行为

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// 模拟 Server Actions
vi.mock('@/app/actions/intent', () => ({
  submitIntent: vi.fn().mockResolvedValue({
    success: true,
    timeboxes: [],
  }),
  submitTemplateIntent: vi.fn().mockResolvedValue({
    success: true,
    timeboxes: [],
  }),
}))

// 模拟 Drizzle ORM（数据库连接）
vi.mock('@/lib/db', () => ({
  db: {},
}))

// 需要在 mock 后导入
import Home from '@/app/page'

describe('模式切换', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('默认显示 AI 模式（IntentInput）', () => {
    render(<Home />)

    // AI 模式应显示自然语言输入框
    expect(screen.getByLabelText('意图输入')).toBeInTheDocument()
    // 不应显示表单字段
    expect(screen.queryByLabelText('标题')).not.toBeInTheDocument()
  })

  it('切换到表单模式时显示 IntentForm', async () => {
    const user = userEvent.setup()
    render(<Home />)

    // 点击表单模式切换按钮
    await user.click(screen.getByRole('button', { name: '表单填写' }))

    // 应显示表单字段
    expect(screen.getByLabelText('标题')).toBeInTheDocument()
    expect(screen.getByLabelText('开始时间')).toBeInTheDocument()
    expect(screen.getByLabelText(/时长/)).toBeInTheDocument()
    // 不应显示 AI 输入框
    expect(screen.queryByLabelText('意图输入')).not.toBeInTheDocument()
  })

  it('从表单模式切换回 AI 模式', async () => {
    const user = userEvent.setup()
    render(<Home />)

    // 切换到表单
    await user.click(screen.getByRole('button', { name: '表单填写' }))
    expect(screen.getByLabelText('标题')).toBeInTheDocument()

    // 切换回 AI
    await user.click(screen.getByRole('button', { name: 'AI 对话' }))
    expect(screen.getByLabelText('意图输入')).toBeInTheDocument()
    expect(screen.queryByLabelText('标题')).not.toBeInTheDocument()
  })

  it('模式切换按钮有正确的激活状态', async () => {
    const user = userEvent.setup()
    render(<Home />)

    const aiButton = screen.getByRole('button', { name: 'AI 对话' })
    const formButton = screen.getByRole('button', { name: '表单填写' })

    // 默认 AI 模式激活
    expect(aiButton.className).toContain('bg-background')
    expect(formButton.className).toContain('text-body')

    // 切换到表单
    await user.click(formButton)
    expect(formButton.className).toContain('bg-background')
    expect(aiButton.className).toContain('text-body')
  })
})
