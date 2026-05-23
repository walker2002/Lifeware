# 对话输入框优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将新对话时的输入框从底部移至屏幕中央居中显示，多轮对话后移回底部；在输入框中添加文件附件按钮，支持上传 Markdown/Excel/Word 文件。

**Architecture:** 空对话时，整个界面为垂直居中的欢迎页（标题 + 快捷按钮 + 输入框 + 最近对话），输入框位于中央。用户发送第一条消息后，布局切换为上消息列表 + 底部输入框的经典对话模式。附件功能复用旧的 `task-import` 库代码（`file-parser.ts` 的文件验证逻辑）。

**Tech Stack:** React hooks, shadcn/ui Dialog, Vitest + Testing Library

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/components/layout/conversation-view.tsx` | Modify | 输入框位置切换 + 附件按钮 |
| `frontend/src/components/layout/__tests__/conversation-view.test.tsx` | Modify | 更新测试覆盖 |
| `frontend/src/lib/task-import/file-parser.ts` | Create (恢复) | 文件验证和解析工具 |

---

### Task 1: 恢复 file-parser.ts

从旧 commit `32903e4` 恢复文件验证工具，供附件功能使用。

**Files:**
- Create: `frontend/src/lib/task-import/file-parser.ts`

- [ ] **Step 1: 创建文件解析工具**

```typescript
const ALLOWED_EXTENSIONS = ['.md', '.txt', '.docx', '.xlsx']
const MAX_FILE_SIZE = 5 * 1024 * 1024

export interface FileValidation {
  valid: boolean
  error?: string
}

export function validateFile(file: File): FileValidation {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `不支持的文件格式: ${ext}。支持: ${ALLOWED_EXTENSIONS.join(', ')}` }
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，上限 5MB` }
  }
  return { valid: true }
}

export async function parseFileToText(file: File): Promise<string> {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()

  switch (ext) {
    case '.md':
    case '.txt':
      return await file.text()

    case '.docx':
    case '.xlsx':
      return await file.text()

    default:
      throw new Error(`不支持的文件格式: ${ext}`)
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/task-import/file-parser.ts
git commit -m "feat: restore file-parser utility for attachment support

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 重构 ConversationView — 输入框位置切换 + 附件按钮

**Files:**
- Modify: `frontend/src/components/layout/conversation-view.tsx`

这是核心修改。当前输入框始终在底部（`border-t` 固定在 flex 容器底部），需要改为：
- 空对话时：输入框在欢迎页中央（与标题、快捷按钮一起居中）
- 有消息时：输入框在底部（经典对话模式）
- 输入框左侧添加附件按钮（📎 图标）

- [ ] **Step 1: 更新 imports 和 interface**

在文件顶部添加 import：

```typescript
import { useState, useCallback, useRef, useEffect } from "react"
import type { ChatMessage } from "@/usom/types/objects"
import type { AISessionSummary } from "@/usom/types/objects"
import { validateFile, parseFileToText } from "@/lib/task-import/file-parser"
```

更新 interface，增加附件相关 props：

```typescript
interface ConversationViewProps {
  messages: ChatMessage[]
  onSendMessage: (content: string, attachments?: File[]) => void
  isLoading?: boolean
  recentSessions?: AISessionSummary[]
  onSelectSession?: (sessionId: string) => void
}
```

注意 `onSendMessage` 签名变了：增加了可选的 `attachments` 参数。

- [ ] **Step 2: 添加附件状态和文件处理逻辑**

在组件内部添加：

```typescript
export function ConversationView({ messages, onSendMessage, isLoading, recentSessions, onSelectSession }: ConversationViewProps) {
  const [input, setInput] = useState("")
  const [attachments, setAttachments] = useState<File[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ... 保留已有的 scroll useEffect ...

  useEffect(() => {
    if (messages.length === 0) {
      inputRef.current?.focus()
    }
  }, [messages.length])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const validFiles: File[] = []
    for (const file of Array.from(files)) {
      const validation = validateFile(file)
      if (validation.valid) {
        validFiles.push(file)
      }
    }
    setAttachments(prev => [...prev, ...validFiles])
    e.target.value = ""
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }, [])
```

- [ ] **Step 3: 更新 handleSubmit 支持附件**

```typescript
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed && attachments.length === 0) return
    onSendMessage(trimmed, attachments.length > 0 ? attachments : undefined)
    setInput("")
    setAttachments([])
  }, [input, attachments, onSendMessage])
```

- [ ] **Step 4: 提取输入表单为独立变量以便复用**

将输入表单提取为变量，在空对话和非空对话两种布局中复用：

```typescript
  // 隐藏的文件 input
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

  // 附件标签列表
  const attachmentTags = attachments.length > 0 && (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((file, i) => (
        <span
          key={`${file.name}-${i}`}
          className="inline-flex items-center gap-1 rounded-md bg-surface-soft px-2 py-0.5 text-xs text-body"
        >
          {file.name}
          <button
            type="button"
            onClick={() => removeAttachment(i)}
            className="text-body/50 hover:text-ink"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )

  // 输入框 + 附件按钮 + 发送按钮
  const inputBar = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="shrink-0 rounded-md p-2 text-body/50 hover:bg-surface-soft hover:text-ink transition-colors"
        title="添加附件"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </button>
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
        disabled={isLoading || (!input.trim() && attachments.length === 0)}
        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        发送
      </button>
    </div>
  )
```

- [ ] **Step 5: 重写 return JSX，实现两种布局**

```tsx
  return (
    <div className="flex h-full flex-col">
      {fileInput}

      {messages.length === 0 ? (
        /* 居中欢迎页 — 输入框在中央 */
        <div className="flex flex-1 flex-col items-center justify-center px-4">
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
          <form onSubmit={handleSubmit} className="mt-8 w-full max-w-xl">
            {attachmentTags}
            {inputBar}
          </form>
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
        /* 多轮对话 — 消息列表 + 底部输入框 */
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3">
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
          <form onSubmit={handleSubmit} className="border-t border-hairline px-4 py-3">
            {attachmentTags}
            {inputBar}
          </form>
        </>
      )}
    </div>
  )
```

- [ ] **Step 6: 运行测试，修复失败**

Run: `cd /home/walker/lifeware/frontend && npx vitest run src/components/layout/__tests__/conversation-view.test.tsx 2>&1 | tail -30`
Expected: 部分测试可能因 JSX 结构变化而失败，需要修复

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/layout/conversation-view.tsx
git commit -m "feat: center input in welcome page, add attachment button

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 更新测试

**Files:**
- Modify: `frontend/src/components/layout/__tests__/conversation-view.test.tsx`

- [ ] **Step 1: 更新现有测试 + 新增附件测试**

完整替换测试文件：

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConversationView } from '../conversation-view'
import type { ChatMessage } from '@/usom/types/objects'

const messages: ChatMessage[] = [
  { role: 'user', content: '你好', timestamp: '2026-05-16T10:00:00Z' },
  { role: 'assistant', content: '你好！有什么可以帮你的？', timestamp: '2026-05-16T10:00:01Z' },
]

describe('ConversationView', () => {
  it('should render all messages', () => {
    render(<ConversationView messages={messages} onSendMessage={vi.fn()} />)
    expect(screen.getByText('你好')).toBeInTheDocument()
    expect(screen.getByText('你好！有什么可以帮你的？')).toBeInTheDocument()
  })

  it('should show welcome page when no messages', () => {
    render(<ConversationView messages={[]} onSendMessage={vi.fn()} />)
    expect(screen.getByText('有什么可以帮你的？')).toBeInTheDocument()
  })

  it('should show default quick actions', () => {
    render(<ConversationView messages={[]} onSendMessage={vi.fn()} />)
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
        ]}
        onSelectSession={vi.fn()}
      />
    )
    expect(screen.getByText('学习计划')).toBeInTheDocument()
  })

  it('should click quick action to send message', () => {
    const onSend = vi.fn()
    render(<ConversationView messages={[]} onSendMessage={onSend} />)
    screen.getByText('创建任务').click()
    expect(onSend).toHaveBeenCalledWith('创建任务')
  })

  it('should have attachment button', () => {
    render(<ConversationView messages={[]} onSendMessage={vi.fn()} />)
    expect(screen.getByTitle('添加附件')).toBeInTheDocument()
  })

  it('should have input area in welcome page mode', () => {
    render(<ConversationView messages={[]} onSendMessage={vi.fn()} />)
    expect(screen.getByPlaceholderText('输入消息...')).toBeInTheDocument()
  })

  it('should have input area in conversation mode', () => {
    render(<ConversationView messages={messages} onSendMessage={vi.fn()} />)
    expect(screen.getByPlaceholderText('输入消息...')).toBeInTheDocument()
  })

  it('should call onSendMessage when form submitted', () => {
    const onSend = vi.fn()
    render(<ConversationView messages={messages} onSendMessage={onSend} />)
    const input = screen.getByPlaceholderText('输入消息...')
    fireEvent.change(input, { target: { value: '测试消息' } })
    fireEvent.submit(input.closest('form')!)
    expect(onSend).toHaveBeenCalledWith('测试消息')
  })

  it('should render messages with role indicators', () => {
    render(<ConversationView messages={messages} onSendMessage={vi.fn()} />)
    expect(screen.getByText('你')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试确认通过**

Run: `cd /home/walker/lifeware/frontend && npx vitest run src/components/layout/__tests__/conversation-view.test.tsx`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/__tests__/conversation-view.test.tsx
git commit -m "test: update conversation-view tests for centered input and attachments

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 更新 page.tsx 适配 onSendMessage 新签名

**Files:**
- Modify: `frontend/src/app/page.tsx`

`onSendMessage` 签名从 `(content: string) => void` 变为 `(content: string, attachments?: File[]) => void`。需要更新 `handleConversationSend`。

- [ ] **Step 1: 更新 handleConversationSend 签名**

找到 `handleConversationSend`（约 314-349 行），将签名从：

```typescript
const handleConversationSend = useCallback(async (content: string) => {
```

改为：

```typescript
const handleConversationSend = useCallback(async (content: string, attachments?: File[]) => {
```

在函数体中，发送消息后增加附件处理日志（MVP 阶段仅打印）：

```typescript
  const userMsg: ChatMessage = { role: 'user', content: content || `上传了 ${attachments?.length ?? 0} 个文件`, timestamp: new Date().toISOString() }
  if (attachments && attachments.length > 0) {
    console.log('[conversation] 附件:', attachments.map(f => f.name))
  }
```

- [ ] **Step 2: 运行全部测试**

Run: `cd /home/walker/lifeware/frontend && npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: adapt handleConversationSend to accept file attachments

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
