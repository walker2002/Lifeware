"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { ChatMessage } from "@/usom/types/objects"

interface ConversationViewProps {
  messages: ChatMessage[]
  onSendMessage: (content: string) => void
  isLoading?: boolean
}

const ROLE_LABELS: Record<ChatMessage['role'], string> = {
  user: '你',
  assistant: 'AI',
  system: '系统',
}

export function ConversationView({ messages, onSendMessage, isLoading }: ConversationViewProps) {
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" })
  }, [messages.length])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    onSendMessage(trimmed)
    setInput("")
  }, [input, onSendMessage])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="py-12 text-center text-sm text-body/40">开始新对话</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="mb-3">
            <span className="text-xs font-medium text-body/50">{ROLE_LABELS[msg.role]}</span>
            <div className={`mt-0.5 text-sm ${
              msg.role === 'user' ? 'text-ink' :
              msg.role === 'system' ? 'text-body/60 italic' :
              'text-body'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-hairline px-4 py-3">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="输入消息..."
          className="flex-1 rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink placeholder:text-body/40 focus:outline-none focus:ring-1 focus:ring-primary"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          发送
        </button>
      </form>
    </div>
  )
}
