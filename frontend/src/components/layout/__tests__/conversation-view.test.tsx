import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConversationView } from '../conversation-view'
import type { ChatMessage } from '@/usom/types/objects'

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

  it('should show default quick actions when no recent sessions provided', () => {
    render(
      <ConversationView
        messages={[]}
        onSendMessage={vi.fn()}
      />
    )
    expect(screen.getByText('创建任务')).toBeInTheDocument()
    expect(screen.getByText('规划日程')).toBeInTheDocument()
    expect(screen.getByText('设定目标')).toBeInTheDocument()
    expect(screen.getByText('添加习惯')).toBeInTheDocument()
    expect(screen.getByText('能量记录')).toBeInTheDocument()
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

  it('should click quick action to send message', async () => {
    const onSend = vi.fn()
    render(
      <ConversationView
        messages={[]}
        onSendMessage={onSend}
      />
    )
    const btn = screen.getByText('创建任务')
    btn.click()
    expect(onSend).toHaveBeenCalledWith('创建任务')
  })

  it('should have input area', () => {
    render(
      <ConversationView
        messages={messages}
        onSendMessage={vi.fn()}
      />
    )
    expect(screen.getByPlaceholderText('输入消息...')).toBeInTheDocument()
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
    expect(onSend).toHaveBeenCalledWith('测试消息')
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
