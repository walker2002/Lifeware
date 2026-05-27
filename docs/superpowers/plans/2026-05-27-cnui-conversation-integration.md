# CN-UI 对话流集成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在对话流内渲染 CN-UI 表面，用户输入 `/createHabit` 后直接在对话中展示 HabitForm，无需页面导航。

**Architecture:** page.tsx 调用 `openCnuiSurface` server action 获取 CnuiSurfaceRef 数据，构造含 `cnuiSurface` 的 ChatMessage 加入对话流。conversation-view 检测 `cnuiSurface` 并渲染 CnuiRenderer → HabitCreationCard → CnuiFormAdapter → HabitForm。用户提交后调用 `submitCnuiSurface` → `submitHabitIntent` → Orchestrator 完成创建。

**Tech Stack:** Next.js Server Actions, React useState, CnuiRenderer, FormRegistry

**Spec:** `docs/superpowers/specs/2026-05-27-cnui-conversation-integration-design.md`

**Constitution 合规要点:**
- Conversation-closed-loop (CN-UI Protocol #3): CN-UI 在对话流内渲染，不导航
- Form Component Reuse (CN-UI Protocol #4): 通过 CnuiFormAdapter 复用 HabitForm
- Single-Writer (Principle III): onConfirm → submitCnuiSurface → submitHabitIntent → Orchestrator
- Domain Plugin (Principle VI): FormRegistry 注册在 Domain index.ts
- USOM Sovereignty (Principle IV): CnuiSurfaceRef 类型定义在 USOM 层

---

### Task 1: 添加 CnuiSurfaceRef 类型并扩展 ChatMessage

**Files:**
- Modify: `frontend/src/usom/types/objects.ts:332-338`

- [ ] **Step 1: 在 ChatMessage 上方添加 CnuiSurfaceRef 接口**

```typescript
// 在 ChatMessage 注释上方（约第 331 行之后）插入

/** CN-UI 表面引用（嵌入 ChatMessage 用于对话内渲染） */
export interface CnuiSurfaceRef {
  cnuiSurfaceId: string
  cnuiSurfaceType: string
  domainId: string
  action: string
  dataSnapshot?: Record<string, unknown>
}
```

- [ ] **Step 2: 扩展 ChatMessage 接口，添加 cnuiSurface 可选字段**

```typescript
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Timestamp
  intentRef?: string
  cnuiSurface?: CnuiSurfaceRef
}
```

- [ ] **Step 3: 验证类型编译**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

预期：无新增错误（CnuiSurfaceRef 是新增类型，ChatMessage 增加可选字段不破坏现有代码）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/usom/types/objects.ts
git commit -m "feat(usom): 添加 CnuiSurfaceRef 类型，扩展 ChatMessage 支持对话内 CN-UI 渲染"
```

---

### Task 2: 扩展 FormRegistry fieldMapping 覆盖所有表单字段

当前 `habits/index.ts` 的 fieldMapping 只映射了 5 个字段，HabitForm 有 12 个字段。未映射的字段（earliestTime、latestStartTime、minDuration、startDate 等）在 CnuiFormAdapter 的 `mapFormToData` 中会丢失。需要补全。

**Files:**
- Modify: `frontend/src/domains/habits/index.ts:32-48`

- [ ] **Step 1: 替换 fieldMapping 和 defaults 为完整版本**

```typescript
FormRegistry.register('habits', 'createHabit', {
  // SAFETY: HabitFormFields 是 Record<string, unknown> 的子类型，
  // 但 TypeScript 函数参数逆变导致类型不兼容。运行时安全。
  component: HabitForm as any,
  fieldMapping: {
    name: 'title',
    description: 'description',
    defaultTime: 'defaultTime',
    earliestTime: 'earliestTime',
    latestStartTime: 'latestStartTime',
    defaultDuration: 'defaultDuration',
    minDuration: 'minDuration',
    trackable: 'trackable',
    frequencyType: 'frequencyType',
    daysOfWeek: 'daysOfWeek',
    startDate: 'startDate',
    endDate: 'endDate',
  },
  defaults: {
    defaultTime: '07:00',
    earliestTime: '06:30',
    latestStartTime: '08:00',
    defaultDuration: 30,
    minDuration: 15,
    trackable: true,
    frequencyType: 'daily',
    daysOfWeek: [1, 2, 3, 4, 5],
    startDate: new Date().toISOString().slice(0, 10),
  },
})
```

- [ ] **Step 2: 验证现有 HabitForm 相关测试仍然通过**

Run: `cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -30`

预期：所有测试 PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domains/habits/index.ts
git commit -m "fix(habits): 补全 FormRegistry fieldMapping 覆盖 HabitForm 全部字段"
```

---

### Task 3: 添加 openCnuiSurface 和 submitCnuiSurface server actions

**Files:**
- Modify: `frontend/src/app/actions/intent.ts`

- [ ] **Step 1: 在 intent.ts 顶部添加 FormRegistry 导入**

在现有 `import { getRequiredFields, ... } from "@/domains/registry";` 行（第 23 行）之后添加：

```typescript
import { FormRegistry } from "@/lib/form-registry";
```

同时在 `@/domains/registry` 的导入中添加 `findDomain`：

```typescript
import { getRequiredFields, hasRequiredFields, getActionDescription, getIntentTriggerViewRoute, getViewRoute, findDomain } from "@/domains/registry";
```

- [ ] **Step 2: 在文件末尾（`parseHabitIntentOnly` 之后）添加 openCnuiSurface**

```typescript
// ─── CN-UI Surface Server Actions ──────────────────────────────────

import type { CnuiSurfaceRef } from "@/usom/types/objects";

export interface OpenCnuiSurfaceResult {
  content: string
  surface: CnuiSurfaceRef
}

/** 打开 CN-UI 表面（在对话流内渲染表单） */
export async function openCnuiSurface(
  domainId: string,
  action: string,
): Promise<OpenCnuiSurfaceResult> {
  // 从 manifest 的 generation_actions 获取 cnui_surface_type
  const domain = findDomain(domainId)
  const manifest = domain?.manifest as Record<string, any> | undefined
  const genActions = manifest?.generation_actions as Record<string, any> | undefined
  const genAction = genActions?.[action]
  const surfaceType: string = genAction?.cnui_surface_type ?? `${domainId}-${action}`

  // 从 FormRegistry 获取 defaults 作为初始 dataModel
  const config = FormRegistry.get(domainId, action)
  const dataModel = config?.defaults ? { ...config.defaults } : {}

  return {
    content: `请填写${action === 'createHabit' ? '习惯' : action}信息`,
    surface: {
      cnuiSurfaceId: crypto.randomUUID(),
      cnuiSurfaceType: surfaceType,
      domainId,
      action,
      dataSnapshot: dataModel,
    },
  }
}

/** 提交 CN-UI 表面数据 */
export async function submitCnuiSurface(
  _cnuiSurfaceId: string,
  domainId: string,
  action: string,
  fields: Record<string, unknown>,
): Promise<HabitActionResult> {
  // 通过 FormRegistry.fieldMapping 将 CN-UI dataModel 映射为 Domain 表单字段
  const config = FormRegistry.get(domainId, action)
  let mappedFields = fields
  if (config) {
    mappedFields = {}
    for (const [cnuiKey, formKey] of Object.entries(config.fieldMapping)) {
      if (cnuiKey in fields) {
        mappedFields[formKey] = fields[cnuiKey]
      }
    }
  }

  if (domainId === "habits" && action === "createHabit") {
    return submitHabitIntent(mappedFields as CreateHabitInput)
  }

  return { success: false, error: `Unknown CN-UI action: ${domainId}/${action}` }
}
```

- [ ] **Step 3: 验证编译**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

预期：无新增错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/actions/intent.ts
git commit -m "feat(intent): 添加 openCnuiSurface 和 submitCnuiSurface server actions"
```

---

### Task 4: CnuiRenderer 和 HabitCreationCard 支持 isLoading

CnuiFormAdapter 已有 `isLoading` prop，但 CnuiRenderer 和 HabitCreationCard 不传递它。需要透传。

**Files:**
- Modify: `frontend/src/components/cnui/CnuiRenderer.tsx`
- Modify: `frontend/src/components/cnui/surfaces/HabitCreationCard.tsx`

- [ ] **Step 1: 修改 CnuiRenderer.tsx 添加 isLoading prop**

```tsx
'use client'

import type { CnuiComponentType } from '@/nexus/ai-runtime/cnui/types'
import { HabitCreationCard } from './surfaces/HabitCreationCard'
import { TimeboxList } from './surfaces/TimeboxList'

interface CnuiRendererProps {
  surfaceType: CnuiComponentType
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  isLoading?: boolean
}

const SURFACE_RENDERERS: Record<string, React.ComponentType<CnuiRendererProps>> = {
  'habit-creation-card': HabitCreationCard,
  'timebox-list': TimeboxList,
}

export function CnuiRenderer({ surfaceType, dataModel, onDataChange, onConfirm, isLoading }: CnuiRendererProps) {
  const Renderer = SURFACE_RENDERERS[surfaceType]

  if (!Renderer) {
    return (
      <div className="rounded border border-dashed border-red-300 p-4 text-sm text-red-500">
        未知的卡片类型: {surfaceType}
      </div>
    )
  }

  return <Renderer surfaceType={surfaceType} dataModel={dataModel} onDataChange={onDataChange} onConfirm={onConfirm} isLoading={isLoading} />
}
```

- [ ] **Step 2: 修改 HabitCreationCard.tsx 添加 isLoading prop**

```tsx
'use client'

import { CnuiFormAdapter } from '../cnui-form-adapter'

interface HabitCreationCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  isLoading?: boolean
}

export function HabitCreationCard({ dataModel, onDataChange, onConfirm, isLoading }: HabitCreationCardProps) {
  return (
    <div className="w-full max-w-md">
      <div className="mb-3 text-sm font-medium text-ink">习惯创建</div>
      <CnuiFormAdapter
        domainId="habits"
        action="createHabit"
        dataModel={dataModel}
        onDataChange={onDataChange}
        onConfirm={onConfirm}
        isLoading={isLoading}
      />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/cnui/CnuiRenderer.tsx frontend/src/components/cnui/surfaces/HabitCreationCard.tsx
git commit -m "feat(cnui): CnuiRenderer 和 HabitCreationCard 透传 isLoading prop"
```

---

### Task 5: ConversationView 渲染 CN-UI 表面

**Files:**
- Modify: `frontend/src/components/layout/conversation-view.tsx`
- Modify: `frontend/src/components/layout/__tests__/conversation-view.test.tsx`

- [ ] **Step 1: 在 conversation-view.tsx 添加导入和 props**

在文件顶部导入区（第 1-6 行之后）添加：

```typescript
import { CnuiRenderer } from "@/components/cnui/CnuiRenderer"
```

在 `ConversationViewProps` 接口中添加 `onCnuiConfirm` 可选回调：

```typescript
interface ConversationViewProps {
  // ... 现有 props 保持不变 ...
  /** CN-UI 表面提交回调 */
  onCnuiConfirm?: (cnuiSurfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => void
}
```

- [ ] **Step 2: 在 ConversationView 组件中添加 CN-UI loading 状态和解构 prop**

在组件函数内部（`export function ConversationView(...)` 解构参数处），添加 `onCnuiConfirm` 解构和 loading 状态：

在现有 `const [input, setInput] = useState("")` 行之后添加：

```typescript
const [loadingSurfaceId, setLoadingSurfaceId] = useState<string | null>(null)
```

- [ ] **Step 3: 替换消息渲染区域，添加 CN-UI 表面渲染**

找到消息渲染区域（约第 251-262 行），替换为：

```tsx
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
    {msg.cnuiSurface && (
      <div className="mt-3 rounded-lg border border-hairline bg-surface-soft p-4">
        <CnuiRenderer
          surfaceType={msg.cnuiSurface.cnuiSurfaceType as any}
          dataModel={msg.cnuiSurface.dataSnapshot ?? {}}
          onDataChange={() => {}}
          onConfirm={async (data) => {
            if (!onCnuiConfirm) return
            setLoadingSurfaceId(msg.cnuiSurface!.cnuiSurfaceId)
            try {
              await onCnuiConfirm(msg.cnuiSurface!.cnuiSurfaceId, msg.cnuiSurface!.domainId, msg.cnuiSurface!.action, data)
            } finally {
              setLoadingSurfaceId(null)
            }
          }}
          isLoading={loadingSurfaceId === msg.cnuiSurface.cnuiSurfaceId}
        />
      </div>
    )}
  </div>
))}
```

- [ ] **Step 4: 编写 ConversationView CN-UI 渲染测试**

在 `conversation-view.test.tsx` 末尾添加：

```typescript
// ─── CN-UI 表面渲染测试 ──────────────────────────────────────────

vi.mock('@/components/cnui/CnuiRenderer', () => ({
  CnuiRenderer: ({ surfaceType, dataModel, onConfirm, isLoading }: any) => (
    <div data-testid="cnui-renderer" data-surface-type={surfaceType} data-loading={isLoading?.toString()}>
      <span>CN-UI: {surfaceType}</span>
      <button onClick={() => onConfirm({ name: '测试习惯', defaultTime: '07:00' })}>提交</button>
    </div>
  ),
}))

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

  it('should render CnuiRenderer when message has cnuiSurface', () => {
    render(
      <ConversationView
        messages={cnuiMessages}
        onSendMessage={vi.fn()}
      />
    )
    expect(screen.getByTestId('cnui-renderer')).toBeInTheDocument()
    expect(screen.getByText('CN-UI: habit-creation-card')).toBeInTheDocument()
  })

  it('should pass correct surfaceType to CnuiRenderer', () => {
    render(
      <ConversationView
        messages={cnuiMessages}
        onSendMessage={vi.fn()}
      />
    )
    const renderer = screen.getByTestId('cnui-renderer')
    expect(renderer).toHaveAttribute('data-surface-type', 'habit-creation-card')
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

  it('should not render CnuiRenderer for messages without cnuiSurface', () => {
    render(
      <ConversationView
        messages={messages}
        onSendMessage={vi.fn()}
      />
    )
    expect(screen.queryByTestId('cnui-renderer')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 5: 运行测试验证**

Run: `cd frontend && npx vitest run src/components/layout/__tests__/conversation-view.test.tsx --reporter=verbose`

预期：所有测试 PASS（包括新增的 4 个 CN-UI 渲染测试）

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/conversation-view.tsx frontend/src/components/layout/__tests__/conversation-view.test.tsx
git commit -m "feat(conversation): ConversationView 渲染 CN-UI 表面，支持对话内表单交互"
```

---

### Task 6: page.tsx 使用 CN-UI 内联渲染替代页面导航

**Files:**
- Modify: `frontend/src/app/page.tsx:443-457`
- Modify: `frontend/src/app/__tests__/page-mode-toggle.test.tsx`

- [ ] **Step 1: 在 page.tsx 顶部导入 openCnuiSurface 和 submitCnuiSurface**

找到现有的 `"use client"` 和 server action import 区域，确保以下导入存在：

```typescript
import { openCnuiSurface, submitCnuiSurface } from "@/app/actions/intent"
```

（注意：如果 `openCnuiSurface` 和 `submitCnuiSurface` 尚未被导入，添加到现有 `@/app/actions/intent` 导入语句中。）

- [ ] **Step 2: 添加 handleCnuiConfirm 回调函数**

在 `handleConversationSend` 函数之前或之后添加：

```typescript
/** 处理 CN-UI 表面提交 */
const handleCnuiConfirm = useCallback(
  async (cnuiSurfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => {
    try {
      const result = await submitCnuiSurface(cnuiSurfaceId, domainId, action, data)
      if (result.success) {
        const msg: ChatMessage = {
          role: 'assistant',
          content: `习惯"${result.habit?.title ?? ''}"创建成功！`,
          timestamp: new Date().toISOString(),
        }
        setConversationMessages(prev => [...prev, msg])
      } else {
        const msg: ChatMessage = {
          role: 'system',
          content: `创建失败: ${result.error}`,
          timestamp: new Date().toISOString(),
        }
        setConversationMessages(prev => [...prev, msg])
      }
    } catch {
      const msg: ChatMessage = {
        role: 'system',
        content: '网络错误，请重试',
        timestamp: new Date().toISOString(),
      }
      setConversationMessages(prev => [...prev, msg])
    }
  },
  [],
)
```

- [ ] **Step 3: 替换无 payload slash 命令的导航分支**

找到 `handleConversationSend` 中约第 443-457 行的 `else` 分支（当前代码为 `setMainViewState({ type: 'view', ... })`），替换为：

```typescript
} else {
  // 无附加内容 → 在对话流内打开 CN-UI 表面
  const targetDomain = resolvedDomainId || shortcut?.domainId || slashResult.domainId
  const targetAction = slashResult.action

  if (targetDomain && targetAction) {
    try {
      const result = await openCnuiSurface(targetDomain, targetAction)
      const cnuiMsg: ChatMessage = {
        role: 'assistant',
        content: result.content,
        timestamp: new Date().toISOString(),
        cnuiSurface: result.surface,
      }
      setConversationMessages(prev => [...prev, cnuiMsg])
    } catch {
      const errMsg: ChatMessage = { role: 'assistant', content: '打开表单失败，请重试', timestamp: new Date().toISOString() }
      setConversationMessages(prev => [...prev, errMsg])
    }
    return
  }
```

- [ ] **Step 4: 将 onCnuiConfirm 传递给 ConversationView**

找到渲染 `<ConversationView>` 的位置，添加 `onCnuiConfirm` prop：

```tsx
<ConversationView
  // ... 现有 props ...
  onCnuiConfirm={handleCnuiConfirm}
/>
```

- [ ] **Step 5: 更新 page-mode-toggle.test.tsx 的 mock**

在 `vi.mock('@/app/actions/intent', ...)` 中添加新的 server action mock：

```typescript
vi.mock('@/app/actions/intent', () => ({
  submitIntent: vi.fn().mockResolvedValue({
    success: true,
    timeboxes: [],
  }),
  submitTemplateIntent: vi.fn().mockResolvedValue({
    success: true,
    timeboxes: [],
  }),
  getTimeboxesByRange: vi.fn().mockResolvedValue([]),
  transitionTimebox: vi.fn().mockResolvedValue({ success: true }),
  submitExecutionIntent: vi.fn().mockResolvedValue({ success: true, timeboxes: [] }),
  submitBatchIntent: vi.fn().mockResolvedValue({ results: [] }),
  resolveShortcut: vi.fn().mockResolvedValue(null),
  fetchDomainActions: vi.fn().mockResolvedValue([]),
  submitDynamicIntent: vi.fn().mockResolvedValue({ success: true }),
  fetchActionData: vi.fn().mockResolvedValue({ hasFields: false, description: '' }),
  fetchIntentTriggers: vi.fn().mockResolvedValue([]),
  openCnuiSurface: vi.fn().mockResolvedValue({
    content: '请填写习惯信息',
    surface: {
      cnuiSurfaceId: 'test-id',
      cnuiSurfaceType: 'habit-creation-card',
      domainId: 'habits',
      action: 'createHabit',
      dataSnapshot: {},
    },
  }),
  submitCnuiSurface: vi.fn().mockResolvedValue({ success: true, habit: { title: '测试习惯' } }),
}))
```

- [ ] **Step 6: 运行全部测试验证**

Run: `cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -40`

预期：所有测试 PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/app/__tests__/page-mode-toggle.test.tsx
git commit -m "feat(page): /createHabit 无 payload 时在对话流内渲染 CN-UI 表面"
```

---

### Task 7: 端到端验证

- [ ] **Step 1: 启动开发服务器**

Run: `cd frontend && npm run dev`

- [ ] **Step 2: 手动验证流程**

1. 打开浏览器访问 `http://localhost:3000`
2. 在 AI 助手输入框输入 `/createHabit`
3. 验证：对话流内出现 HabitForm（习惯创建卡片），而不是页面导航到 HabitListPage
4. 填写习惯标题和时间
5. 点击"创建"按钮
6. 验证：对话中出现"习惯创建成功"消息
7. 验证：习惯列表页面中可以看到新创建的习惯

- [ ] **Step 3: 运行完整测试套件**

Run: `cd frontend && npx vitest run --reporter=verbose`

预期：所有测试 PASS

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ ChatMessage 增加 cnuiSurface 字段 → Task 1
- ✅ conversation-view 渲染 CnuiRenderer → Task 5
- ✅ openCnuiSurface server action → Task 3
- ✅ submitCnuiSurface server action → Task 3
- ✅ page.tsx 调用 openCnuiSurface 替代导航 → Task 6
- ✅ fieldMapping 补全防止数据丢失 → Task 2
- ✅ isLoading 透传 → Task 4

**2. Placeholder scan:** 无 TBD/TODO/占位符

**3. Type consistency:**
- CnuiSurfaceRef 定义在 Task 1，被 intent.ts（Task 3）和 conversation-view.tsx（Task 5）使用
- openCnuiSurface 返回 `{ content: string; surface: CnuiSurfaceRef }`，page.tsx 使用 `result.surface` 和 `result.content`
- submitCnuiSurface 参数 `(cnuiSurfaceId, domainId, action, data)` 与 conversation-view 的 onConfirm 回调参数一致
- isLoading 从 conversation-view → CnuiRenderer → HabitCreationCard → CnuiFormAdapter → HabitForm 透传

**4. Constitution 合规:**
- Conversation-closed-loop: ✅ CN-UI 在对话流内渲染
- Form Component Reuse: ✅ 通过 CnuiFormAdapter 复用 HabitForm
- Single-Writer: ✅ submitCnuiSurface → submitHabitIntent → Orchestrator
- Domain Plugin: ✅ FormRegistry 注册在 Domain index.ts
- USOM Sovereignty: ✅ CnuiSurfaceRef 定义在 USOM 层，不依赖 Nexus 类型
- Manifest Runtime Consumption: ✅ surfaceType 从 manifest.generation_actions 读取
