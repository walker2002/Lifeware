"use client"

import type { ReactNode } from "react"

type ChatBubbleRole = "user" | "assistant" | "system"

interface ChatBubbleProps {
  role: ChatBubbleRole
  children: ReactNode
  timestamp?: string
}

const ROLE_LABELS: Record<ChatBubbleRole, string> = {
  user: "你",
  assistant: "AI",
  system: "系统",
}

export function ChatBubble({ role, children, timestamp }: ChatBubbleProps) {
  if (role === "system") {
    return (
      <div className="mb-3 text-center">
        <span className="text-xs italic text-muted-foreground/60">
          {children}
        </span>
      </div>
    )
  }

  const isUser = role === "user"

  return (
    <div className={`mb-4 flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      {/* 角色标签 + 时间戳 */}
      <div className={`flex items-center gap-2 mb-1 ${isUser ? "flex-row-reverse" : ""}`}>
        <span className="text-xs font-medium text-muted-foreground">
          {ROLE_LABELS[role]}
        </span>
        {timestamp && (
          <span className="text-xs text-muted-foreground/50">{timestamp}</span>
        )}
      </div>
      {/* 气泡 */}
      <div
        className={`max-w-[80%] text-sm leading-relaxed ${
          isUser
            ? "rounded-tl-sm rounded-bl-sm rounded-tr-lg rounded-br-lg bg-primary/10 text-ink"
            : "rounded-tr-sm rounded-br-sm rounded-tl-lg rounded-bl-lg bg-surface-soft text-body"
        }`}
      >
        <div className="px-3 py-2">{children}</div>
      </div>
    </div>
  )
}
