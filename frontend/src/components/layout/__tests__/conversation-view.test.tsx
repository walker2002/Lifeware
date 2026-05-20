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

  it('should show empty state when no messages', () => {
    render(
      <ConversationView
        messages={[]}
        onSendMessage={vi.fn()}
      />
    )
    expect(screen.getByText('开始新对话')).toBeInTheDocument()
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
