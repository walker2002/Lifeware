// 页面渲染集成测试
// 验证 Home 组件默认渲染 schedule 视图和左面板

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// 模拟 Server Actions
vi.mock('@/app/actions/llm-config', () => ({
  checkLLMConfigured: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/app/actions/intent', () => ({
  submitIntent: vi.fn().mockResolvedValue({
    success: true,
    timeboxes: [],
  }),
  submitTemplateIntent: vi.fn().mockResolvedValue({
    success: true,
    timeboxes: [],
  }),
  getTimeboxesByRange: vi.fn().mockResolvedValue([]),
  transitionTimebox: vi.fn().mockResolvedValue({ success: true }),
  submitExecutionIntent: vi.fn().mockResolvedValue({ success: true, timeboxes: [] }),
  submitBatchIntent: vi.fn().mockResolvedValue({ results: [] }),
  resolveShortcut: vi.fn().mockResolvedValue(null),
  fetchDomainActions: vi.fn().mockResolvedValue([]),
  submitDynamicIntent: vi.fn().mockResolvedValue({ success: true }),
  fetchActionData: vi.fn().mockResolvedValue({ hasFields: false, description: '' }),
  fetchIntentTriggers: vi.fn().mockResolvedValue([]),
  openCnuiSurface: vi.fn().mockResolvedValue({
    content: '请填写习惯信息',
    surface: {
      cnuiSurfaceId: 'test-id',
      cnuiSurfaceType: 'habit-creation-card',
      domainId: 'habits',
      action: 'createHabit',
      dataSnapshot: {},
    },
  }),
  submitCnuiSurface: vi.fn().mockResolvedValue({ success: true, habit: { title: '测试习惯' } }),
}))

// 模拟 Drizzle ORM（数据库连接）
vi.mock('@/lib/db', () => ({
  db: {},
}))

// 模拟 useAutoTrigger hook
vi.mock('@/hooks/use-auto-trigger', () => ({
  useAutoTrigger: vi.fn(),
}))

// 需要在 mock 后导入
import Home from '@/app/page'

describe('Home 页面渲染', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('默认渲染 schedule 视图（DateNav）', () => {
    render(<Home />)

    // schedule 视图包含 DateNav 组件
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('默认显示 assistant 标签面板（SessionList）', () => {
    render(<Home />)

    // 左侧面板应包含 "+ 新对话" 按钮（SessionList 组件）
    expect(screen.getByText('+ 新对话')).toBeInTheDocument()
  })

  it('未配置 LLM 时显示配置提示', async () => {
    render(<Home />)

    expect(await screen.findByText('请先配置大语言模型')).toBeInTheDocument()
    expect(screen.getByText('前往设置')).toBeInTheDocument()
  })

  it('设置按钮在导航栏中可点击', () => {
    render(<Home />)

    // AppShell 的导航栏包含设置按钮
    const settingsButton = screen.getByLabelText('设置')
    expect(settingsButton).toBeInTheDocument()
  })
})
