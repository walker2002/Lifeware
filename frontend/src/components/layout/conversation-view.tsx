/**
 * @file conversation-view
 * @brief 对话视图组件
 * 
 * 展示聊天消息列表，支持意图触发和 CN-UI 动作面
 */

"use client"

import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import type { ChatMessage, AISessionSummary, SurfaceState } from "@/usom/types/objects"
import { validateFile } from "@/lib/task-import/file-parser"
import { toast } from "sonner"
import { useCnuiLifecycle } from "@/components/cnui/use-cnui-lifecycle"
import { CnuiSurfaceWrapper } from "@/components/cnui/CnuiSurfaceWrapper"
import { ChatBubble } from "@/components/chat-bubble"
import type { FrequentIntent } from "@/app/actions/activity"
import { getSessionSurfaceOutcomes } from "@/app/actions/session"
import { Paperclip, Send, MessageSquare } from "lucide-react"

/**
 * 意图触发项
 */
interface IntentTrigger {
  /** 显示标签 */
  label: string
  /** 快捷键 */
  shortcut: string
  /** 域 ID */
  domainId: string
  /** 动作名称 */
  action: string
}

export type { FrequentIntent }

/**
 * ConversationView 组件属性
 */
interface ConversationViewProps {
  /** 消息列表 */
  messages: ChatMessage[]
  /** 当前会话 ID（用于恢复 surface 状态） */
  sessionId?: string
  /** 发送消息回调 */
  onSendMessage: (content: string, attachments?: File[]) => void
  /** 是否正在加载 */
  isLoading?: boolean
  /** 最近会话列表 */
  recentSessions?: AISessionSummary[]
  /** 选中会话回调 */
  onSelectSession?: (sessionId: string) => void
  /** 意图触发列表 */
  intentTriggers?: IntentTrigger[]
  /** 频繁意图列表 */
  frequentIntents?: FrequentIntent[]
  /** CN-UI 确认回调 */
  onCnuiConfirm?: (cnuiSurfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => void
  /** 动作面状态变更回调 */
  onSurfaceStateChange?: (surfaceId: string, state: SurfaceState) => void
}

export function ConversationView({ messages, sessionId, onSendMessage, isLoading, recentSessions, onSelectSession, intentTriggers, frequentIntents, onCnuiConfirm, onSurfaceStateChange }: ConversationViewProps) {
  const [input, setInput] = useState("")
  const [attachments, setAttachments] = useState<File[]>([])
  const [showAllIntents, setShowAllIntents] = useState(false)

  // 从消息中提取已有的 surface 状态（跨导航持久化）
  const initialSurfaceStates = useMemo(() => {
    const states: Record<string, SurfaceState> = {}
    for (const msg of messages) {
      if (msg.cnuiSurface?.state) {
        states[msg.cnuiSurface.cnuiSurfaceId] = msg.cnuiSurface.state
      }
    }
    return states
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — 状态已持久化在 messages.cnuiSurface.state 中，重新挂载时自动读取最新值

  // 从后端 session 恢复 surface 状态
  const [restoredSurfaceStates, setRestoredSurfaceStates] = useState<Record<string, SurfaceState>>({})

  useEffect(() => {
    if (!sessionId) return

    getSessionSurfaceOutcomes(sessionId)
      .then(outcomes => {
        const states: Record<string, SurfaceState> = {}
        for (const [surfaceId, outcome] of Object.entries(outcomes)) {
          states[surfaceId] = outcome.state
        }
        setRestoredSurfaceStates(states)
      })
      .catch(err => console.error('[ConversationView] 恢复 surface 状态失败:', err))
  }, [sessionId])

  // 合并消息中的状态和从后端恢复的状态（后端状态优先级更高）
  const mergedInitialStates = useMemo(() => ({
    ...initialSurfaceStates,
    ...restoredSurfaceStates,
  }), [initialSurfaceStates, restoredSurfaceStates])

  const [lifecycleState, lifecycleActions] = useCnuiLifecycle(
    useCallback(
      async (surfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => {
        if (!onCnuiConfirm) return
        await onCnuiConfirm(surfaceId, domainId, action, data)
      },
      [onCnuiConfirm]
    ),
    mergedInitialStates,
    onSurfaceStateChange,
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" })
  }, [messages.length])

  useEffect(() => {
    if (messages.length === 0) {
      inputRef.current?.focus()
    }
  }, [messages.length])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const validFiles: File[] = []

    for (const file of files) {
      const validation = validateFile(file)
      if (validation.valid) {
        validFiles.push(file)
      } else {
        toast.error(validation.error)
      }
    }

    if (validFiles.length > 0) {
      setAttachments(prev => [...prev, ...validFiles])
    }

    // Reset input so same file can be selected again if needed
    e.target.value = ''
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed && attachments.length === 0) return
    onSendMessage(trimmed, attachments.length > 0 ? attachments : undefined)
    setInput("")
    setAttachments([])
  }, [input, attachments, onSendMessage])

  // Hidden file input
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".md,.txt,.docx,.xlsx"
      multiple
      className="hidden"
      onChange={handleFileSelect}
    />
  )

  // Attachment tags display
  const attachmentTags = attachments.length > 0 && (
    <div className="flex flex-wrap gap-2 mb-2">
      {attachments.map((file, index) => (
        <div
          key={index}
          className="flex items-center gap-1 rounded-md bg-surface-soft px-2 py-1 text-xs text-body"
        >
          <span className="max-w-[200px] truncate">{file.name}</span>
          <button
            type="button"
            onClick={() => removeAttachment(index)}
            className="ml-1 text-body/50 hover:text-body"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )

  // Input bar with attachment button
  const inputBar = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="text-body/50 hover:text-body transition-colors p-1"
        title="添加附件"
      >
        <Paperclip className="size-4" />
      </button>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="输入消息..."
        className="flex-1 rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink placeholder:text-body/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        disabled={isLoading}
      />
      <button
        type="submit"
        disabled={isLoading || (!input.trim() && attachments.length === 0)}
        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        发送
      </button>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      {fileInput}

      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center pt-[15vh] px-4">
          {/* 标题 */}
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-soft">
              <MessageSquare className="size-7 text-primary" />
            </div>
            <h2 className="font-display text-2xl font-medium text-ink">有什么可以帮你的？</h2>
            <p className="text-sm text-body">通过自然语言描述你的意图，AI 会帮你规划执行</p>
          </div>

          {/* 输入框区域 — 附件内置在输入框内 */}
          <form onSubmit={handleSubmit} className="mt-8 w-full max-w-xl">
            <div className="rounded-md border border-hairline bg-background p-2">
              {/* 附件标签（输入框内部上方） */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {attachments.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1 rounded-md bg-surface-soft px-2 py-1 text-xs text-body"
                    >
                      <span className="max-w-[200px] truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className="ml-1 text-body/50 hover:text-body"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* 输入行：附件按钮 + 输入框 + 发送按钮 */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-body/50 hover:text-body transition-colors p-1 shrink-0"
                  title="添加附件"
                >
                  <Paperclip className="size-4" />
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="输入消息..."
                  className="flex-1 border-0 bg-transparent text-sm text-ink placeholder:text-body/40 focus:outline-none"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || (!input.trim() && attachments.length === 0)}
                  className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50 shrink-0"
                >
                  发送
                </button>
              </div>
            </div>
          </form>

          {/* 常用意图（在输入框下方） */}
          {(() => {
            const source = frequentIntents && frequentIntents.length > 0
              ? frequentIntents.map(fi => ({
                  key: `${fi.targetDomain}:${fi.targetAction}`,
                  label: fi.label,
                  shortcut: fi.shortcut,
                }))
              : (intentTriggers ?? []).map(t => ({
                  key: `${t.domainId}:${t.action}`,
                  label: t.label,
                  shortcut: t.shortcut,
                }))

            if (source.length === 0) return null

            const visible = showAllIntents ? source : source.slice(0, 5)

            return (
              <div className="mt-4 w-full max-w-xl">
                <div className="flex max-w-xl flex-wrap justify-center gap-2">
                  {visible.map(item => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        if (item.shortcut) setInput(item.shortcut + ' ')
                        inputRef.current?.focus()
                      }}
                      className="rounded-full border border-hairline px-3 py-1.5 text-sm text-body hover:bg-hover-overlay hover:text-ink transition-colors"
                    >
                      {item.label}{item.shortcut ? <span className="ml-1 text-body/40">{item.shortcut}</span> : null}
                    </button>
                  ))}
                </div>
                {source.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllIntents(prev => !prev)}
                    className="mt-2 block mx-auto text-xs text-body/50 hover:text-body transition-colors"
                  >
                    {showAllIntents ? '收起' : `更多 (${source.length - 5})`}
                  </button>
                )}
              </div>
            )
          })()}

          {/* 最近对话 */}
          {recentSessions && recentSessions.length > 0 && (
            <div className="mt-6 w-full max-w-xl">
              <p className="mb-2 text-xs text-body/50">最近对话</p>
              <div className="flex flex-col gap-1">
                {recentSessions.slice(0, 3).map(session => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onSelectSession?.(session.id)}
                    className="rounded-md px-3 py-2 text-left text-sm text-body hover:bg-hover-overlay hover:text-ink transition-colors"
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
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messages.map((msg, i) => (
              <ChatBubble key={i} role={msg.role} timestamp={msg.timestamp}>
                {msg.cnuiSurface ? (
                  <div>
                    <div>{msg.content}</div>
                    <CnuiSurfaceWrapper
                      surfaceId={msg.cnuiSurface.cnuiSurfaceId}
                      domainId={msg.cnuiSurface.domainId}
                      action={msg.cnuiSurface.action}
                      surfaceType={msg.cnuiSurface.cnuiSurfaceType}
                      dataSnapshot={msg.cnuiSurface.dataSnapshot}
                      lifecycleState={lifecycleState}
                      lifecycleActions={lifecycleActions}
                    />
                  </div>
                ) : (
                  msg.content
                )}
              </ChatBubble>
            ))}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-hairline px-4 py-3">
            {attachmentTags}
            {inputBar}
          </form>
        </>
      )}
    </div>
  )
}
