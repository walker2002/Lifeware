# AI 助手界面优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 AI 助手配置提示的误判，并改进新对话欢迎页体验。

**Architecture:** [001] 通过新增 Server Action 检查默认供应商配置来替代失效的 localStorage 判断；[002] 在 ConversationView 的空状态区域替换为居中欢迎页，包含意图快捷按钮、自动聚焦输入框和最近对话列表。

**Tech Stack:** Next.js Server Actions, React hooks (useEffect, useRef), Vitest + Testing Library

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/app/actions/llm-config.ts` | Modify | 新增 `checkLLMConfigured()` Server Action |
| `frontend/src/app/page.tsx` | Modify | 替换 `llmConfigured` 初始化逻辑 |
| `frontend/src/components/layout/conversation-view.tsx` | Modify | 欢迎页 UI + 自动聚焦 + 快捷按钮 |
| `frontend/src/components/layout/__tests__/conversation-view.test.tsx` | Modify | 更新空状态断言 + 欢迎页测试 |

---

### Task 1: 新增 `checkLLMConfigured` Server Action

**Files:**
- Modify: `frontend/src/app/actions/llm-config.ts`

- [ ] **Step 1: 在 `llm-config.ts` 末尾新增 Server Action**

在文件末尾（向后兼容别名行之前）添加：

```typescript
/** 检查默认供应商是否已配置 API Key 和默认模型 */
export async function checkLLMConfigured(): Promise<boolean> {
  const { getActiveProviderId, getMergedConfig } = await import('@/lib/llm/config')
  const providerId = getActiveProviderId()
  const config = getMergedConfig(providerId)
  const apiKey = process.env[config.apiKeyEnv]
  const hasApiKey = !!apiKey
  const hasModel = !!config.models.default && config.models.default !== 'unknown'
  return hasApiKey && hasModel
}
```

注意：`getActiveProviderId` 和 `getMergedConfig` 已经在文件顶部 import 的 `config.ts` 中导出，不需要动态 import。实际代码：

```typescript
/** 检查默认供应商是否已配置 API Key 和默认模型 */
export async function checkLLMConfigured(): Promise<boolean> {
  const providerId = getActiveProviderId()
  const config = getMergedConfig(providerId)
  const apiKey = process.env[config.apiKeyEnv]
  const hasApiKey = !!apiKey
  const hasModel = !!config.models.default && config.models.default !== 'unknown'
  return hasApiKey && hasModel
}
```

需要在文件顶部的 import 中追加 `getActiveProviderId` 和 `getMergedConfig`：

```typescript
import {
  getProviderSummaries,
  setCachedUserPrefs,
  getActiveProviderId,
  getMergedConfig,
  type ProviderSummary,
  type UserLLMPreferences,
} from '@/lib/llm/config'
```

- [ ] **Step 2: 验证修改无语法错误**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/actions/llm-config.ts
git commit -m "feat: add checkLLMConfigured server action"
```

---

### Task 2: 替换 page.tsx 中的 llmConfigured 判断

**Files:**
- Modify: `frontend/src/app/page.tsx:99`
- Modify: `frontend/src/app/page.tsx:1` (imports)

- [ ] **Step 1: 更新 import，添加 Server Action 引用**

在 `page.tsx` 顶部的 import 区域添加：

```typescript
import { checkLLMConfigured } from "./actions/llm-config"
```

- [ ] **Step 2: 替换 llmConfigured 初始化逻辑**

将第 99 行：

```typescript
const [llmConfigured] = useState(() => typeof window !== 'undefined' ? !!localStorage.getItem('lw-llm-config') : false);
```

替换为：

```typescript
const [llmConfigured, setLlmConfigured] = useState(true)
```

然后在已有的 `useEffect` 区域（`fetchDomainActions` 的 useEffect 附近）添加：

```typescript
useEffect(() => {
  checkLLMConfigured().then(setLlmConfigured)
}, [])
```

默认值设为 `true` 以避免服务端渲染时的闪烁（先显示提示再消失）。

- [ ] **Step 3: 验证编译**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: 无新增错误

- [ ] **Step 4: 启动 dev server 手动验证**

Run: `cd /home/walker/lifeware/frontend && npm run dev`

验证：左侧 AI 助手面板中，"请先配置大语言模型"提示不应再出现（因为 .env.local 中 dashscope 已配置）。如果移除 DASHSCOPE_API_KEY 环境变量，提示应重新出现。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "fix: replace broken localStorage check with server action for LLM config"
```

---

### Task 3: 更新 ConversationView 空状态测试

**Files:**
- Modify: `frontend/src/components/layout/__tests__/conversation-view.test.tsx`

- [ ] **Step 1: 更新空状态断言 + 新增欢迎页测试**

将现有的空状态测试：

```typescript
it('should show empty state when no messages', () => {
  render(
    <ConversationView
      messages={[]}
      onSendMessage={vi.fn()}
    />
  )
  expect(screen.getByText('开始新对话')).toBeInTheDocument()
})
```

替换为：

```typescript
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /home/walker/lifeware/frontend && npx vitest run src/components/layout/__tests__/conversation-view.test.tsx`
Expected: FAIL — 找不到 '有什么可以帮你的？' 文本（因为欢迎页还未实现）

- [ ] **Step 3: Commit 测试**

```bash
git add frontend/src/components/layout/__tests__/conversation-view.test.tsx
git commit -m "test: update conversation-view tests for welcome page"
```

---

### Task 4: 实现欢迎页 UI

**Files:**
- Modify: `frontend/src/components/layout/conversation-view.tsx`

- [ ] **Step 1: 扩展 props 接口，添加 recentSessions 和 onSelectSession**

将 `ConversationViewProps` 替换为：

```typescript
import type { AISessionSummary } from "@/usom/types/objects"

const DEFAULT_QUICK_ACTIONS = ['创建任务', '规划日程', '设定目标', '添加习惯', '能量记录']

interface ConversationViewProps {
  messages: ChatMessage[]
  onSendMessage: (content: string) => void
  isLoading?: boolean
  recentSessions?: AISessionSummary[]
  onSelectSession?: (sessionId: string) => void
}
```

- [ ] **Step 2: 更新组件签名，添加 inputRef 自动聚焦**

```typescript
export function ConversationView({ messages, onSendMessage, isLoading, recentSessions, onSelectSession }: ConversationViewProps) {
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
```

在 `useEffect` 区域（`bottomRef` 滚动的 useEffect 之后）添加：

```typescript
  useEffect(() => {
    if (messages.length === 0) {
      inputRef.current?.focus()
    }
  }, [messages.length])
```

- [ ] **Step 3: 替换空状态区域，实现欢迎页**

将 `<div className="flex-1 overflow-y-auto px-4 py-3">` 内部的空状态和消息列表替换为：

```tsx
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
```

- [ ] **Step 4: 给 input 添加 ref**

将 `<input` 标签添加 `ref={inputRef}`：

```tsx
<input
  ref={inputRef}
  type="text"
  value={input}
  onChange={e => setInput(e.target.value)}
  placeholder="输入消息..."
  className="flex-1 rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink placeholder:text-body/40 focus:outline-none focus:ring-1 focus:ring-primary"
  disabled={isLoading}
/>
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd /home/walker/lifeware/frontend && npx vitest run src/components/layout/__tests__/conversation-view.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/conversation-view.tsx
git commit -m "feat: add welcome page with quick actions and recent sessions to conversation view"
```

---

### Task 5: 在 page.tsx 中传递欢迎页所需 props

**Files:**
- Modify: `frontend/src/app/page.tsx:388-395`

- [ ] **Step 1: 给 ConversationView 传递 recentSessions 和 onSelectSession**

找到 `<ConversationView` 的渲染位置（约第 389-394 行），替换为：

```tsx
<ConversationView
  messages={conversationMessages}
  onSendMessage={handleConversationSend}
  isLoading={isLoading}
  recentSessions={sessions.slice(0, 3)}
  onSelectSession={handleSelectSession}
/>
```

- [ ] **Step 2: 运行全部测试**

Run: `cd /home/walker/lifeware/frontend && npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: 启动 dev server 手动验证**

Run: `cd /home/walker/lifeware/frontend && npm run dev`

验证步骤：
1. 点击左侧"+新对话"按钮
2. 主内容区应显示居中欢迎页，包含"有什么可以帮你的？"标题
3. 5 个快捷按钮可见（创建任务、规划日程等）
4. 如果有历史对话，下方应显示最近 3 个
5. 输入框自动获得焦点
6. 点击快捷按钮应自动发送消息

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: wire up welcome page with sessions data in page.tsx"
```
