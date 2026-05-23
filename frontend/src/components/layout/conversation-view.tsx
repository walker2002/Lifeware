"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { ChatMessage } from "@/usom/types/objects"
import type { AISessionSummary } from "@/usom/types/objects"

const DEFAULT_QUICK_ACTIONS = ['创建任务', '规划日程', '设定目标', '添加习惯', '能量记录']

interface ConversationViewProps {
  messages: ChatMessage[]
  onSendMessage: (content: string) => void
  isLoading?: boolean
  recentSessions?: AISessionSummary[]
  onSelectSession?: (sessionId: string) => void
}

const ROLE_LABELS: Record<ChatMessage['role'], string> = {
  user: '你',
  assistant: 'AI',
  system: '系统',
}

export function ConversationView({ messages, onSendMessage, isLoading, recentSessions, onSelectSession }: ConversationViewProps) {
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" })
  }, [messages.length])

  useEffect(() => {
    if (messages.length === 0) {
      inputRef.current?.focus()
    }
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
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <h2 className="text-lg font-semibold text-ink">有什么可以帮你的？</h2>
            <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
              {DEFAULT_QUICK_ACTIONS.map(action => (
                <button
                  key={action}
                  type="button"
                  onClick={() => onSendMessage(action)}
                  className="rounded-full border border-hairline px-3 py-1.5 text-sm text-body hover:bg-surface-soft hover:text-ink transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
            {recentSessions && recentSessions.length > 0 && (
              <div className="mt-6 w-full max-w-xl">
                <p className="mb-2 text-xs text-body/50">最近对话</p>
                <div className="flex flex-col gap-1">
                  {recentSessions.slice(0, 3).map(session => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onSelectSession?.(session.id)}
                      className="rounded-md px-3 py-2 text-left text-sm text-body hover:bg-surface-soft hover:text-ink transition-colors"
                    >
                      {session.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
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
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-hairline px-4 py-3">
        <input
          ref={inputRef}
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
