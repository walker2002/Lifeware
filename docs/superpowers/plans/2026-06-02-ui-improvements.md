# UI 改进实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 CN-UI 过期状态 Bug、优化确认对话框遮罩透明度、为 Domain Page 添加 Banner

**Architecture:** 三项改动相互独立，按 [002] → [003] → [001] 顺序实施。[002] 为纯 CSS 调整，[003] 为纯前端展示组件，[001] 涉及后端 session stateSnapshot 持久化。

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui, Drizzle ORM, PostgreSQL

---

## 文件结构

| 文件 | 操作 | 说明 |
|---|---|---|
| `frontend/src/components/ui/alert-dialog.tsx` | 修改 | 给 `AlertDialogContent` 增加 `overlayClassName` prop |
| `frontend/src/app/globals.css` | 修改 | 新增 `--scrim-cnui` CSS 变量 |
| `frontend/src/components/cnui/cnui-confirm-dialog.tsx` | 修改 | 使用自定义 overlay className |
| `frontend/src/components/layout/page-banner.tsx` | 创建 | 共享 PageBanner 组件 |
| `frontend/src/app/page.tsx` | 修改 | Home Page 引入 Banner |
| `frontend/src/domains/habits/pages/HabitListPage.tsx` | 修改 | Habits Page 引入 Banner |
| `frontend/src/app/actions/session.ts` | 修改 | 新增 `saveSurfaceOutcome` 和 `getSessionSurfaceOutcomes` |
| `frontend/src/hooks/use-conversation.ts` | 修改 | `handleSurfaceStateChange` 持久化到后端 |
| `frontend/src/components/layout/conversation-view.tsx` | 修改 | `initialSurfaceStates` 从后端恢复 |

---

## Task 1: 给 AlertDialogContent 增加 overlayClassName prop

**Files:**
- Modify: `frontend/src/components/ui/alert-dialog.tsx:54-75`

- [ ] **Step 1: 修改 AlertDialogContent 接口**

```typescript
function AlertDialogContent({
  className,
  size = "default",
  overlayClassName,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: "default" | "sm"
  overlayClassName?: string
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay className={overlayClassName} />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          "group/alert-dialog-content fixed top-[50%] left-[50%] z-modal grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[size=sm]:max-w-xs data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[size=default]:sm:max-w-lg",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/walker/lifeware/frontend
git add src/components/ui/alert-dialog.tsx
git commit -m "feat(ui): AlertDialogContent 支持 overlayClassName prop

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 新增 --scrim-cnui CSS 变量并更新 CnuiConfirmDialog

**Files:**
- Modify: `frontend/src/app/globals.css:44,264`
- Modify: `frontend/src/components/cnui/cnui-confirm-dialog.tsx:50-62`

- [ ] **Step 1: 在 globals.css 浅色模式区域新增 --scrim-cnui**

在 `:root` 中（第 44 行 `--scrim` 下方）新增：

```css
  --scrim-cnui: rgba(20,20,19,0.3);
```

- [ ] **Step 2: 在 globals.css 暗色模式区域新增 --scrim-cnui**

在 `.dark` 中（第 264 行 `--scrim` 下方）新增：

```css
  --scrim-cnui: rgba(0,0,0,0.4);
```

- [ ] **Step 3: 修改 CnuiConfirmDialog 使用自定义 overlay**

```tsx
export function CnuiConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = '确认',
  cancelLabel = '取消',
}: CnuiConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <AlertDialogContent overlayClassName="bg-[var(--scrim-cnui)]">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 4: 启动 dev server 验证遮罩效果**

```bash
cd /home/walker/lifeware/frontend
npm run dev
```

在浏览器中打开 http://localhost:3000，切换到暗色模式，触发一个 CN-UI surface 的保存/取消操作，确认二次确认对话框的遮罩层是半透明而非全黑。

- [ ] **Step 5: Commit**

```bash
cd /home/walker/lifeware/frontend
git add src/app/globals.css src/components/cnui/cnui-confirm-dialog.tsx
git commit -m "fix(ui): CN-UI 确认对话框遮罩改为半透明

- 新增 --scrim-cnui CSS 变量（浅色 0.3 / 暗色 0.4）
- CnuiConfirmDialog 使用自定义 overlay className

Closes [002]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 创建 PageBanner 组件

**Files:**
- Create: `frontend/src/components/layout/page-banner.tsx`

- [ ] **Step 1: 创建 PageBanner 组件**

```tsx
/**
 * @file page-banner
 * @brief Domain Page 顶部 Banner 组件
 *
 * 根据 domainId 自动匹配 banner 图片，随机选择一张展示。
 * 宽度自适应，高度固定 80px。
 */

'use client'

import { useState, useMemo } from 'react'

/**
 * Domain 与 Banner 图片的映射表
 * 新 Domain 只需在此注册图片路径即可自动支持 Banner
 */
const DOMAIN_BANNER_MAP: Record<string, string[]> = {
  home: ['/banner-lifeware1.png', '/banner-lifeware2.png'],
  habits: ['/banner-habits1.png', '/banner-habits2.png', '/banner-habits3.png'],
  tasks: ['/banner-tasks1.png', '/banner-tasks2.png', '/banner-tasks3.png'],
  timebox: ['/banner-timebox1.png', '/banner-timebox2.png'],
  okrs: ['/banner-OKRs1.png', '/banner-OKRs2.png'],
}

/**
 * PageBanner 组件属性
 */
export interface PageBannerProps {
  /** Domain 标识，用于匹配 banner 图片前缀 */
  domainId: string
  /** 页面标题 */
  title: string
}

/**
 * PageBanner — Domain Page 顶部 Banner
 *
 * @param domainId - Domain 标识
 * @param title - 页面标题
 */
export function PageBanner({ domainId, title }: PageBannerProps) {
  const bannerSrc = useMemo(() => {
    const images = DOMAIN_BANNER_MAP[domainId]
    if (!images || images.length === 0) return null
    return images[Math.floor(Math.random() * images.length)]
  }, [domainId])

  return (
    <div className="w-full">
      {/* Banner 图片 */}
      <div className="relative h-[80px] w-full overflow-hidden">
        {bannerSrc ? (
          <img
            src={bannerSrc}
            alt={`${title} banner`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-surface-soft" />
        )}
      </div>
      {/* 标题 */}
      <div className="px-4 py-3">
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/walker/lifeware/frontend
git add src/components/layout/page-banner.tsx
git commit -m "feat(ui): 创建共享 PageBanner 组件

- 支持按 domainId 自动匹配 banner 图片
- 图片随机选择，高度固定 80px
- 标题区域使用 design token

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Home Page 集成 Banner

**Files:**
- Modify: `frontend/src/app/page.tsx:16,102-119`

- [ ] **Step 1: 导入 PageBanner**

在 `frontend/src/app/page.tsx` 的 import 区域新增：

```tsx
import { PageBanner } from "@/components/layout/page-banner"
```

- [ ] **Step 2: 在 AppShell mainContent 上方添加 Banner**

找到 `mainContent` 的定义（约第 94 行），在其外层包裹 Banner：

```tsx
  const mainContentWithBanner = (
    <div className="flex h-full flex-col">
      {mainViewState.type === 'schedule' && (
        <PageBanner domainId="home" title="我的时间盒" />
      )}
      <div className="flex-1 overflow-auto">
        {mainContent}
      </div>
    </div>
  )
```

- [ ] **Step 3: 将 AppShell 的 mainContent prop 改为 mainContentWithBanner**

找到 `<AppShell` 的调用（约第 103 行），将 `mainContent={mainContent}` 改为 `mainContent={mainContentWithBanner}`。

- [ ] **Step 4: Commit**

```bash
cd /home/walker/lifeware/frontend
git add src/app/page.tsx
git commit -m "feat(ui): Home Page 添加 Banner

- 在 schedule 视图顶部展示 PageBanner
- 标题固定为"我的时间盒"
- 使用 banner-lifeware 图片

Closes [003] for Home

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Habits Page 集成 Banner

**Files:**
- Modify: `frontend/src/domains/habits/pages/HabitListPage.tsx:13,274-290`

- [ ] **Step 1: 导入 PageBanner**

在 `frontend/src/domains/habits/pages/HabitListPage.tsx` 的 import 区域新增：

```tsx
import { PageBanner } from "@/components/layout/page-banner"
```

- [ ] **Step 2: 在页面最外层添加 Banner**

找到返回的 JSX（约第 274 行的 `<div className="flex flex-col gap-4">`），在其内部最上方添加：

```tsx
      <PageBanner domainId="habits" title="习惯管理" />
```

修改后的结构：

```tsx
  return (
    <div className="flex flex-col gap-4">
      <PageBanner domainId="habits" title="习惯管理" />

      {/* 错误横幅 */}
      {submitError && (
        ...
```

- [ ] **Step 3: Commit**

```bash
cd /home/walker/lifeware/frontend
git add src/domains/habits/pages/HabitListPage.tsx
git commit -m "feat(ui): Habits Page 添加 Banner

- 在页面顶部展示 PageBanner
- 标题为"习惯管理"
- 使用 banner-habits 图片

Closes [003] for Habits

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 新增 saveSurfaceOutcome server action

**Files:**
- Modify: `frontend/src/app/actions/session.ts:160-170`

- [ ] **Step 1: 在 session.ts 中新增 saveSurfaceOutcome**

在 `tryGenerateTitle` 函数之后（文件末尾之前）新增：

```typescript
/**
 * 保存 CN-UI surface 的最终状态到 session stateSnapshot
 *
 * @param sessionId - 会话 ID
 * @param surfaceId - surface ID
 * @param state - 最终状态（saved / cancelled）
 * @param dataModel - surface 数据快照（可选）
 */
export async function saveSurfaceOutcome(
  sessionId: string,
  surfaceId: string,
  state: 'saved' | 'cancelled',
  dataModel?: Record<string, unknown>,
): Promise<void> {
  const session = await sessionRepo.findById(sessionId, MVP_USER_ID)
  if (!session) return

  const currentSnapshot = session.stateSnapshot ?? {}
  const surfaceStates = (currentSnapshot.cnuiSurfaceStates as Record<string, unknown> | undefined) ?? {}

  const updatedSnapshot = {
    ...currentSnapshot,
    cnuiSurfaceStates: {
      ...surfaceStates,
      [surfaceId]: {
        state,
        dataModel: dataModel ?? {},
        updatedAt: new Date().toISOString(),
      },
    },
  }

  await sessionRepo.updateStateSnapshot(sessionId, updatedSnapshot, MVP_USER_ID)
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/walker/lifeware/frontend
git add src/app/actions/session.ts
git commit -m "feat(session): 新增 saveSurfaceOutcome server action

- 将 CN-UI surface 状态保存到 session stateSnapshot.cnuiSurfaceStates
- 与现有 stateSnapshot 数据隔离，不覆盖其他状态

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 新增 getSessionSurfaceOutcomes server action

**Files:**
- Modify: `frontend/src/app/actions/session.ts`

- [ ] **Step 1: 在 session.ts 中新增 getSessionSurfaceOutcomes**

在 `saveSurfaceOutcome` 之后新增：

```typescript
/**
 * 获取 session 中所有 CN-UI surface 的最终状态
 *
 * @param sessionId - 会话 ID
 * @returns surface 状态映射表
 */
export async function getSessionSurfaceOutcomes(
  sessionId: string,
): Promise<Record<string, { state: 'saved' | 'cancelled'; dataModel: Record<string, unknown> }>> {
  const session = await sessionRepo.findById(sessionId, MVP_USER_ID)
  if (!session) return {}

  const surfaceStates = session.stateSnapshot?.cnuiSurfaceStates as Record<string, unknown> | undefined
  if (!surfaceStates) return {}

  const result: Record<string, { state: 'saved' | 'cancelled'; dataModel: Record<string, unknown> }> = {}

  for (const [surfaceId, outcome] of Object.entries(surfaceStates)) {
    if (
      outcome &&
      typeof outcome === 'object' &&
      'state' in outcome &&
      (outcome.state === 'saved' || outcome.state === 'cancelled')
    ) {
      result[surfaceId] = {
        state: outcome.state as 'saved' | 'cancelled',
        dataModel: (outcome as Record<string, unknown>).dataModel as Record<string, unknown> ?? {},
      }
    }
  }

  return result
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/walker/lifeware/frontend
git add src/app/actions/session.ts
git commit -m "feat(session): 新增 getSessionSurfaceOutcomes server action

- 从 session stateSnapshot.cnuiSurfaceStates 读取 surface 最终状态
- 返回类型安全的 surface 状态映射表

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: useConversation 集成 surface 状态持久化

**Files:**
- Modify: `frontend/src/hooks/use-conversation.ts:13,160-168`

- [ ] **Step 1: 导入 saveSurfaceOutcome**

在 import 区域新增：

```tsx
import { fetchSessions, loadSessionMessages, createSession, saveMessage, deleteSession, tryGenerateTitle, saveSurfaceOutcome } from '@/app/actions/session'
```

- [ ] **Step 2: 修改 handleSurfaceStateChange 以持久化到后端**

将 `handleSurfaceStateChange` 改为 async 函数，并在更新本地 state 后调用 `saveSurfaceOutcome`：

```tsx
  /** CNUI 表面状态变更 → 持久化到消息中 + 后端 session */
  const handleSurfaceStateChange = useCallback(async (surfaceId: string, state: SurfaceState) => {
    // 1. 更新本地 messages
    setConversationMessages(prev => prev.map(msg => {
      if (msg.cnuiSurface?.cnuiSurfaceId === surfaceId) {
        return { ...msg, cnuiSurface: { ...msg.cnuiSurface, state } }
      }
      return msg
    }))

    // 2. 持久化到后端 session stateSnapshot
    const sid = activeSessionIdRef.current
    if (sid) {
      try {
        await saveSurfaceOutcome(sid, surfaceId, state)
      } catch (err) {
        console.error('[handleSurfaceStateChange] 持久化 surface 状态失败:', err)
      }
    }
  }, [])
```

- [ ] **Step 3: Commit**

```bash
cd /home/walker/lifeware/frontend
git add src/hooks/use-conversation.ts
git commit -m "feat(conversation): handleSurfaceStateChange 持久化到后端

- 更新本地 messages 后调用 saveSurfaceOutcome
- 失败时仅打印错误，不影响用户体验

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: ConversationView 集成 surface 状态恢复

**Files:**
- Modify: `frontend/src/components/layout/conversation-view.tsx:10,60-85`

- [ ] **Step 1: 导入 getSessionSurfaceOutcomes**

在 import 区域新增：

```tsx
import { getSessionSurfaceOutcomes } from '@/app/actions/session'
```

- [ ] **Step 2: 新增 useEffect 从后端恢复 surface 状态**

在 `ConversationView` 组件中，在 `initialSurfaceStates` 计算之后、`useCnuiLifecycle` 调用之前，新增一个 state 来存储从后端恢复的 surface 状态：

```tsx
export function ConversationView({ messages, onSendMessage, isLoading, recentSessions, onSelectSession, intentTriggers, frequentIntents, onCnuiConfirm, onSurfaceStateChange }: ConversationViewProps) {
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 从后端 session 恢复 surface 状态
  const [restoredSurfaceStates, setRestoredSurfaceStates] = useState<Record<string, SurfaceState>>({})

  useEffect(() => {
    // 从 messages 中提取 sessionId（假设所有消息属于同一个 session）
    const sessionId = messages[0]?.sessionId
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
  }, [messages])

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
```

注意：这里假设 `ChatMessage` 有 `sessionId` 字段。如果没有，需要通过其他方式获取 sessionId（如从 props 传入）。

如果 `ChatMessage` 没有 `sessionId`，需要修改方案：将 `sessionId` 作为 `ConversationView` 的新 prop 传入。

查看 `ChatMessage` 类型定义... 从 `usom/types/objects.ts` 中查看。

如果 `ChatMessage` 没有 `sessionId`，则修改为：

1. 在 `ConversationViewProps` 中新增 `sessionId?: string`
2. 在 `useEffect` 中直接使用 `sessionId` prop

让我检查 `ChatMessage` 的定义。

实际上，从 `conversation-view.tsx` 的 import 中：`import type { ChatMessage, AISessionSummary, SurfaceState } from "@/usom/types/objects"`

让我看看 `ChatMessage` 是否有 `sessionId`。

从代码中可以看到，`messages` 是通过 `loadSessionMessages(sessionId)` 加载的，所以 `messages` 属于同一个 session。但 `ChatMessage` 类型可能没有 `sessionId` 字段。

如果 `ChatMessage` 没有 `sessionId`，最简单的方式是在 `ConversationViewProps` 中新增一个 `sessionId` prop。

让我采用这个方案：在 `ConversationViewProps` 中新增 `sessionId?: string`，然后在 `page.tsx` 中传入。

修改后的完整代码：

```tsx
interface ConversationViewProps {
  /** 消息列表 */
  messages: ChatMessage[]
  /** 当前会话 ID（用于恢复 surface 状态） */
  sessionId?: string
  /** 发送消息回调 */
  onSendMessage: (content: string, attachments?: File[]) => void
  ...
}

// 在 useEffect 中：
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
```

然后在 `page.tsx` 中：

```tsx
<ConversationView
  messages={conv.conversationMessages}
  sessionId={conv.activeSessionId}
  ...
/>
```

这个方案更简洁可靠。

- [ ] **Step 3: Commit**

```bash
cd /home/walker/lifeware/frontend
git add src/components/layout/conversation-view.tsx src/app/page.tsx
git commit -m "feat(cnui): ConversationView 从后端恢复 surface 状态

- 新增 sessionId prop
- mount 时调用 getSessionSurfaceOutcomes 恢复已完成的 surface 状态
- 与消息中的状态合并（后端状态优先级更高）

Closes [001]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: 验证 [001] 修复

**Files:**
- 无文件修改

- [ ] **Step 1: 启动 dev server**

```bash
cd /home/walker/lifeware/frontend
npm run dev
```

- [ ] **Step 2: 测试保存后刷新**

1. 打开浏览器 http://localhost:3000
2. 在 AI 助手中触发一个 CN-UI surface（如创建一个习惯）
3. 填写表单并点击"保存"，确认保存
4. 确认 surface 显示"已保存"覆盖层
5. 刷新页面
6. 验证：该 surface 仍显示"已保存"覆盖层，不可编辑

- [ ] **Step 3: 测试取消后刷新**

1. 触发一个新的 CN-UI surface
2. 点击"取消"，确认取消
3. 确认 surface 显示"已取消"覆盖层
4. 刷新页面
5. 验证：该 surface 仍显示"已取消"覆盖层，不可编辑

- [ ] **Step 4: Commit（如测试通过）**

```bash
cd /home/walker/lifeware/frontend
git commit --allow-empty -m "test: 验证 [001] CN-UI 过期状态持久化修复

- 保存后刷新：surface 保持已保存状态 ✅
- 取消后刷新：surface 保持已取消状态 ✅

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 自检

### Spec 覆盖检查

| Spec 需求 | 对应 Task |
|---|---|
| [001] 后端持久化 surface 状态 | Task 6, 7, 8, 9, 10 |
| [002] 遮罩改为半透明 | Task 1, 2 |
| [003] Banner 组件 + Home/Habits 集成 | Task 3, 4, 5 |

### 占位符检查

- 无 "TBD"、"TODO"、"implement later"
- 所有代码步骤包含完整代码
- 所有命令包含预期操作

### 类型一致性检查

- `saveSurfaceOutcome` 参数：`sessionId: string, surfaceId: string, state: 'saved' | 'cancelled'` — 与 `SurfaceState` 的子集一致
- `getSessionSurfaceOutcomes` 返回类型与 `saveSurfaceOutcome` 存储的数据结构一致
- `overlayClassName` prop 在 `AlertDialogContent` 和 `CnuiConfirmDialog` 中使用一致
