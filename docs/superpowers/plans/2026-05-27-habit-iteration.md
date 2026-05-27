# 习惯管理迭代优化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复习惯保存 Bug、优化 AI 助手界面和交互、统一习惯创建入口到 HabitListPage、建立 CN-UI 表单适配层通用机制。

**Architecture:** 四个需求合并为一个迭代。先修复独立 Bug（[005]），然后实施 AI 助手 UI 优化（[004]）和 GrowthMenu 入口修改（[006]），最后建立 FormRegistry + CnuiFormAdapter 通用基础设施并改造 HabitCreationCard（[007]）。所有新组件复用现有 Nexus 管道。

**Tech Stack:** Next.js App Router, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui

---

### Task 1: [005] 修复 manifest.yaml 中 ContextCapability 名称不匹配

**Files:**
- Modify: `frontend/src/domains/habits/manifest.yaml:220`

- [ ] **Step 1: 修复 existingHabits → activeHabits**

在 `generation_actions.createHabit.contexts` 中将 id 修正为与 `context-providers.ts` 注册名称一致。

修改第 220 行：
```yaml
generation_actions:
  createHabit:
    description: AI 辅助习惯创建，通过对话补全习惯参数
    contexts:
      - id: activeHabits          # ← 从 existingHabits 改为 activeHabits
        query: active_habits
        params: [userId]
      - id: habitTemplates
        query: habit_templates
        params: [userId]
    response_mode: cnui
    cnui_surface_type: habit-creation-card
    session_enabled: true
```

- [ ] **Step 2: 验证修复**

```bash
cd frontend && npm run dev
# 点击 "成长领域" → "习惯管理" → "新建习惯"
# 输入内容后点击保存，确认不再报 "Context capability not found: existingHabits"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domains/habits/manifest.yaml
git commit -m "fix(habits): 修复 generation_actions 中 existingHabits → activeHabits 名称不匹配

manifest.yaml 中 ContextCapability 引用了 existingHabits，
但 context-providers.ts 实际注册的是 activeHabits，
导致创建习惯时 Context Engine 查找失败。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: [004] 新增 fetchIntentTriggers server action

**Files:**
- Modify: `frontend/src/app/actions/intent.ts` (在 fetchDomainActions 之后新增)

- [ ] **Step 1: 新增 fetchIntentTriggers 函数**

在 intent.ts 中 `fetchDomainActions` 之后新增：

```typescript
// ─── 常用意图触发器 Server Action ─────────────────────────────────

export interface IntentTrigger {
  label: string
  shortcut: string
  domainId: string
  action: string
}

/** 从所有 Domain manifest 的 intent_triggers 动态读取有 shortcut 的意图 */
export async function fetchIntentTriggers(): Promise<IntentTrigger[]> {
  const { domainRegistry } = await import("@/domains/registry")
  const triggers: IntentTrigger[] = []
  for (const plugin of domainRegistry) {
    const items = plugin.manifest.intentTriggers
    if (!items) continue
    for (const t of items) {
      // 只返回有 shortcut 且不是 view_route 导航类的意图
      if (t.shortcut && !t.view_route) {
        triggers.push({
          label: t.description || t.action,
          shortcut: t.shortcut,
          domainId: plugin.manifest.domainId,
          action: t.action,
        })
      }
    }
  }
  return triggers
}
```

- [ ] **Step 2: 更新 page.tsx import**

在 `page.tsx` 的 import 中添加：
```typescript
import { submitIntent, submitTemplateIntent, getTimeboxesByRange, transitionTimebox, submitExecutionIntent, submitBatchIntent, resolveShortcut, fetchDomainActions, submitDynamicIntent, fetchActionData, parseHabitIntentOnly, fetchIntentTriggers } from "./actions/intent"
```

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npx tsc --noEmit
# 确认无类型错误
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/actions/intent.ts frontend/src/app/page.tsx
git commit -m "feat: 新增 fetchIntentTriggers server action — 从 manifest 动态读取常用意图

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: [004] ConversationView 布局调整 + 常用意图交互修改

**Files:**
- Modify: `frontend/src/components/layout/conversation-view.tsx`

- [ ] **Step 1: 更新 ConversationViewProps 接口，新增 intentTriggers prop**

修改第 10-16 行的接口定义：
```typescript
interface IntentTrigger {
  label: string
  shortcut: string
  domainId: string
  action: string
}

interface ConversationViewProps {
  messages: ChatMessage[]
  onSendMessage: (content: string, attachments?: File[]) => void
  isLoading?: boolean
  recentSessions?: AISessionSummary[]
  onSelectSession?: (sessionId: string) => void
  intentTriggers?: IntentTrigger[]
}
```

删除第 8 行的硬编码常量 `DEFAULT_QUICK_ACTIONS`：
```typescript
// 删除：const DEFAULT_QUICK_ACTIONS = ['创建任务', '规划日程', '设定目标', '添加习惯', '能量记录']
```

- [ ] **Step 2: 重构空对话界面布局**

替换第 144-181 行的空对话状态 JSX：

```tsx
{messages.length === 0 ? (
  <div className="flex flex-1 flex-col items-center pt-[15vh] px-4">
    {/* 标题 */}
    <h2 className="text-lg font-semibold text-ink">有什么可以帮你的？</h2>

    {/* 输入框区域 — 附件内置在输入框内 */}
    <form onSubmit={handleSubmit} className="mt-8 w-full max-w-xl">
      <div className="rounded-md border border-hairline bg-background p-2">
        {/* 附件标签（输入框内部上方） */}
        {attachmentTags}
        {/* 输入行：附件按钮 + 输入框 + 发送按钮 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-body/50 hover:text-body transition-colors p-1 shrink-0"
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
    {intentTriggers && intentTriggers.length > 0 && (
      <div className="mt-4 flex max-w-xl flex-wrap justify-center gap-2">
        {intentTriggers.map(trigger => (
          <button
            key={`${trigger.domainId}:${trigger.action}`}
            type="button"
            onClick={() => {
              setInput(trigger.shortcut + " ")
              inputRef.current?.focus()
            }}
            className="rounded-full border border-hairline px-3 py-1.5 text-sm text-body hover:bg-surface-soft hover:text-ink transition-colors"
          >
            {trigger.label} ({trigger.shortcut})
          </button>
        ))}
      </div>
    )}

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
```

- [ ] **Step 3: 更新 page.tsx 中 ConversationView 调用，传入 intentTriggers**

在 `page.tsx` 中添加状态和 effect：

```typescript
// 在状态定义区域（约第 94 行后）添加：
const [intentTriggers, setIntentTriggers] = useState<Awaited<ReturnType<typeof fetchIntentTriggers>>>([])

// 在 fetchDomainActions effect 后（约第 100 行后）添加：
useEffect(() => {
  fetchIntentTriggers()
    .then(setIntentTriggers)
    .catch(err => console.error('[fetchIntentTriggers] 加载失败:', err))
}, [])
```

然后在 `renderMainContent` 中 `ConversationView` 调用处（约第 466 行）传入：
```tsx
<ConversationView
  messages={conversationMessages}
  onSendMessage={handleConversationSend}
  isLoading={isLoading}
  recentSessions={sessions.slice(0, 3)}
  onSelectSession={handleSelectSession}
  intentTriggers={intentTriggers}
/>
```

- [ ] **Step 4: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: 手动验证 UI**

```bash
cd frontend && npm run dev
# 打开浏览器访问 localhost:3000
# 确认：新对话界面中附件按钮在输入框内部、常用意图在输入框下方、格式为 "意图名称 (/shortcut)"
# 点击常用意图确认填入输入框而非直接发送
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/conversation-view.tsx frontend/src/app/page.tsx
git commit -m "feat: AI 助手新对话界面布局优化 + 常用意图交互改为填入输入框

- 附件按钮内置于输入框，常用意图移至输入框下方
- 常用意图从 manifest 动态加载，显示格式：意图名称 (/shortcut)
- 点击常用意图填入 /shortcut 到输入框，不直接提交
- 新对话界面整体上移减少空白

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: [004] 新对话行为修正

**Files:**
- Modify: `frontend/src/app/page.tsx:326-334` (handleNewSession)

- [ ] **Step 1: 修改 handleNewSession**

替换第 326-334 行的 `handleNewSession`：

```typescript
const handleNewSession = useCallback(() => {
  // 如果当前有空会话（无实质消息），不创建新会话，直接显示空对话界面
  const hasSubstantialMessages = conversationMessages.some(
    m => m.role === 'user' || (m.role === 'assistant' && m.content.trim().length > 0)
  )
  if (!hasSubstantialMessages && mainViewState.type === 'conversation') {
    // 直接清空并停留在空对话界面
    setConversationMessages([])
    return
  }

  // 清理当前对话消息，显示空对话界面
  setConversationMessages([])

  const newId = crypto.randomUUID()
  setSessions(prev => [{
    id: newId, title: '新对话', status: 'active',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }, ...prev])
  setMainViewState({ type: 'conversation', sessionId: newId })
  setActiveSessionId(newId)
}, [conversationMessages, mainViewState])
```

- [ ] **Step 2: 验证编译和行为**

```bash
cd frontend && npx tsc --noEmit && npm run dev
# 测试1: 在已有对话中点击"新对话" → 确认主界面刷新为空对话
# 测试2: 空对话中反复点击"新对话" → 确认不创建多个空会话
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "fix: 新对话行为修正 — 已有对话中点新对话刷新界面，重复点击不产生空会话

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: [006] GrowthMenu 习惯创建入口改为直接导航到 HabitListPage

**Files:**
- Modify: `frontend/src/app/page.tsx:336-339` (handleGrowthAction)

- [ ] **Step 1: 修改 handleGrowthAction**

`handleGrowthAction` 当前对所有 action 都设置 `type: 'action'`。需要特殊处理 `createHabit`——当点击 habits 域的 createHabit 时，直接导航到 HabitListPage（type: 'view'）。

替换第 336-339 行：

```typescript
const handleGrowthAction = useCallback((domainId: string, action: string) => {
  saveCurrentConversation()
  // createHabit 直接导航到 HabitListPage（type: 'view'）打开编辑面板
  if (domainId === 'habits' && action === 'createHabit') {
    setMainViewState({ type: 'view', domainId, action })
  } else {
    setMainViewState({ type: 'action', domainId, action })
  }
}, [saveCurrentConversation])
```

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: 手动验证**

```bash
cd frontend && npm run dev
# 点击 "成长领域" → "习惯管理" 下面的 "创建一个新习惯"
# 确认直接进入 HabitListPage 并自动打开编辑面板（而非显示 DynamicForm）
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: GrowthMenu 习惯创建改为直接导航到 HabitListPage 编辑面板

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: [007] 创建 FormRegistry + CnuiFormAdapter 基础设施

**Files:**
- Create: `frontend/src/components/cnui/cnui-form-adapter.tsx`
- Create: `frontend/src/lib/form-registry.ts`

- [ ] **Step 1: 创建 FormRegistry**

新建 `frontend/src/lib/form-registry.ts`：

```typescript
import type { ComponentType } from 'react'

export interface FormAdapterConfig {
  component: ComponentType<FormAdapterProps>
  /** CN-UI dataModel key → Form field name 的双向映射 */
  fieldMapping: Record<string, string>
  /** 默认值（创建新对象时使用） */
  defaults: Record<string, unknown>
}

export interface FormAdapterProps {
  initial?: Record<string, unknown>
  onSubmit: (fields: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
}

class FormRegistryClass {
  private configs = new Map<string, FormAdapterConfig>()

  register(domainId: string, action: string, config: FormAdapterConfig): void {
    this.configs.set(`${domainId}:${action}`, config)
  }

  get(domainId: string, action: string): FormAdapterConfig | undefined {
    return this.configs.get(`${domainId}:${action}`)
  }

  has(domainId: string, action: string): boolean {
    return this.configs.has(`${domainId}:${action}`)
  }
}

export const FormRegistry = new FormRegistryClass()
```

- [ ] **Step 2: 创建 CnuiFormAdapter**

新建 `frontend/src/components/cnui/cnui-form-adapter.tsx`：

```typescript
'use client'

import { FormRegistry } from '@/lib/form-registry'
import type { FormAdapterConfig, FormAdapterProps } from '@/lib/form-registry'

interface CnuiFormAdapterProps {
  domainId: string
  action: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
}

/** 将 CN-UI dataModel 映射为 Form 的 initial props */
function mapDataToForm(
  dataModel: Record<string, unknown>,
  mapping: Record<string, string>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults }
  for (const [cnuiKey, formKey] of Object.entries(mapping)) {
    if (cnuiKey in dataModel) {
      result[formKey] = dataModel[cnuiKey]
    }
  }
  return result
}

/** 将 Form 提交的 fields 映射回 CN-UI dataModel */
function mapFormToData(
  formFields: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [cnuiKey, formKey] of Object.entries(mapping)) {
    if (formKey in formFields) {
      result[cnuiKey] = formFields[formKey]
    }
  }
  return result
}

export function CnuiFormAdapter({ domainId, action, dataModel, onDataChange, onConfirm }: CnuiFormAdapterProps) {
  const config = FormRegistry.get(domainId, action)

  if (!config) {
    return (
      <div className="rounded border border-dashed border-red-300 p-4 text-sm text-red-500">
        表单未注册: {domainId}/{action}
      </div>
    )
  }

  const mappedData = mapDataToForm(dataModel, config.fieldMapping, config.defaults)
  const FormComponent = config.component

  return (
    <FormComponent
      initial={mappedData}
      onSubmit={(fields: Record<string, unknown>) => {
        onConfirm(mapFormToData(fields, config.fieldMapping))
      }}
      onCancel={() => onDataChange(dataModel)}
    />
  )
}
```

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/form-registry.ts frontend/src/components/cnui/cnui-form-adapter.tsx
git commit -m "feat: 新增 FormRegistry + CnuiFormAdapter — CN-UI 表单适配层通用基础设施

FormRegistry 允许 Domain 注册 action 对应的 Form 组件。
CnuiFormAdapter 将 CN-UI dataModel 映射为 Form props，在 CN-UI 表面中渲染 Domain Form。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: [007] 在 habits/index.ts 中注册 HabitForm

**Files:**
- Modify: `frontend/src/domains/habits/index.ts`

- [ ] **Step 1: 注册 HabitForm 到 FormRegistry**

在 `index.ts` 末尾追加：

```typescript
// ─── CN-UI Form 适配器注册 ──────────────────────────────────────
import { HabitForm } from './components/habit-form'
import { FormRegistry } from '@/lib/form-registry'

FormRegistry.register('habits', 'createHabit', {
  component: HabitForm as any,
  fieldMapping: {
    name: 'title',
    defaultTime: 'defaultTime',
    defaultDuration: 'defaultDuration',
    frequencyType: 'frequencyType',
    trackable: 'trackable',
  },
  defaults: {
    defaultDuration: 30,
    trackable: true,
    frequencyType: 'daily',
  },
})
```

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domains/habits/index.ts
git commit -m "feat: habits Domain 注册 HabitForm 到 FormRegistry 支持 CN-UI 表单适配

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: [007] HabitCreationCard 重构为薄适配层

**Files:**
- Modify: `frontend/src/components/cnui/surfaces/HabitCreationCard.tsx`

- [ ] **Step 1: 重写 HabitCreationCard**

用以下内容替换整个文件：

```typescript
'use client'

import { CnuiFormAdapter } from '../cnui-form-adapter'

interface HabitCreationCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
}

export function HabitCreationCard({ dataModel, onDataChange, onConfirm }: HabitCreationCardProps) {
  return (
    <div className="w-full max-w-md">
      <div className="mb-3 text-sm font-medium text-ink">习惯创建</div>
      <CnuiFormAdapter
        domainId="habits"
        action="createHabit"
        dataModel={dataModel}
        onDataChange={onDataChange}
        onConfirm={onConfirm}
      />
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/cnui/surfaces/HabitCreationCard.tsx
git commit -m "refactor: HabitCreationCard 改为薄适配层，通过 CnuiFormAdapter 渲染 HabitForm

不再自己维护字段和验证逻辑，所有表单实现以 HabitForm 为唯一来源。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: [007] 创建通用 slash 命令解析器

**Files:**
- Create: `frontend/src/lib/slash-command.ts`

- [ ] **Step 1: 创建 slash-command.ts**

新建 `frontend/src/lib/slash-command.ts`：

```typescript
export interface SlashCommandResult {
  isSlashCommand: true
  hasPayload: boolean
  domainId: string
  action: string
  payload?: string
}

export interface NoSlashCommandResult {
  isSlashCommand: false
}

export type SlashResolveResult = SlashCommandResult | NoSlashCommandResult

// 匹配 /actionName 或 /actionName 内容 或 /domain:action
const SLASH_RE = /^\/([\w-]+)(?::([\w-]+))?(?:\s+(.+))?$/

/**
 * 解析用户输入中的 slash 命令。
 *
 * 返回格式：
 * - "/createHabit"          → { isSlashCommand: true, hasPayload: false, domainId: "habits", action: "createHabit" }
 * - "/createHabit 每天跑步"  → { isSlashCommand: true, hasPayload: true, domainId: "habits", action: "createHabit", payload: "每天跑步" }
 * - "帮我创建习惯"          → { isSlashCommand: false }
 *
 * 需要在调用方通过 FormRegistry.has(domainId, action) 确认该 action 是否注册了表单，
 * 以区分 "需要在对话流渲染 Form" 和 "需要导航到页面" 两种场景。
 */
export function resolveSlashCommand(
  rawInput: string,
): SlashResolveResult {
  const trimmed = rawInput.trim()
  const match = trimmed.match(SLASH_RE)

  if (!match) {
    return { isSlashCommand: false }
  }

  const [, first, second, rest] = match

  if (second) {
    // 长格式: /domain:action
    return {
      isSlashCommand: true,
      hasPayload: !!rest?.trim(),
      domainId: first,
      action: second,
      payload: rest?.trim(),
    }
  }

  // 短格式: /actionName — 需要通过 shortcut 反向查找 domainId
  // 这里只做解析，由调用方通过 registry 完成查找
  return {
    isSlashCommand: true,
    hasPayload: !!rest?.trim(),
    domainId: '', // 由调用方填充（通过 shortcut 查找）
    action: first,
    payload: rest?.trim(),
  }
}
```

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/slash-command.ts
git commit -m "feat: 新增 slash-command 通用解析器

解析 /actionName 格式输入，区分有 payload 和无 payload 场景。
搭配 FormRegistry 支持通用空意图处理。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: [007] 集成 slash 命令处理到 handleConversationSend

**Files:**
- Modify: `frontend/src/app/page.tsx:26,341-425` (imports + handleConversationSend)

- [ ] **Step 1: 添加 imports**

在 page.tsx 第 26 行后追加：
```typescript
import { resolveSlashCommand } from "@/lib/slash-command"
```

当前第 27 行附近已有 `import { checkLLMConfigured }` 等 import。在现有 import 区域追加 `resolveSlashCommand`。

- [ ] **Step 2: 修改 handleConversationSend 中的创建习惯拦截逻辑**

当前逻辑（第 350-382 行）：
1. `resolveShortcut(content)` → view_route 导航
2. `parseHabitIntentOnly(content)` → 如果 createHabit 且有字段 → 导航到 HabitListPage
3. `submitIntent(content)` → 通用管道

需要修改为：当 `/createHabit` 无附加内容时，跳过 parseHabitIntentOnly 拦截，让 submitIntent 走 Handler → CN-UI 管道。

在 `resolveShortcut` 检查之后（约第 362 行），将 `parseHabitIntentOnly` 拦截替换为：

```typescript
    // slash 命令 — 空意图在对话流中渲染 CN-UI Form
    const slashResult = resolveSlashCommand(content)
    if (slashResult.isSlashCommand) {
      const { action, hasPayload, payload } = slashResult

      if (hasPayload && payload) {
        // 有附加内容 → AI 解析字段 → 导航到 HabitListPage 填入
        setIsLoading(true)
        const habitParse = await parseHabitIntentOnly(content)
        if (habitParse.success && habitParse.action === 'createHabit' && habitParse.fields) {
          setMainViewState({
            type: 'view',
            domainId: 'habits',
            action: 'createHabit',
            initialFields: habitParse.fields,
          })
          const navMsg: ChatMessage = {
            role: 'assistant',
            content: HABIT_USER_FACING.INTENT_RECOGNIZED,
            timestamp: new Date().toISOString(),
          }
          setConversationMessages(prev => [...prev, navMsg])
          setIsLoading(false)
          return
        }
        setIsLoading(false)
      } else {
        // 无附加内容 → 让 submitIntent 走 Handler → CN-UI 管道
        // 不拦截，继续执行下面的 submitIntent
        setIsLoading(true)
        try {
          const result = await submitIntent(content, false, traceEnabled)
          setTimeboxes(result.timeboxes)
          const responseContent = result.success
            ? (result.actionSurface
              ? `[CN-UI] 请填写 ${action} 表单`
              : '已处理你的请求。')
            : (result.error ?? '处理失败')
          const aiMsg: ChatMessage = {
            role: 'assistant',
            content: responseContent,
            timestamp: new Date().toISOString(),
          }
          setConversationMessages(prev => [...prev, aiMsg])
        } catch {
          const errMsg: ChatMessage = {
            role: 'assistant',
            content: '网络错误，请重试',
            timestamp: new Date().toISOString(),
          }
          setConversationMessages(prev => [...prev, errMsg])
        } finally {
          setIsLoading(false)
        }
        return
      }
    }

    // 非 slash 命令的自然语言习惯创建 → AI 解析 → 导航到 HabitListPage
    setIsLoading(true)
    try {
      const habitParse = await parseHabitIntentOnly(content)
      if (habitParse.success && habitParse.action === 'createHabit' && habitParse.fields) {
        setMainViewState({
          type: 'view',
          domainId: 'habits',
          action: 'createHabit',
          initialFields: habitParse.fields,
        })
        const navMsg: ChatMessage = {
          role: 'assistant',
          content: HABIT_USER_FACING.INTENT_RECOGNIZED,
          timestamp: new Date().toISOString(),
        }
        setConversationMessages(prev => [...prev, navMsg])
        setIsLoading(false)
        return
      }

      const result = await submitIntent(content, false, traceEnabled)
      // ... 保持原有 submitIntent 后续逻辑不变
```

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: 集成 slash 命令处理 — /createHabit 无内容时走 CN-UI Handler 管道

有附加内容（如 /createHabit 每天跑步）仍走 AI 解析 → HabitListPage 路径。
无附加内容走 submitIntent → Handler → CN-UI HabitCreationCard → HabitForm。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: 宪章 PATCH 追加 — 表单组件复用约束

**Files:**
- Modify: `.specify/memory/constitution.md`

- [ ] **Step 1: 追加约束到 CN-UI Protocol Constraints 章节**

在 `### CN-UI Protocol Constraints` 章节末尾（第 695 行 `**Rationale**:` 之前）追加：

```markdown
4. **Form Component Reuse Constraint**: 当 CN-UI 表面需要渲染与 Domain 页面编辑面板相同的表单时，
   MUST 通过适配层（CnuiFormAdapter）复用 Domain 的 Form 组件，MUST NOT 维护独立的字段定义和验证逻辑。
   Domain 的 Form 组件是表单实现的唯一来源。新 Domain 只需注册 FormAdapterConfig 即可在三种上下文
   （页面编辑面板、GrowthMenu 入口、AI 助手 CN-UI）中复用同一表单实现。
```

- [ ] **Step 2: 更新版本号**

将 constitution.md 第一行版本从 `1.7.0 → 1.7.1` 更新为 `1.7.1 → 1.7.2`：
```
Sync Impact Report
==================
Version change: 1.7.1 → 1.7.2
Rationale: PATCH — Added Form Component Reuse Constraint to CN-UI Protocol
Constraints: forms MUST reuse Domain components via adapters, not maintain 
independent field definitions.
```

并更新文件末尾的版本行：
```
**Version**: 1.7.2 | **Ratified**: 2026-05-02 | **Last Amended**: 2026-05-27
```

- [ ] **Step 3: Commit**

```bash
git add .specify/memory/constitution.md
git commit -m "docs: 宪章 PATCH 1.7.2 — 追加 CN-UI 表单组件复用约束

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: 端到端验证

- [ ] **Step 1: TypeScript 全面检查**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 2: Lint 检查**

```bash
cd frontend && npm run lint
```

- [ ] **Step 3: 功能验证清单**

| 测试点 | 预期结果 |
|---|---|
| 点击 GrowthMenu "创建一个新习惯" | 直接进入 HabitListPage 编辑面板 |
| 在 AI 助手输入 "/createHabit" 无参数 | 在对话流中渲染 HabitForm |
| 在 AI 助手输入 "/createHabit 每天跑步" | AI 解析字段后导航到 HabitListPage |
| 新对话界面布局 | 附件按钮内置，常用意图在输入框下方 |
| 点击常用意图 "添加习惯" | 输入框填入 "/createHabit " |
| 已有对话中点击"新对话" | 主界面刷新为空对话 |
| 空对话反复点击"新对话" | 不产生多余空会话 |
| 新建习惯并保存 | 成功保存，不再报 Context capability 错误 |

