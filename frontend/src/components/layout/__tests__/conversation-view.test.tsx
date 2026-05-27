import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ConversationView } from '../conversation-view'
import type { ChatMessage } from '@/usom/types/objects'

vi.mock('@/components/cnui/use-cnui-lifecycle', () => ({
  useCnuiLifecycle: (onSubmit: Function) => {
    const state = {
      surfaceStates: {} as Record<string, string>,
      surfaceData: {} as Record<string, Record<string, unknown>>,
      submittingId: null as string | null,
      validationErrors: {} as Record<string, string[]>,
      confirmDialog: { open: false, type: 'save' as const, surfaceId: '', title: '', message: '' },
    }
    const actions = {
      requestSave: (surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => {
        onSubmit(surfaceId, domainId, action, data)
      },
      requestCancel: () => {},
      confirmDialogAction: () => {},
      dismissDialog: () => {},
      updateData: () => {},
      clearValidationErrors: () => {},
    }
    return [state, actions]
  },
}))

vi.mock('@/components/cnui/CnuiSurfaceWrapper', () => ({
  CnuiSurfaceWrapper: ({ surfaceId, domainId, action, surfaceType, lifecycleActions }: any) => (
    <div data-testid="cnui-surface-wrapper" data-surface-type={surfaceType} data-surface-id={surfaceId} data-domain-id={domainId} data-action={action}>
      <span>CN-UI: {surfaceType}</span>
      <button onClick={() => lifecycleActions.requestSave(surfaceId, domainId, action, { name: '测试习惯', defaultTime: '07:00' })}>提交</button>
    </div>
  ),
}))

const messages: ChatMessage[] = [
  { role: 'user', content: '你好', timestamp: '2026-05-16T10:00:00Z' },
  { role: 'assistant', content: '你好！有什么可以帮你的？', timestamp: '2026-05-16T10:00:01Z' },
  { role: 'system', content: '对象状态变化', timestamp: '2026-05-16T10:00:02Z' },
]

describe('ConversationView', () => {
  it('should render all messages', () => {
    render(
      <ConversationView
        messages={messages}
        onSendMessage={vi.fn()}
      />
    )
    expect(screen.getByText('你好')).toBeInTheDocument()
    expect(screen.getByText('你好！有什么可以帮你的？')).toBeInTheDocument()
    expect(screen.getByText('对象状态变化')).toBeInTheDocument()
  })

  it('should show welcome page when no messages', () => {
    render(
      <ConversationView
        messages={[]}
        onSendMessage={vi.fn()}
      />
    )
    expect(screen.getByText('有什么可以帮你的？')).toBeInTheDocument()
  })

  it('should show quick actions from intentTriggers prop', () => {
    render(
      <ConversationView
        messages={[]}
        onSendMessage={vi.fn()}
        intentTriggers={[
          { label: '添加习惯', shortcut: '/createHabit', domainId: 'habits', action: 'createHabit' },
          { label: '创建任务', shortcut: '/createTask', domainId: 'tasks', action: 'createTask' },
        ]}
      />
    )
    expect(screen.getByText('添加习惯 (/createHabit)')).toBeInTheDocument()
    expect(screen.getByText('创建任务 (/createTask)')).toBeInTheDocument()
  })

  it('should show no quick actions when intentTriggers is empty', () => {
    render(
      <ConversationView
        messages={[]}
        onSendMessage={vi.fn()}
        intentTriggers={[]}
      />
    )
    expect(screen.queryByText('创建任务')).not.toBeInTheDocument()
  })

  it('should show recent sessions when provided', () => {
    render(
      <ConversationView
        messages={[]}
        onSendMessage={vi.fn()}
        recentSessions={[
          { id: '1', title: '学习计划', status: 'active', createdAt: '2026-05-23T10:00:00Z', updatedAt: '2026-05-23T10:00:00Z' },
          { id: '2', title: '时间回顾', status: 'active', createdAt: '2026-05-22T10:00:00Z', updatedAt: '2026-05-22T10:00:00Z' },
        ]}
        onSelectSession={vi.fn()}
      />
    )
    expect(screen.getByText('学习计划')).toBeInTheDocument()
    expect(screen.getByText('时间回顾')).toBeInTheDocument()
  })

  it('should fill input with shortcut on quick action click', async () => {
    render(
      <ConversationView
        messages={[]}
        onSendMessage={vi.fn()}
        intentTriggers={[
          { label: '添加习惯', shortcut: '/createHabit', domainId: 'habits', action: 'createHabit' },
        ]}
      />
    )
    const btn = screen.getByText('添加习惯 (/createHabit)')
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      btn.click()
    })
    // 新行为：点击后填入 /shortcut + 空格到输入框，不是直接发送
    const input = screen.getByPlaceholderText('输入消息...') as HTMLInputElement
    expect(input.value).toBe('/createHabit ')
  })

  it('should have input area in conversation mode', () => {
    render(
      <ConversationView
        messages={messages}
        onSendMessage={vi.fn()}
      />
    )
    expect(screen.getByPlaceholderText('输入消息...')).toBeInTheDocument()
  })

  it('should have input area in welcome page mode', () => {
    render(
      <ConversationView
        messages={[]}
        onSendMessage={vi.fn()}
      />
    )
    expect(screen.getByPlaceholderText('输入消息...')).toBeInTheDocument()
  })

  it('should have attachment button', () => {
    render(
      <ConversationView
        messages={messages}
        onSendMessage={vi.fn()}
      />
    )
    const attachmentBtn = screen.getByTitle('添加附件')
    expect(attachmentBtn).toBeInTheDocument()
    expect(attachmentBtn.tagName).toBe('BUTTON')
  })

  it('should call onSendMessage when form submitted', async () => {
    const { fireEvent } = await import('@testing-library/react')
    const onSend = vi.fn()
    render(
      <ConversationView
        messages={messages}
        onSendMessage={onSend}
      />
    )
    const input = screen.getByPlaceholderText('输入消息...')
    fireEvent.change(input, { target: { value: '测试消息' } })
    fireEvent.submit(input.closest('form')!)
    expect(onSend).toHaveBeenCalledWith('测试消息', undefined)
  })

  it('should render messages with role indicators', () => {
    render(
      <ConversationView
        messages={messages}
        onSendMessage={vi.fn()}
      />
    )
    expect(screen.getByText('你')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
  })
})

// ─── CN-UI 表面渲染测试 ──────────────────────────────────────────

describe('ConversationView CN-UI 渲染', () => {
  const cnuiMessages: ChatMessage[] = [
    { role: 'user', content: '/createHabit', timestamp: '2026-05-27T10:00:00Z' },
    {
      role: 'assistant',
      content: '请填写习惯信息',
      timestamp: '2026-05-27T10:00:01Z',
      cnuiSurface: {
        cnuiSurfaceId: 'test-surface-1',
        cnuiSurfaceType: 'habit-creation-card',
        domainId: 'habits',
        action: 'createHabit',
        dataSnapshot: { defaultDuration: 30 },
      },
    },
  ]

  it('should render CnuiSurfaceWrapper when message has cnuiSurface', () => {
    render(
      <ConversationView
        messages={cnuiMessages}
        onSendMessage={vi.fn()}
      />
    )
    expect(screen.getByTestId('cnui-surface-wrapper')).toBeInTheDocument()
    expect(screen.getByText('CN-UI: habit-creation-card')).toBeInTheDocument()
  })

  it('should pass correct surfaceId to CnuiSurfaceWrapper', () => {
    render(
      <ConversationView
        messages={cnuiMessages}
        onSendMessage={vi.fn()}
      />
    )
    const wrapper = screen.getByTestId('cnui-surface-wrapper')
    expect(wrapper).toHaveAttribute('data-surface-id', 'test-surface-1')
  })

  it('should pass correct domainId and action to CnuiSurfaceWrapper', () => {
    render(
      <ConversationView
        messages={cnuiMessages}
        onSendMessage={vi.fn()}
      />
    )
    const wrapper = screen.getByTestId('cnui-surface-wrapper')
    expect(wrapper).toHaveAttribute('data-domain-id', 'habits')
    expect(wrapper).toHaveAttribute('data-action', 'createHabit')
  })

  it('should pass correct surfaceType to CnuiSurfaceWrapper', () => {
    render(
      <ConversationView
        messages={cnuiMessages}
        onSendMessage={vi.fn()}
      />
    )
    const wrapper = screen.getByTestId('cnui-surface-wrapper')
    expect(wrapper).toHaveAttribute('data-surface-type', 'habit-creation-card')
  })

  it('should call onCnuiConfirm when CN-UI form is submitted', async () => {
    const onCnuiConfirm = vi.fn().mockResolvedValue(undefined)
    render(
      <ConversationView
        messages={cnuiMessages}
        onSendMessage={vi.fn()}
        onCnuiConfirm={onCnuiConfirm}
      />
    )
    await act(async () => {
      screen.getByText('提交').click()
    })
    expect(onCnuiConfirm).toHaveBeenCalledWith(
      'test-surface-1',
      'habits',
      'createHabit',
      { name: '测试习惯', defaultTime: '07:00' },
    )
  })

  it('should not render CnuiSurfaceWrapper for messages without cnuiSurface', () => {
    render(
      <ConversationView
        messages={messages}
        onSendMessage={vi.fn()}
      />
    )
    expect(screen.queryByTestId('cnui-surface-wrapper')).not.toBeInTheDocument()
  })
})
