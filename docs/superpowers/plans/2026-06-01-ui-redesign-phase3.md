# UI 重构 Phase 3 — 架构重构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解决结构性问题——拆分 942 行 page.tsx、实施暗色模式、补齐移动端/平板端导航、应用交互叠加色。

**Architecture:** 按领域内聚拆分 state 为独立 hooks（useTimebox / useConversation / useIntentHandler），通过轻量 AppContext 共享跨 hook 状态（mainViewState / isLoading / error）。拆分后 page.tsx 缩减为 ≤100 行组装层。暗色模式通过 `next-themes`（已安装）+ `.dark` CSS 变量块实现。移动端新增 BottomNav + FAB，平板端 LeftPanel 使用 overlay 模式。

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Lucide React, next-themes (已安装 v0.4.6), sonner (已安装)

**规范依据:** `docs/UI-DESIGN-SPEC.md`（§1.4 语义色暗色值, §1.6 暗色模式, §7.3 z-index, §8.3 移动端导航, §10 响应式断点, §12 暗色模式, §14 检查清单）

**代码基准:** main 分支（Phase 2 完成，17 commits）

---

## 文件结构

### 新增文件

| 文件 | 职责 |
|------|------|
| `frontend/src/contexts/app-context.tsx` | AppContext 定义 + Provider + useApp hook |
| `frontend/src/hooks/use-timebox.ts` | 时间盒数据管理 + 日期导航 |
| `frontend/src/hooks/use-conversation.ts` | 会话 + 消息管理 + session CRUD |
| `frontend/src/hooks/use-intent-handler.ts` | 意图提交 + 成长操作 + 对话发送逻辑 |
| `frontend/src/components/views/schedule-view.tsx` | 时间盒日/周/月视图渲染 |
| `frontend/src/components/views/action-view.tsx` | Domain 页面路由渲染 |
| `frontend/src/components/layout/bottom-nav.tsx` | 移动端底部导航栏（3 Tab） |
| `frontend/src/components/layout/fab.tsx` | 移动端浮动操作按钮 + 快捷菜单 |
| `frontend/src/components/layout/theme-toggle.tsx` | 主题切换按钮（Light/Dark/System） |

### 修改文件

| 文件 | 变更 |
|------|------|
| `frontend/src/app/page.tsx` | 942 行 → ≤100 行组装层 |
| `frontend/src/app/globals.css` | 添加 `.dark` CSS 变量块 |
| `frontend/src/app/layout.tsx` | 包裹 ThemeProvider + suppressHydrationWarning |
| `frontend/src/components/layout/app-shell.tsx` | 移动端 BottomNav + FAB + 平板 overlay |
| `frontend/src/components/layout/top-nav.tsx` | 添加 ThemeToggle 按钮 |

---

## Task 1: 创建 AppContext

**Files:**
- Create: `frontend/src/contexts/app-context.tsx`
- Modify: `frontend/src/app/page.tsx`

AppContext 存放跨 hook 共享的导航和全局状态。每个 hook 通过 `useApp()` 读写共享状态，自管自己的领域 state。

- [ ] **Step 1: 创建 `frontend/src/contexts/app-context.tsx`**

```tsx
"use client"

import { createContext, useContext, useState, type Dispatch, type SetStateAction } from "react"
import type { MainViewState } from "@/components/layout/main-view-state"

interface AppContextValue {
  mainViewState: MainViewState
  setMainViewState: Dispatch<SetStateAction<MainViewState>>
  isLoading: boolean
  setIsLoading: Dispatch<SetStateAction<boolean>>
  error: string | undefined
  setError: Dispatch<SetStateAction<string | undefined>>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [mainViewState, setMainViewState] = useState<MainViewState>({
    type: 'schedule',
    date: new Date(),
    viewMode: 'day',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()

  return (
    <AppContext.Provider value={{ mainViewState, setMainViewState, isLoading, setIsLoading, error, setError }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}
```

- [ ] **Step 2: 修改 `page.tsx`——使用 AppContext 替换 mainViewState / isLoading / error**

在 `Home()` 函数外层包裹 `<AppProvider>`，内部组件改用 `useApp()` 读取共享状态。具体改动：

1. 在文件顶部添加 `import { AppProvider, useApp } from "@/contexts/app-context"`
2. `export default function Home()` 仅返回 `<AppProvider><HomeContent /></AppProvider>`
3. 新建 `function HomeContent()`，内容是原 `Home()` 的全部逻辑
4. 在 `HomeContent()` 内：
   - 删除 `const [mainViewState, setMainViewState] = useState<MainViewState>(...)` → 改为 `const { mainViewState, setMainViewState, isLoading, setIsLoading, error, setError } = useApp()`
   - 删除 `const [isLoading, setIsLoading] = useState(false)`
   - 删除 `const [error, setError] = useState<string | undefined>()`
   - 所有引用 `mainViewState` / `setMainViewState` / `isLoading` / `setIsLoading` / `error` / `setError` 的地方不变（因为变量名相同）

- [ ] **Step 3: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功，8/8 页面生成

- [ ] **Step 4: 提交**

```bash
git add frontend/src/contexts/app-context.tsx frontend/src/app/page.tsx
git commit -m "refactor(ui): 创建 AppContext，提取 mainViewState/isLoading/error 为共享状态"
```

---

## Task 2: 提取 useTimebox hook

**Files:**
- Create: `frontend/src/hooks/use-timebox.ts`
- Modify: `frontend/src/app/page.tsx`

将时间盒相关的所有 state 和回调从 page.tsx 移入独立 hook。

- [ ] **Step 1: 创建 `frontend/src/hooks/use-timebox.ts`**

将 page.tsx 中以下 state 和函数原样移入此 hook（仅调整闭包引用为 hook 内部变量）：

**移入的 state：**
- `timeboxes` / `setTimeboxes` (page.tsx:96)
- `dateMode` / `setDateMode` (page.tsx:100)
- `currentDate` / `setCurrentDate` (page.tsx:101)
- `actionSurface` / `setActionSurface` (page.tsx:99)
- `transitionConfirm` / `setTransitionConfirm` (page.tsx:170-172)
- `logTarget` / `setLogTarget` (page.tsx:169)

**移入的辅助函数：**
- `INITIAL_TIMEBOXES` 常量 (page.tsx:73)
- `getDateRange()` (page.tsx:75-84)
- `navigateDate()` (page.tsx:86-93)

**移入的 effects：**
- `loadTimeboxes` useCallback (page.tsx:179-187)
- `useEffect` 调用 loadTimeboxes (page.tsx:189)
- `useAutoTrigger` (page.tsx:191-197)

**移入的 callbacks：**
- `handleTimeboxAction` (page.tsx:317-328)
- `handleTransitionConfirm` (page.tsx:330-339)
- `handleLogSubmit` (page.tsx:341-349)
- `handleDateSelect` (page.tsx:352)
- `handleDateModeChange` (page.tsx:312)
- `handleNavigate` (page.tsx:313-315)

**移入的派生值：**
- `logTargetTimebox` (page.tsx:351)

Hook 从 AppContext 读取 `setIsLoading` / `setError`：

```tsx
"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useApp } from "@/contexts/app-context"
import { useAutoTrigger } from "@/hooks/use-auto-trigger"
import type { TimeboxSummary } from "@/usom/types/summaries"
import type { ActionSurface } from "@/usom/types/process"
import type { ExecutionRecord } from "@/usom/types/objects"
import type { DateViewMode } from "@/domains/timebox/components/types"
import { getTimeboxesByRange, transitionTimebox } from "@/app/actions/intent"
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addWeeks, addMonths } from "date-fns"

const INITIAL_TIMEBOXES: TimeboxSummary[] = []

function getDateRange(mode: DateViewMode, date: Date): { start: Date; end: Date } {
  switch (mode) {
    case 'day': return { start: startOfDay(date), end: endOfDay(date) }
    case 'week': return { start: startOfWeek(date, { weekStartsOn: 1 }), end: endOfWeek(date, { weekStartsOn: 1 }) }
    case 'month': return { start: startOfMonth(date), end: endOfMonth(date) }
  }
}

function navigateDate(mode: DateViewMode, date: Date, direction: 'prev' | 'next'): Date {
  const delta = direction === 'next' ? 1 : -1
  switch (mode) {
    case 'day': return addDays(date, delta)
    case 'week': return addWeeks(date, delta)
    case 'month': return addMonths(date, delta)
  }
}

export function useTimebox() {
  const { setIsLoading, setError } = useApp()

  const [timeboxes, setTimeboxes] = useState<TimeboxSummary[]>(INITIAL_TIMEBOXES)
  const [dateMode, setDateMode] = useState<DateViewMode>("day")
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [actionSurface, setActionSurface] = useState<ActionSurface | undefined>()
  const [transitionConfirm, setTransitionConfirm] = useState<{
    timeboxId: string; action: string; message: string;
  } | null>(null)
  const [logTarget, setLogTarget] = useState<string | null>(null)

  const loadTimeboxes = useCallback(async (modeParam?: DateViewMode, dateParam?: Date) => {
    const m = modeParam ?? dateMode
    const d = dateParam ?? currentDate
    const { start, end } = getDateRange(m, d)
    try {
      const data = await getTimeboxesByRange(start, end)
      setTimeboxes(data)
    } catch {}
  }, [dateMode, currentDate])

  useEffect(() => { loadTimeboxes() }, [dateMode, currentDate]) // eslint-disable-line react-hooks/exhaustive-deps

  useAutoTrigger({
    timeboxes,
    onTransition: async (id, action) => {
      const result = await transitionTimebox(id, action as any)
      if (result.success) await loadTimeboxes()
    },
  })

  const handleTimeboxAction = useCallback(async (timeboxId: string, action: string) => {
    if (action === "log" || action === "viewLog") { setLogTarget(timeboxId); return }
    if (action === "cancel") { setTransitionConfirm({ timeboxId, action, message: "确认取消这个时间盒？" }); return }
    setIsLoading(true)
    try {
      const result = await transitionTimebox(timeboxId, action as any)
      if (result.success) await loadTimeboxes()
      else if (result.needsConfirmation) setTransitionConfirm({ timeboxId, action, message: result.confirmationMessage ?? "确认继续？" })
      else setError(result.error ?? "操作失败")
    } catch (err) { setError(err instanceof Error ? err.message : "操作失败") }
    finally { setIsLoading(false) }
  }, [loadTimeboxes, setIsLoading, setError])

  const handleTransitionConfirm = useCallback(async () => {
    if (!transitionConfirm) return
    setIsLoading(true)
    try {
      const result = await transitionTimebox(transitionConfirm.timeboxId, transitionConfirm.action as any)
      if (result.success) await loadTimeboxes()
      else setError(result.error ?? "操作失败")
    } catch (err) { setError(err instanceof Error ? err.message : "操作失败") }
    finally { setIsLoading(false); setTransitionConfirm(null) }
  }, [transitionConfirm, loadTimeboxes, setIsLoading, setError])

  const handleLogSubmit = useCallback(async (timeboxId: string, executionRecord: ExecutionRecord) => {
    setIsLoading(true)
    try {
      const result = await transitionTimebox(timeboxId, 'log', executionRecord)
      if (result.success) await loadTimeboxes()
      else setError(result.error ?? "记录失败")
    } catch (err) { setError(err instanceof Error ? err.message : "记录失败") }
    finally { setIsLoading(false); setLogTarget(null) }
  }, [loadTimeboxes, setIsLoading, setError])

  const handleDateSelect = useCallback((date: Date) => { setCurrentDate(date); setDateMode('day') }, [])
  const handleDateModeChange = useCallback((newMode: DateViewMode) => { setDateMode(newMode) }, [])
  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    setCurrentDate((prev) => navigateDate(dateMode, prev, direction))
  }, [dateMode])

  const logTargetTimebox = logTarget ? timeboxes.find(t => t.id === logTarget) : null

  return {
    timeboxes, setTimeboxes, dateMode, currentDate, actionSurface,
    transitionConfirm, setTransitionConfirm, logTarget, setLogTarget, logTargetTimebox,
    loadTimeboxes, handleTimeboxAction, handleTransitionConfirm,
    handleLogSubmit, handleDateSelect, handleDateModeChange, handleNavigate,
  }
}
```

- [ ] **Step 2: 修改 `page.tsx`——使用 useTimebox**

在 `HomeContent()` 内：
1. 添加 `import { useTimebox } from "@/hooks/use-timebox"`
2. 删除 page.tsx 中所有在 Task 2 Step 1 中列出的 state 声明、辅助函数、effects、callbacks
3. 添加 `const tb = useTimebox()`
4. 全局替换引用：
   - `timeboxes` → `tb.timeboxes`
   - `dateMode` → `tb.dateMode`
   - `currentDate` → `tb.currentDate`
   - `loadTimeboxes` → `tb.loadTimeboxes`
   - `handleTimeboxAction` → `tb.handleTimeboxAction`
   - `handleTransitionConfirm` → `tb.handleTransitionConfirm`
   - `handleLogSubmit` → `tb.handleLogSubmit`
   - `handleDateSelect` → `tb.handleDateSelect`
   - `handleDateModeChange` → `tb.handleDateModeChange`
   - `handleNavigate` → `tb.handleNavigate`
   - `transitionConfirm` → `tb.transitionConfirm`
   - `logTarget` → `tb.logTarget`
   - `logTargetTimebox` → `tb.logTargetTimebox`
   - `actionSurface` → `tb.actionSurface`
5. `handleResult` 内的 `setTimeboxes` → `tb.setTimeboxes`（注意：此时 handleResult 还在 page.tsx 中，后续 Task 4 会移走）
6. 删除不再需要的 import（`startOfDay`, `endOfDay`, `startOfWeek`, `endOfWeek`, `startOfMonth`, `endOfMonth`, `addDays`, `addWeeks`, `addMonths`, `getTimeboxesByRange`, `transitionTimebox`, `useAutoTrigger`）

- [ ] **Step 3: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add frontend/src/hooks/use-timebox.ts frontend/src/app/page.tsx
git commit -m "refactor(ui): 提取 useTimebox hook，时间盒数据管理独立化"
```

---

## Task 3: 提取 useConversation hook

**Files:**
- Create: `frontend/src/hooks/use-conversation.ts`
- Modify: `frontend/src/app/page.tsx`

将会话、消息、session CRUD 相关的 state 和回调从 page.tsx 移入独立 hook。

- [ ] **Step 1: 创建 `frontend/src/hooks/use-conversation.ts`**

```tsx
"use client"

import { useState, useCallback, useRef } from "react"
import { useApp } from "@/contexts/app-context"
import type { ChatMessage, AISessionSummary, SurfaceState } from "@/usom/types/objects"
import { fetchSessions, loadSessionMessages, createSession, saveMessage, deleteSession, tryGenerateTitle } from '@/app/actions/session'

export function useConversation() {
  const { mainViewState, setMainViewState } = useApp()

  const [sessions, setSessions] = useState<AISessionSummary[]>([])
  const [conversationMessages, setConversationMessages] = useState<ChatMessage[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>()
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)

  // 页面加载：拉取 session 列表 + 自动恢复上次活跃对话
  const loadSessions = useCallback(() => {
    fetchSessions()
      .then(data => {
        setSessions(data)
        const lastActive = data.find(s => s.status === 'active')
        if (lastActive) {
          setActiveSessionId(lastActive.id)
          setMainViewState({ type: 'conversation', sessionId: lastActive.id })
          return loadSessionMessages(lastActive.id)
        }
        return [] as ChatMessage[]
      })
      .then(msgs => {
        if (msgs.length > 0) setConversationMessages(msgs)
      })
      .catch(err => console.error('[fetchSessions] 加载失败:', err))
      .finally(() => setSessionsLoaded(true))
  }, [setMainViewState])

  /** 添加消息到对话列表并持久化 */
  const addChatMessage = useCallback((msg: ChatMessage) => {
    setConversationMessages(prev => [...prev, msg])
    const sid = activeSessionIdRef.current
    if (sid) {
      const saveP = saveMessage(sid, {
        role: msg.role,
        content: msg.content,
        cnuiSurface: msg.cnuiSurface,
        intentRef: msg.intentRef,
      })

      if (msg.role === 'assistant') {
        saveP.then(() => tryGenerateTitle(sid))
          .then(newTitle => {
            if (newTitle) {
              setSessions(prev => prev.map(s =>
                s.id === sid ? { ...s, title: newTitle } : s
              ))
            }
          })
          .catch(err => console.error('[addChatMessage] 保存或标题生成失败:', err))
      } else {
        saveP.catch(err => console.error('[saveMessage] 持久化失败:', err))
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveCurrentConversation = useCallback(() => {
    // 持久化已由 saveMessage 在每个消息发送时处理
  }, [])

  const handleDeleteSession = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId)
    setDeleteTarget({ id: sessionId, title: session?.title ?? '未命名对话' })
  }, [sessions])

  const confirmDeleteSession = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteSession(deleteTarget.id)
      setSessions(prev => prev.filter(s => s.id !== deleteTarget.id))
      if (activeSessionId === deleteTarget.id) {
        setActiveSessionId(undefined)
        setConversationMessages([])
        setMainViewState({ type: 'schedule', date: new Date(), viewMode: 'day' })
      }
    } catch (err) {
      console.error('[deleteSession] 删除失败:', err)
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, activeSessionId, setMainViewState])

  const handleSelectSession = useCallback(async (sessionId: string) => {
    saveCurrentConversation()
    setMainViewState({ type: 'conversation', sessionId })
    setActiveSessionId(sessionId)
    try {
      const msgs = await loadSessionMessages(sessionId)
      setConversationMessages(msgs)
    } catch (err) {
      console.error('[loadSessionMessages] 加载失败:', err)
    }
  }, [saveCurrentConversation, setMainViewState])

  const handleNewSession = useCallback(async () => {
    const hasSubstantialMessages = conversationMessages.some(
      m => m.role === 'user' || (m.role === 'assistant' && m.content.trim().length > 0)
    )
    if (!hasSubstantialMessages && mainViewState.type === 'conversation') {
      setConversationMessages([])
      return
    }

    setConversationMessages([])

    try {
      const { id, title } = await createSession()
      setSessions(prev => [{
        id, title, status: 'active',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }, ...prev])
      setActiveSessionId(id)
      setMainViewState({ type: 'conversation', sessionId: id })
    } catch (err) {
      console.error('[createSession] 创建失败:', err)
      const newId = crypto.randomUUID()
      setSessions(prev => [{
        id: newId, title: '新对话', status: 'active',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }, ...prev])
      setActiveSessionId(newId)
      setMainViewState({ type: 'conversation', sessionId: newId })
    }
  }, [conversationMessages, mainViewState, setMainViewState])

  /** 确保当前处于对话视图（如不处于则创建/切换） */
  const ensureConversationView = useCallback(() => {
    if (mainViewState.type === 'conversation') return
    const sessionId = activeSessionId ?? crypto.randomUUID()
    if (!activeSessionId) {
      setSessions(prev => [{
        id: sessionId, title: '新对话', status: 'active',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }, ...prev])
      setActiveSessionId(sessionId)
    }
    setMainViewState({ type: 'conversation', sessionId })
  }, [mainViewState, activeSessionId, setMainViewState])

  /** CNUI 表面状态变更 → 持久化到消息中 */
  const handleSurfaceStateChange = useCallback((surfaceId: string, state: SurfaceState) => {
    setConversationMessages(prev => prev.map(msg => {
      if (msg.cnuiSurface?.cnuiSurfaceId === surfaceId) {
        return { ...msg, cnuiSurface: { ...msg.cnuiSurface, state } }
      }
      return msg
    }))
  }, [])

  return {
    sessions, conversationMessages, activeSessionId, activeSessionIdRef,
    sessionsLoaded, deleteTarget, setDeleteTarget,
    loadSessions, addChatMessage, saveCurrentConversation,
    handleDeleteSession, confirmDeleteSession,
    handleSelectSession, handleNewSession,
    ensureConversationView, handleSurfaceStateChange,
  }
}
```

- [ ] **Step 2: 修改 `page.tsx`——使用 useConversation**

在 `HomeContent()` 内：
1. 添加 `import { useConversation } from "@/hooks/use-conversation"`
2. 删除 page.tsx 中所有在 Task 3 Step 1 中列出的 state 声明、callbacks
3. 添加 `const conv = useConversation()`
4. 替换引用：
   - `sessions` → `conv.sessions`
   - `conversationMessages` → `conv.conversationMessages`
   - `activeSessionId` → `conv.activeSessionId`
   - `activeSessionIdRef` → `conv.activeSessionIdRef`
   - `sessionsLoaded` → `conv.sessionsLoaded`
   - `deleteTarget` → `conv.deleteTarget`
   - `addChatMessage` → `conv.addChatMessage`
   - `saveCurrentConversation` → `conv.saveCurrentConversation`
   - `handleDeleteSession` → `conv.handleDeleteSession`
   - `confirmDeleteSession` → `conv.confirmDeleteSession`
   - `handleSelectSession` → `conv.handleSelectSession`
   - `handleNewSession` → `conv.handleNewSession`
   - `ensureConversationView` → `conv.ensureConversationView`
   - `handleSurfaceStateChange` → `conv.handleSurfaceStateChange`
5. 替换 session 加载 effect（page.tsx:148-165）为 `useEffect(() => { conv.loadSessions() }, [])` — 注意 `loadSessions` 已用 useCallback 包裹
6. 删除不再需要的 import（`fetchSessions`, `loadSessionMessages`, `createSession`, `saveMessage`, `deleteSession`, `tryGenerateTitle`）

注意：`confirmDeleteSession` 内部的 `dateMode` 引用已改为硬编码 `'day'`（在 useConversation 中），因为 dateMode 属于 useTimebox。如果后续需要传递 dateMode，可通过参数或 context 传递。

- [ ] **Step 3: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add frontend/src/hooks/use-conversation.ts frontend/src/app/page.tsx
git commit -m "refactor(ui): 提取 useConversation hook，会话与消息管理独立化"
```

---

## Task 4: 提取 useIntentHandler hook

**Files:**
- Create: `frontend/src/hooks/use-intent-handler.ts`
- Modify: `frontend/src/app/page.tsx`

将意图提交、成长操作、对话发送逻辑移入独立 hook。此 hook 接收 useTimebox 和 useConversation 的返回值作为依赖。

- [ ] **Step 1: 创建 `frontend/src/hooks/use-intent-handler.ts`**

将 page.tsx 中以下内容移入此 hook：

**移入的 state：**
- `confirmation` / `setConfirmation` (page.tsx:173-175)
- `traceEnabled` (page.tsx:167)
- `traceSessions` / `setTraceSessions` (page.tsx:168)
- `llmConfigured` / `setLlmConfigured` (page.tsx:177)
- `intentTriggers` / `setIntentTriggers` (page.tsx:114)
- `frequentIntents` / `setFrequentIntents` (page.tsx:115)
- `domainActions` / `setDomainActions` (page.tsx:113)
- `splitWith` / `setSplitWith` (page.tsx:109)

**移入的 effects：**
- `fetchDomainActions` (page.tsx:122-126)
- `checkLLMConfigured` (page.tsx:128-130)
- `fetchIntentTriggers` (page.tsx:131-135)
- `fetchFrequentIntents` (page.tsx:136-140)

**移入的 callbacks：**
- `isExecutionIntent` (page.tsx:217)
- `isBatchIntent` (page.tsx:218-224)
- `handleResult` (page.tsx:199-215) — 内部辅助函数，需改为使用 deps 参数
- `handleSubmit` (page.tsx:226-260)
- `handleFormSubmit` (page.tsx:262-274)
- `handleConfirm` (page.tsx:276-291)
- `handleCancelConfirmation` (page.tsx:293-296)
- `handleGrowthAction` (page.tsx:461-513)
- `handleCnuiConfirm` (page.tsx:516-555)
- `handleConversationSend` (page.tsx:568-768)
- `handleCloseSplit` (page.tsx:770-772)

Hook 的依赖接口：

```tsx
interface IntentHandlerDeps {
  setTimeboxes: React.Dispatch<React.SetStateAction<TimeboxSummary[]>>
  addChatMessage: (msg: ChatMessage) => void
  ensureConversationView: () => void
  activeSessionIdRef: React.MutableRefObject<string | undefined>
  saveCurrentConversation: () => void
}
```

Hook 从 AppContext 读取 `setMainViewState` / `setIsLoading` / `setError`。

**关键调整**：原 `handleResult` 内部的 `setTimeboxes` → `deps.setTimeboxes`，`setError` → 从 AppContext 获取，`setActionSurface` → hook 内部 state。

完整实现：将 page.tsx 中上述所有函数体原样复制到 `useIntentHandler` 中，仅将闭包中引用的 `setTimeboxes` 替换为 `deps.setTimeboxes`，将 `addChatMessage` / `ensureConversationView` / `activeSessionIdRef` / `saveCurrentConversation` 替换为对应的 `deps.*`。其余 state 和 callback 逻辑不变。

```tsx
"use client"

import { useState, useCallback, useEffect } from "react"
import { useApp } from "@/contexts/app-context"
import type { TimeboxSummary } from "@/usom/types/summaries"
import type { ChatMessage } from "@/usom/types/objects"
import type { TemplateFormFields } from "@/components/intent-form"
import type { TraceSession } from "@/nexus/infrastructure/trace-logger/trace-types"
import { submitIntent, submitTemplateIntent, submitExecutionIntent, submitBatchIntent, resolveShortcut, fetchDomainActions, submitDynamicIntent, parseHabitIntentOnly, openCnuiSurface, submitCnuiSurface, isCnuiSurface, getActionResponse } from "@/app/actions/intent"
import { fetchIntentTriggers } from "@/app/actions/intent-triggers"
import { recordActivity } from "@/app/actions/activity-recorder"
import { fetchFrequentIntents } from "@/app/actions/activity"
import { checkLLMConfigured } from "@/app/actions/llm-config"
import { getTraceConfig } from "@/lib/config/trace-config"
import { resolveSlashCommand } from "@/lib/slash-command"
import { HABIT_USER_FACING } from "@/lib/constants/habit-messages"
import type { IntentSubmissionResult } from "@/app/actions/intent"
import type { SplitWith } from "@/components/layout/main-view-state"

interface IntentHandlerDeps {
  setTimeboxes: React.Dispatch<React.SetStateAction<TimeboxSummary[]>>
  addChatMessage: (msg: ChatMessage) => void
  ensureConversationView: () => void
  activeSessionIdRef: React.MutableRefObject<string | undefined>
  saveCurrentConversation: () => void
}

export function useIntentHandler(deps: IntentHandlerDeps) {
  const { setMainViewState, setIsLoading, setError } = useApp()

  const [confirmation, setConfirmation] = useState<{
    message: string; rawInput?: string; formFields?: TemplateFormFields;
  } | null>(null)
  const [traceEnabled] = useState(() => getTraceConfig().enabled)
  const [traceSessions, setTraceSessions] = useState<TraceSession[]>([])
  const [llmConfigured, setLlmConfigured] = useState(true)
  const [intentTriggers, setIntentTriggers] = useState<Awaited<ReturnType<typeof fetchIntentTriggers>>>([])
  const [frequentIntents, setFrequentIntents] = useState<Awaited<ReturnType<typeof fetchFrequentIntents>>>([])
  const [domainActions, setDomainActions] = useState<Array<{
    domainId: string; domainName: string;
    actions: Array<{ action: string; shortcut?: string; description: string; response_type?: string }>
  }>>([])
  const [splitWith, setSplitWith] = useState<SplitWith | undefined>()

  // Data loading effects
  useEffect(() => {
    fetchDomainActions()
      .then(setDomainActions)
      .catch(err => console.error('[fetchDomainActions] 加载失败:', err))
  }, [])

  useEffect(() => {
    checkLLMConfigured().then(setLlmConfigured)
  }, [])

  useEffect(() => {
    fetchIntentTriggers()
      .then(setIntentTriggers)
      .catch(err => console.error('[fetchIntentTriggers] 加载失败:', err))
  }, [])

  useEffect(() => {
    fetchFrequentIntents(20)
      .then(setFrequentIntents)
      .catch(err => console.error('[fetchFrequentIntents] 加载失败:', err))
  }, [])

  // === 内部辅助 ===

  const isExecutionIntent = (input: string): boolean => /^(开始|结束|取消|记录|复盘|启动|完成|停止)/.test(input.trim())
  const isBatchIntent = (input: string): boolean => {
    const timePattern = /\d{1,2}[:：]\d{2}/g
    const timeMatches = input.match(timePattern)
    if (timeMatches && timeMatches.length >= 2) return true
    if (/[;；\n]/.test(input) && input.length > 20) return true
    return false
  }

  function handleResult(result: IntentSubmissionResult) {
    deps.setTimeboxes(result.timeboxes)
    if (result.traceSession) {
      setTraceSessions((prev) => [...prev, result.traceSession!])
    }
    if (result.needsConfirmation && result.confirmationMessage) {
      setConfirmation({ message: result.confirmationMessage })
      return
    }
    setConfirmation(null)
    if (!result.success) {
      setError(result.error ?? "提交失败，请重试")
    } else {
      setError(undefined)
    }
  }

  // === Public callbacks ===
  // 以下 callback 主体从 page.tsx 原样搬入，仅将闭包中的外部引用替换为 deps.*

  const handleSubmit = useCallback(async (rawInput: string, confirmed?: boolean) => {
    // 原样复制 page.tsx handleSubmit (line 226-260)
    // 替换：setTimeboxes → deps.setTimeboxes, setConfirmation → 内部, setError → AppContext, setIsLoading → AppContext, setMainViewState → AppContext
    // ...（完整实现同 page.tsx:226-260，所有外部引用已替换）
    setError(undefined)
    const shortcut = await resolveShortcut(rawInput)
    if (shortcut) {
      setMainViewState({ type: 'action', domainId: shortcut.domainId, action: shortcut.action })
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      if (isExecutionIntent(rawInput)) {
        const result = await submitExecutionIntent(rawInput)
        deps.setTimeboxes(result.timeboxes)
        if (!result.success) setError(result.error ?? "执行失败")
        return
      }
      if (isBatchIntent(rawInput)) {
        const batchResult = await submitBatchIntent(rawInput)
        const batchErrors = batchResult.results.filter(r => r.error).map(r => `第${r.index + 1}个任务"${r.title}"：${r.error}`)
        setError(batchErrors.length > 0 ? batchErrors.join("；") : undefined)
        return
      }
      const result = await submitIntent(rawInput, confirmed, traceEnabled)
      if (result.needsConfirmation) setConfirmation({ message: result.confirmationMessage ?? "", rawInput })
      handleResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误，请重试")
    } finally {
      setIsLoading(false)
    }
  }, [traceEnabled, deps, setMainViewState, setIsLoading, setError])

  const handleFormSubmit = useCallback(async (fields: TemplateFormFields, confirmed?: boolean) => {
    // 原样复制 page.tsx handleFormSubmit (line 262-274)
    setError(undefined)
    setIsLoading(true)
    try {
      const result = await submitTemplateIntent(fields, confirmed, traceEnabled)
      if (result.needsConfirmation) setConfirmation({ message: result.confirmationMessage ?? "", formFields: fields })
      handleResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误，请重试")
    } finally {
      setIsLoading(false)
    }
  }, [traceEnabled, setIsLoading, setError])

  const handleConfirm = useCallback(async () => {
    if (!confirmation) return
    setError(undefined)
    setIsLoading(true)
    try {
      if (confirmation.rawInput) {
        handleResult(await submitIntent(confirmation.rawInput, true, traceEnabled))
      } else if (confirmation.formFields) {
        handleResult(await submitTemplateIntent(confirmation.formFields, true, traceEnabled))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误，请重试")
    } finally {
      setIsLoading(false)
    }
  }, [confirmation, traceEnabled, setIsLoading, setError])

  const handleCancelConfirmation = useCallback(() => {
    setConfirmation(null)
    setError(undefined)
  }, [setError])

  const handleGrowthAction = useCallback(async (domainId: string, action: string) => {
    deps.saveCurrentConversation()
    void recordActivity({ activityType: 'menu_click', source: 'growth_menu', targetDomain: domainId, targetAction: action })

    if (await isCnuiSurface(domainId, action)) {
      deps.ensureConversationView()
      try {
        const result = await openCnuiSurface(domainId, action)
        const msg: ChatMessage = { role: 'assistant', content: result.content, timestamp: new Date().toISOString(), cnuiSurface: result.surface }
        deps.addChatMessage(msg)
      } catch (e) {
        console.error('openCnuiSurface failed:', e)
        deps.addChatMessage({ role: 'assistant', content: '打开操作面板失败，请重试', timestamp: new Date().toISOString() })
      }
      return
    }

    const { responseType } = await getActionResponse(domainId, action)
    if (responseType === 'page') {
      setMainViewState({ type: 'action', domainId, action })
      return
    }
    if (responseType === 'text') {
      deps.ensureConversationView()
      deps.addChatMessage({ role: 'assistant', content: `操作 ${action} 已记录，请在对话中继续`, timestamp: new Date().toISOString() })
      return
    }
    setMainViewState({ type: 'action', domainId, action })
  }, [deps, setMainViewState])

  const handleCnuiConfirm = useCallback(async (cnuiSurfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => {
    try {
      const result = await submitCnuiSurface(cnuiSurfaceId, domainId, action, data)
      if (result.success) {
        const content = action === 'createHabit' && result.habit?.title ? `习惯"${result.habit.title}"创建成功！` : '操作成功！'
        deps.addChatMessage({ role: 'assistant', content, timestamp: new Date().toISOString() })
        void recordActivity({ activityType: 'cnui_action', source: 'cnui_surface', targetDomain: domainId, targetAction: action })
      } else {
        deps.addChatMessage({ role: 'system', content: `操作失败: ${result.error}`, timestamp: new Date().toISOString() })
      }
    } catch (e) {
      console.error('submitCnuiSurface failed:', e)
      deps.addChatMessage({ role: 'system', content: '网络错误，请重试', timestamp: new Date().toISOString() })
    }
  }, [deps])

  const handleConversationSend = useCallback(async (content: string, attachments?: File[]) => {
    // 原样复制 page.tsx handleConversationSend (line 568-768)
    // 替换：addChatMessage → deps.addChatMessage, ensureConversationView → deps.ensureConversationView,
    // setTimeboxes → deps.setTimeboxes, setSplitWith → 内部, setMainViewState → AppContext, setIsLoading → AppContext
    const userMsg: ChatMessage = {
      role: 'user',
      content: content || (attachments && attachments.length > 0 ? `上传了 ${attachments.length} 个文件` : ''),
      timestamp: new Date().toISOString(),
    }
    deps.addChatMessage(userMsg)

    // slash 命令处理
    const slashResult = resolveSlashCommand(content)
    if (slashResult.isSlashCommand) {
      const { hasPayload, payload, domainId: explicitDomainId } = slashResult
      let resolvedDomainId = explicitDomainId
      const shortcut = await resolveShortcut(content)
      if (!resolvedDomainId && shortcut) resolvedDomainId = shortcut.domainId

      if (shortcut?.view_route) {
        setMainViewState({ type: 'action', domainId: shortcut.domainId, action: shortcut.action })
        deps.addChatMessage({ role: 'assistant', content: `已导航到 ${shortcut.domainId}/${shortcut.action}`, timestamp: new Date().toISOString() })
        return
      }

      if (hasPayload && payload) {
        setIsLoading(true)
        try {
          const habitParse = await parseHabitIntentOnly(content)
          if (habitParse.success && habitParse.action === 'createHabit' && habitParse.fields) {
            const cnuiResult = await openCnuiSurface('habits', 'createHabit')
            const mergedSnapshot = { ...cnuiResult.surface.dataSnapshot, ...habitParse.fields }
            deps.addChatMessage({ role: 'assistant', content: '已识别习惯信息，请确认：', timestamp: new Date().toISOString(), cnuiSurface: { ...cnuiResult.surface, dataSnapshot: mergedSnapshot } })
            setIsLoading(false)
            return
          }
        } catch (err) { console.error('[slashCommand] AI 解析失败:', err) }

        setIsLoading(true)
        try {
          const result = await submitIntent(content, false, traceEnabled)
          deps.setTimeboxes(result.timeboxes)
          deps.addChatMessage({ role: 'assistant', content: result.success ? '已处理你的请求。' : (result.error ?? '处理失败'), timestamp: new Date().toISOString() })
        } catch {
          deps.addChatMessage({ role: 'assistant', content: '网络错误，请重试', timestamp: new Date().toISOString() })
        } finally { setIsLoading(false) }
        return
      } else {
        const targetDomain = resolvedDomainId || shortcut?.domainId || slashResult.domainId
        const targetAction = slashResult.action
        if (targetDomain && targetAction) {
          try {
            const result = await openCnuiSurface(targetDomain, targetAction)
            deps.addChatMessage({ role: 'assistant', content: result.content, timestamp: new Date().toISOString(), cnuiSurface: result.surface })
          } catch {
            deps.addChatMessage({ role: 'assistant', content: '打开表单失败，请重试', timestamp: new Date().toISOString() })
          }
          return
        }
        setIsLoading(true)
        try {
          const result = await submitIntent(content, false, traceEnabled)
          deps.setTimeboxes(result.timeboxes)
          deps.addChatMessage({ role: 'assistant', content: result.success ? '已处理你的请求。' : (result.error ?? '处理失败'), timestamp: new Date().toISOString() })
        } catch {
          deps.addChatMessage({ role: 'assistant', content: '网络错误，请重试', timestamp: new Date().toISOString() })
        } finally { setIsLoading(false) }
        return
      }
    }

    // 非 slash 命令 → 快捷命令拦截
    const shortcut = await resolveShortcut(content)
    if (shortcut) {
      setMainViewState({ type: 'action', domainId: shortcut.domainId, action: shortcut.action })
      deps.addChatMessage({ role: 'assistant', content: `已导航到 ${shortcut.domainId}/${shortcut.action}`, timestamp: new Date().toISOString() })
      return
    }

    setIsLoading(true)
    try {
      const habitParse = await parseHabitIntentOnly(content)
      if (habitParse.success && habitParse.action === 'createHabit' && habitParse.fields) {
        try {
          const cnuiResult = await openCnuiSurface('habits', 'createHabit')
          const mergedSnapshot = { ...cnuiResult.surface.dataSnapshot, ...habitParse.fields }
          deps.addChatMessage({ role: 'assistant', content: '已识别习惯信息，请确认：', timestamp: new Date().toISOString(), cnuiSurface: { ...cnuiResult.surface, dataSnapshot: mergedSnapshot } })
        } catch (err) {
          console.error('[habitIntent] CNUI 打开失败:', err)
          deps.addChatMessage({ role: 'assistant', content: HABIT_USER_FACING.INTENT_RECOGNIZED, timestamp: new Date().toISOString() })
        }
        setIsLoading(false)
        return
      }

      const result = await submitIntent(content, false, traceEnabled)
      deps.setTimeboxes(result.timeboxes)
      if (result.success && result.actionSurface) {
        if (content.includes('创建') || content.includes('新建')) {
          setSplitWith({ mode: 'form', domainId: 'timebox', action: 'create_timebox', fields: {} })
        }
      }
      if (!habitParse.success && (content.includes('习惯') || content.includes('habit'))) {
        deps.addChatMessage({ role: 'assistant', content: HABIT_USER_FACING.INTENT_UNRECOGNIZED(habitParse.error), timestamp: new Date().toISOString() })
        setIsLoading(false)
        return
      }
      deps.addChatMessage({ role: 'assistant', content: result.success ? '已处理你的请求。' : (result.error ?? '处理失败'), timestamp: new Date().toISOString() })
    } catch {
      deps.addChatMessage({ role: 'assistant', content: '网络错误，请重试', timestamp: new Date().toISOString() })
    } finally {
      setIsLoading(false)
    }
  }, [traceEnabled, deps, setMainViewState, setIsLoading])

  const handleCloseSplit = useCallback(() => { setSplitWith(undefined) }, [])

  return {
    confirmation, traceSessions, llmConfigured, intentTriggers,
    frequentIntents, domainActions, splitWith,
    handleSubmit, handleFormSubmit, handleConfirm, handleCancelConfirmation,
    handleGrowthAction, handleCnuiConfirm, handleConversationSend,
    handleCloseSplit,
  }
}
```

- [ ] **Step 2: 修改 `page.tsx`——使用 useIntentHandler**

在 `HomeContent()` 内：
1. 添加 `import { useIntentHandler } from "@/hooks/use-intent-handler"`
2. 删除 page.tsx 中 Task 4 Step 1 列出的所有 state、effects、callbacks
3. 添加：
```tsx
const intent = useIntentHandler({
  setTimeboxes: tb.setTimeboxes,
  addChatMessage: conv.addChatMessage,
  ensureConversationView: conv.ensureConversationView,
  activeSessionIdRef: conv.activeSessionIdRef,
  saveCurrentConversation: conv.saveCurrentConversation,
})
```
4. 替换引用：
   - `confirmation` → `intent.confirmation`
   - `handleSubmit` → `intent.handleSubmit`
   - `handleFormSubmit` → `intent.handleFormSubmit`
   - `handleConfirm` → `intent.handleConfirm`
   - `handleCancelConfirmation` → `intent.handleCancelConfirmation`
   - `handleGrowthAction` → `intent.handleGrowthAction`
   - `handleCnuiConfirm` → `intent.handleCnuiConfirm`
   - `handleConversationSend` → `intent.handleConversationSend`
   - `handleCloseSplit` → `intent.handleCloseSplit`
   - `domainActions` → `intent.domainActions`
   - `intentTriggers` → `intent.intentTriggers`
   - `frequentIntents` → `intent.frequentIntents`
   - `llmConfigured` → `intent.llmConfigured`
   - `splitWith` → `intent.splitWith`
   - `traceSessions` → `intent.traceSessions`
5. 删除不再需要的 import（所有 intent actions, slash-command, habit-messages, trace-config 等）

- [ ] **Step 3: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add frontend/src/hooks/use-intent-handler.ts frontend/src/app/page.tsx
git commit -m "refactor(ui): 提取 useIntentHandler hook，意图处理与成长操作独立化"
```

---

## Task 5: 提取视图组件 + 精简 page.tsx

**Files:**
- Create: `frontend/src/components/views/schedule-view.tsx`
- Create: `frontend/src/components/views/action-view.tsx`
- Modify: `frontend/src/app/page.tsx`（最终精简为 ≤100 行组装层）

- [ ] **Step 1: 创建 `frontend/src/components/views/schedule-view.tsx`**

```tsx
"use client"

import { HomeBanner } from "@/components/layout/home-banner"
import { DateNav } from "@/domains/timebox/components/date-nav"
import { DayView } from "@/domains/timebox/components/day-view"
import { WeekView } from "@/domains/timebox/components/week-view"
import { MonthView } from "@/domains/timebox/components/month-view"
import type { DateViewMode } from "@/domains/timebox/components/types"
import type { TimeboxSummary } from "@/usom/types/summaries"

interface ScheduleViewProps {
  timeboxes: TimeboxSummary[]
  dateMode: DateViewMode
  currentDate: Date
  onAction: (domainId: string, action: string) => void
  onDateModeChange: (mode: DateViewMode) => void
  onNavigate: (direction: 'prev' | 'next') => void
  onDateSelect: (date: Date) => void
  onTimeboxAction: (timeboxId: string, action: string) => void
}

export function ScheduleView({
  timeboxes, dateMode, currentDate,
  onAction, onDateModeChange, onNavigate, onDateSelect, onTimeboxAction,
}: ScheduleViewProps) {
  return (
    <div className="flex w-full flex-col gap-4">
      <HomeBanner onAction={onAction} />
      <DateNav mode={dateMode} currentDate={currentDate} onModeChange={onDateModeChange} onNavigate={onNavigate} />
      {dateMode === "day" && <DayView timeboxes={timeboxes} currentDate={currentDate} onDateSelect={onDateSelect} onAction={onTimeboxAction} />}
      {dateMode === "week" && <WeekView timeboxes={timeboxes} currentDate={currentDate} />}
      {dateMode === "month" && <MonthView timeboxes={timeboxes} currentDate={currentDate} />}
    </div>
  )
}
```

- [ ] **Step 2: 创建 `frontend/src/components/views/action-view.tsx`**

```tsx
"use client"

import { HabitListPage } from "@/domains/habits/pages/HabitListPage"
import { HabitTemplatePage } from "@/domains/habits/pages/HabitTemplatePage"
import { HabitStatisticsPage } from "@/domains/habits/pages/HabitStatisticsPage"
import { ProjectsView } from "@/domains/tasks/components/projects-view"

// view_route 页面组件映射
const VIEW_PAGE_COMPONENTS: Record<string, Record<string, React.ComponentType<any>>> = {
  habits: {
    view_list: HabitListPage,
    view_templates: HabitTemplatePage,
    createHabit: HabitListPage,
    view_statistics: HabitStatisticsPage,
  },
  tasks: {
    view_list: ProjectsView,
    view_detail: ProjectsView,
    createProject: ProjectsView,
    createTask: ProjectsView,
  },
}

interface ActionViewProps {
  domainId: string
  action: string
  initialFields?: Record<string, unknown>
}

export function ActionView({ domainId, action, initialFields }: ActionViewProps) {
  const ViewComponent = VIEW_PAGE_COMPONENTS[domainId]?.[action]
  if (ViewComponent) {
    const props = action === 'createHabit'
      ? { autoOpenCreate: true, initialFields }
      : {}
    return (
      <div className="flex-1 overflow-y-auto">
        <ViewComponent {...props} />
      </div>
    )
  }
  return <div className="p-4"><p className="text-sm text-body">页面未找到: {domainId}/{action}</p></div>
}
```

- [ ] **Step 3: 重写 `page.tsx` 为组装层**

page.tsx 的 `HomeContent()` 应缩减至约 80-100 行，仅负责：
1. 初始化三个 hook
2. 组装导航回调
3. 构建 leftPanelContent
4. 渲染 AppShell + 视图路由
5. 渲染全局对话框

最终 `page.tsx` 结构：

```tsx
"use client"

import { useState, useCallback, useEffect } from "react"
import { AppProvider, useApp } from "@/contexts/app-context"
import { useTimebox } from "@/hooks/use-timebox"
import { useConversation } from "@/hooks/use-conversation"
import { useIntentHandler } from "@/hooks/use-intent-handler"
import { AppShell } from "@/components/layout/app-shell"
import { TilesBanner } from "@/components/layout/tiles-banner"
import { SessionList } from "@/components/layout/session-list"
import { GrowthMenu } from "@/components/layout/growth-menu"
import { ConversationView } from "@/components/layout/conversation-view"
import { SplitView } from "@/components/layout/main-content"
import { SettingsPage } from "@/components/settings/settings-page"
import { ScheduleView } from "@/components/views/schedule-view"
import { ActionView } from "@/components/views/action-view"
import { ConfirmDeleteDialog } from "@/components/layout/confirm-delete-dialog"
import { ExecutionLogDialog } from "@/components/execution-log-dialog"
import { Banner } from "@/components/feedback/banner"
import { Button } from "@/components/ui/button"
import type { PanelTab } from "@/components/layout/main-view-state"
import "@/domains/habits/register-form"
import "@/domains/tasks/register-form"

export default function Home() {
  return (
    <AppProvider>
      <HomeContent />
    </AppProvider>
  )
}

function HomeContent() {
  const { mainViewState, setMainViewState, isLoading } = useApp()
  const tb = useTimebox()
  const conv = useConversation()
  const intent = useIntentHandler({
    setTimeboxes: tb.setTimeboxes,
    addChatMessage: conv.addChatMessage,
    ensureConversationView: conv.ensureConversationView,
    activeSessionIdRef: conv.activeSessionIdRef,
    saveCurrentConversation: conv.saveCurrentConversation,
  })
  const [panelTab, setPanelTab] = useState<PanelTab>("assistant")

  // 会话加载（首次 mount）
  useEffect(() => { conv.loadSessions() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 导航回调
  const handleHomeClick = useCallback(() => {
    conv.saveCurrentConversation()
    setMainViewState({ type: 'schedule', date: new Date(), viewMode: tb.dateMode })
  }, [tb.dateMode, conv.saveCurrentConversation, setMainViewState])

  const handleSettingsClick = useCallback(() => {
    conv.saveCurrentConversation()
    setMainViewState({ type: 'settings' })
  }, [conv.saveCurrentConversation, setMainViewState])

  const handleFocusIntentInput = useCallback(() => {
    if (mainViewState.type !== 'conversation') {
      const sid = conv.sessions[0]?.id
      if (sid) setMainViewState({ type: 'conversation', sessionId: sid })
    }
    setTimeout(() => {
      document.querySelector<HTMLInputElement>('input[placeholder="输入消息..."]')?.focus()
    }, 100)
  }, [mainViewState.type, conv.sessions, setMainViewState])

  // === 左面板内容 ===
  const leftPanelContent = panelTab === 'assistant'
    ? <>
        {!intent.llmConfigured && (
          <Banner variant="warning" title="请先配置大语言模型" description="配置后即可使用 AI 助手功能" onClose={() => {}} />
        )}
        <SessionList
          sessions={conv.sessions}
          activeSessionId={conv.activeSessionId}
          onSelectSession={conv.handleSelectSession}
          onNewSession={conv.handleNewSession}
          onDeleteSession={conv.handleDeleteSession}
        />
      </>
    : <GrowthMenu domainActions={intent.domainActions as any} onAction={intent.handleGrowthAction} />

  // === 主内容渲染 ===
  const renderMainContent = () => {
    if (mainViewState.type === 'schedule') {
      return <ScheduleView timeboxes={tb.timeboxes} dateMode={tb.dateMode} currentDate={tb.currentDate} onAction={intent.handleGrowthAction} onDateModeChange={tb.handleDateModeChange} onNavigate={tb.handleNavigate} onDateSelect={tb.handleDateSelect} onTimeboxAction={tb.handleTimeboxAction} />
    }
    if (mainViewState.type === 'conversation') {
      const convView = <ConversationView messages={conv.conversationMessages} onSendMessage={intent.handleConversationSend} isLoading={isLoading} recentSessions={conv.sessions.slice(0, 3)} onSelectSession={conv.handleSelectSession} intentTriggers={intent.intentTriggers} frequentIntents={intent.frequentIntents} onCnuiConfirm={intent.handleCnuiConfirm} onSurfaceStateChange={conv.handleSurfaceStateChange} />
      if (intent.splitWith) {
        return <SplitView left={convView} right={<div className="p-4"><div className="flex items-center justify-between mb-3"><h3 className="text-sm font-medium text-ink">{intent.splitWith.mode === 'form' ? '表单编辑' : 'Markdown 编辑'}</h3><button type="button" onClick={intent.handleCloseSplit} className="text-xs text-body/50 hover:text-ink">关闭</button></div><p className="text-sm text-body">编辑区（{intent.splitWith.domainId}/{intent.splitWith.action}）</p></div>} />
      }
      return convView
    }
    if (mainViewState.type === 'action') {
      return <ActionView domainId={mainViewState.domainId} action={mainViewState.action} initialFields={mainViewState.initialFields} />
    }
    if (mainViewState.type === 'settings') {
      return <SettingsPage initialSection={mainViewState.section} />
    }
    return null
  }

  return (
    <>
      <AppShell activeTab={panelTab} onTabChange={setPanelTab} onHomeClick={handleHomeClick} onSettingsClick={handleSettingsClick}
        tilesBanner={tb.actionSurface && tb.actionSurface.tiles.length > 0 ? <TilesBanner candidates={tb.actionSurface.tiles} /> : undefined}
        leftPanelContent={leftPanelContent} mainContent={renderMainContent()} viewKey={mainViewState.type} onFocusIntentInput={handleFocusIntentInput} />

      {tb.transitionConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-scrim">
          <div className="mx-4 max-w-sm rounded-lg bg-canvas p-6 shadow-lg">
            <p className="mb-4 text-sm font-medium text-ink">{tb.transitionConfirm.message}</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => tb.setTransitionConfirm(null)} disabled={isLoading}>取消</Button>
              <Button size="sm" onClick={tb.handleTransitionConfirm} disabled={isLoading}>{isLoading ? "处理中..." : "确认"}</Button>
            </div>
          </div>
        </div>
      )}

      {tb.logTargetTimebox && <ExecutionLogDialog timebox={tb.logTargetTimebox} open={!!tb.logTarget} onClose={() => tb.setLogTarget(null)} onSubmit={tb.handleLogSubmit} />}
      <ConfirmDeleteDialog open={conv.deleteTarget !== null} sessionTitle={conv.deleteTarget?.title ?? ''} onConfirm={conv.confirmDeleteSession} onCancel={() => conv.setDeleteTarget(null)} />
    </>
  )
}
```

**重要细节**：
- `panelTab` 使用正常的 `useState`
- `conv.loadSessions()` 在 mount 时通过 `useEffect` 调用一次
- `useConversation` 已导出 `setDeleteTarget`（Task 3 的 return 中包含）
- `useTimebox` 已导出 `setTransitionConfirm` 和 `setLogTarget`（Task 2 的 return 中包含）

- [ ] **Step 4: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功，8/8 页面生成

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/views/ frontend/src/app/page.tsx
git commit -m "refactor(ui): 提取 ScheduleView/ActionView 视图组件，page.tsx 缩减为组装层"
```

---

## Task 6: page.tsx 拆分构建验证

**Files:**
- Verify: `frontend/src/app/page.tsx`（应 ≤ 100 行）

- [ ] **Step 1: 统计 page.tsx 行数**

Run: `wc -l frontend/src/app/page.tsx`
Expected: ≤ 100 行

- [ ] **Step 2: 完整构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功，8/8 页面生成，无 TypeScript 错误

- [ ] **Step 3: lint 检查**

Run: `cd frontend && npm run lint`
Expected: 无新增 lint 错误

- [ ] **Step 4: 提交（如有修复）**

```bash
git add -A
git commit -m "fix(ui): 修复 page.tsx 拆分后的类型和导出问题"
```

---

## Task 7: 暗色模式 CSS 变量 + ThemeProvider + ThemeToggle

**Files:**
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/app/layout.tsx`
- Create: `frontend/src/components/layout/theme-toggle.tsx`
- Modify: `frontend/src/components/layout/top-nav.tsx`

暗色模式分三步实施：定义 `.dark` CSS 变量 → 集成 `next-themes` ThemeProvider → TopNav 添加切换按钮。

- [ ] **Step 1: 在 `globals.css` 末尾添加 `.dark` 块**

在文件末尾（`@media (prefers-reduced-motion)` 之后）添加：

```css
/* ========================================================================
   暗色模式（UI-DESIGN-SPEC §1.6, §12）
   通过 <html class="dark"> 切换，所有令牌在 .dark 中重定义
   ======================================================================== */

.dark {
  /* --- 品牌色（Canvas/Ink 反转，Primary 提亮）--- */
  --canvas: #181715;
  --ink: #faf9f5;
  --primary: #d4886a;
  --primary-active: #cc785c;
  --primary-disabled: #3a3530;
  --body: #c8c5bc;
  --body-strong: #e8e5de;
  --muted: #8e8b82;
  --muted-soft: #6c6a64;
  --hairline: #33302b;
  --hairline-soft: #2a2723;
  --surface-soft: #1f1e1b;
  --surface-card: #252320;
  --surface-cream-strong: #2e2b27;
  --on-primary: #181715;

  /* --- 语义色（UI-DESIGN-SPEC §1.4 暗色值）--- */
  --success: #6bcf82;
  --warning: #e8b84a;
  --error: #e05555;
  --info: #7ba8cc;
  --success-soft: #1a2e1e;
  --warning-soft: #2e2818;
  --error-soft: #2e1818;
  --info-soft: #182838;

  /* --- 交互叠加色（暗色模式下 light-on-dark）--- */
  --hover-overlay: rgba(250,249,245,0.06);
  --pressed-overlay: rgba(250,249,245,0.10);
  --focus-ring: rgba(212,136,106,0.5);
  --scrim: rgba(0,0,0,0.7);

  /* --- shadcn/ui 兼容层（暗色值）--- */
  --background: var(--canvas);
  --foreground: var(--ink);
  --card: var(--surface-card);
  --card-foreground: var(--ink);
  --popover: var(--surface-card);
  --popover-foreground: var(--ink);
  --primary-foreground: var(--on-primary);
  --secondary: var(--surface-card);
  --secondary-foreground: var(--ink);
  --accent: var(--surface-card);
  --accent-foreground: var(--ink);
  --destructive: var(--error);
  --destructive-foreground: var(--on-primary);
  --muted-foreground: var(--muted);
  --border: var(--hairline);
  --input: var(--hairline);
  --ring: var(--primary);
  --sidebar-background: var(--surface-soft);
  --sidebar-foreground: var(--ink);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--on-primary);
  --sidebar-accent: var(--surface-card);
  --sidebar-accent-foreground: var(--ink);
  --sidebar-border: var(--hairline);
  --sidebar-ring: var(--primary);
}
```

- [ ] **Step 2: 修改 `layout.tsx`——集成 ThemeProvider**

`next-themes` 已安装（v0.4.6），`sonner.tsx` 已在用。在 layout.tsx 中添加 ThemeProvider：

```tsx
import type { Metadata } from "next";
import { Cormorant_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/* ... font definitions 不变 ... */

export const metadata: Metadata = {
  title: "Lifeware",
  description: "意图驱动的个人成长系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${codeFont.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster position="bottom-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

关键改动：
1. 添加 `import { ThemeProvider } from "next-themes"`
2. `<html>` 添加 `suppressHydrationWarning`（避免 next-themes 注入 class 导致 hydration 不匹配）
3. `<body>` 内用 `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` 包裹所有内容

- [ ] **Step 3: 创建 `frontend/src/components/layout/theme-toggle.tsx`**

```tsx
"use client"

import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark")
    else if (theme === "dark") setTheme("system")
    else setTheme("light")
  }

  const icon = theme === "dark" ? <Moon className="size-[18px]" />
    : theme === "light" ? <Sun className="size-[18px]" />
    : <Monitor className="size-[18px]" />

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={cycleTheme}
      aria-label={`当前主题：${theme}，点击切换`}
    >
      {icon}
    </Button>
  )
}
```

- [ ] **Step 4: 修改 `top-nav.tsx`——添加 ThemeToggle**

在 TopNav 的 `<nav>` 中，在 Bell 和 Settings 按钮之间插入 ThemeToggle：

```tsx
import { ThemeToggle } from "@/components/layout/theme-toggle"

// 在 <nav> 内部：
<nav className="flex items-center gap-1" aria-label="主导航">
  <Button variant="ghost" size="icon-sm" aria-label="通知">
    <Bell className="size-[18px] text-body" />
  </Button>
  <ThemeToggle />
  <Button variant="ghost" size="icon-sm" aria-label="设置" onClick={onSettingsClick}>
    <Settings className="size-[18px] text-body" />
  </Button>
</nav>
```

- [ ] **Step 5: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 6: 验证暗色模式**

启动 dev server，在浏览器中点击 TopNav 的主题切换按钮，确认：
1. 亮色 → 暗色：背景变暗、文字变亮、primary 色提亮
2. 暗色 → 系统：跟随系统偏好
3. 语义色（success/warning/error/info）在暗色模式下可读
4. shadcn/ui 组件（dialog, sheet, tooltip）在暗色模式下正确显示
5. 文字对比度 ≥ 4.5:1（目视验证）

- [ ] **Step 7: 提交**

```bash
git add frontend/src/app/globals.css frontend/src/app/layout.tsx frontend/src/components/layout/theme-toggle.tsx frontend/src/components/layout/top-nav.tsx
git commit -m "feat(ui): 实施暗色模式，添加 .dark CSS 变量 + ThemeProvider + ThemeToggle"
```

---

## Task 8: 移动端 BottomNav + AppShell 响应式改造

**Files:**
- Create: `frontend/src/components/layout/bottom-nav.tsx`
- Modify: `frontend/src/components/layout/app-shell.tsx`

移动端（< 640px）底部导航栏：首页、对话、设置 3 个 Tab。修改 AppShell 在移动端使用 BottomNav 布局。

- [ ] **Step 1: 创建 `frontend/src/components/layout/bottom-nav.tsx`**

```tsx
"use client"

import { Home, MessageSquare, Settings } from "lucide-react"
import type { MainViewState } from "@/components/layout/main-view-state"

interface BottomNavProps {
  currentView: MainViewState['type']
  onNavigate: (view: MainViewState) => void
}

const NAV_ITEMS = [
  { key: 'schedule' as const, label: '首页', icon: Home },
  { key: 'conversation' as const, label: '对话', icon: MessageSquare },
  { key: 'settings' as const, label: '设置', icon: Settings },
]

export function BottomNav({ currentView, onNavigate }: BottomNavProps) {
  return (
    <nav
      className="flex items-center justify-around border-t border-hairline bg-canvas px-2 pb-[env(safe-area-inset-bottom)] sm:hidden"
      role="navigation"
      aria-label="底部导航"
    >
      {NAV_ITEMS.map(item => {
        const isActive = currentView === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              if (item.key === 'schedule') onNavigate({ type: 'schedule', date: new Date(), viewMode: 'day' })
              else if (item.key === 'settings') onNavigate({ type: 'settings' })
              else onNavigate({ type: 'conversation', sessionId: '' })
            }}
            className={`flex flex-col items-center gap-0.5 px-4 py-2 min-h-[44px] ${
              isActive ? 'text-primary' : 'text-muted-foreground'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            <item.icon className="size-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: 修改 `app-shell.tsx`——集成 BottomNav**

AppShell 需要在移动端显示 BottomNav。修改方案：

1. 添加 `BottomNav` import
2. 添加 `onBottomNavNavigate` prop（接收 `(view: MainViewState) => void`）
3. 添加 `currentView` prop（接收 `MainViewState['type']`）
4. 在移动端布局区域底部渲染 BottomNav

```tsx
// 新增 props
interface AppShellProps {
  // ...existing props...
  /** 移动端 BottomNav 导航回调 */
  onBottomNavNavigate?: (view: MainViewState) => void
}

// 在 return JSX 中，移动端区域：
<div className="min-h-0 flex-1 flex flex-col md:hidden">
  <MainContent viewKey={viewKey}>{mainContent}</MainContent>
  <BottomNav currentView={/* derived from mainViewState type */} onNavigate={onBottomNavNavigate} />
</div>
```

注意：AppShell 不直接持有 `mainViewState`，需要通过 prop 传入当前视图类型。添加 `currentViewType?: MainViewState['type']` prop，BottomNav 用它判断 active 状态。

同时在 `page.tsx` 中传入新 props：
```tsx
<AppShell
  // ...existing props...
  currentViewType={mainViewState.type}
  onBottomNavNavigate={(view) => setMainViewState(view)}
/>
```

- [ ] **Step 3: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/layout/bottom-nav.tsx frontend/src/components/layout/app-shell.tsx frontend/src/app/page.tsx
git commit -m "feat(ui): 新增移动端 BottomNav，AppShell 响应式改造"
```

---

## Task 9: 移动端 FAB + Growth Sheet

**Files:**
- Create: `frontend/src/components/layout/fab.tsx`
- Modify: `frontend/src/components/layout/app-shell.tsx`

移动端 FAB（浮动操作按钮）展开快捷创建菜单，包含"成长领域"入口通过底部 Sheet 弹出。

- [ ] **Step 1: 创建 `frontend/src/components/layout/fab.tsx`**

```tsx
"use client"

import { useState } from "react"
import { Plus, Check, Clock, ListTodo, X } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

interface QuickAction {
  label: string
  icon: React.ComponentType<{ className?: string }>
  domainId: string
  action: string
}

interface FabProps {
  quickActions: QuickAction[]
  growthContent: React.ReactNode
  onAction: (domainId: string, action: string) => void
}

const DEFAULT_ACTIONS: QuickAction[] = [
  { label: "创建时间盒", icon: Clock, domainId: "timebox", action: "createTimebox" },
  { label: "打卡习惯", icon: Check, domainId: "habits", action: "checkinHabits" },
  { label: "新建任务", icon: ListTodo, domainId: "tasks", action: "createTask" },
]

export function Fab({ quickActions = DEFAULT_ACTIONS, growthContent, onAction }: FabProps) {
  const [expanded, setExpanded] = useState(false)
  const [growthOpen, setGrowthOpen] = useState(false)

  return (
    <>
      {/* 快捷菜单（FAB 展开时显示） */}
      {expanded && (
        <div className="fixed inset-0 z-30 bg-scrim sm:hidden" onClick={() => setExpanded(false)}>
          <div className="absolute bottom-24 right-4 flex flex-col gap-2" onClick={e => e.stopPropagation()}>
            {quickActions.map(act => (
              <button
                key={act.action}
                type="button"
                onClick={() => { onAction(act.domainId, act.action); setExpanded(false) }}
                className="flex items-center gap-2 rounded-full bg-surface-card px-4 py-2.5 shadow-md text-sm text-ink active:bg-surface-cream-strong"
              >
                <act.icon className="size-4 text-primary" />
                {act.label}
              </button>
            ))}
            {/* 成长领域入口 */}
            <Sheet open={growthOpen} onOpenChange={setGrowthOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  onClick={() => { setGrowthOpen(true); setExpanded(false) }}
                  className="flex items-center gap-2 rounded-full bg-surface-card px-4 py-2.5 shadow-md text-sm text-ink active:bg-surface-cream-strong"
                >
                  <Plus className="size-4 text-primary rotate-45" />
                  成长领域
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[60vh] rounded-t-xl">
                <SheetHeader>
                  <SheetTitle>成长领域</SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto p-4">
                  {growthContent}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      )}

      {/* FAB 按钮 */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="fixed bottom-20 right-4 flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg active:bg-primary-active sm:hidden z-30"
        aria-label={expanded ? "关闭快捷菜单" : "打开快捷菜单"}
      >
        {expanded ? <X className="size-6" /> : <Plus className="size-6" />}
      </button>
    </>
  )
}
```

- [ ] **Step 2: 修改 `app-shell.tsx`——集成 FAB**

在 AppShell 中添加 FAB props 并在移动端渲染：

```tsx
// 新增 props
interface AppShellProps {
  // ...existing props...
  /** FAB 快捷操作回调 */
  onFabAction?: (domainId: string, action: string) => void
  /** 成长领域菜单内容（移动端 FAB Sheet 用） */
  growthContent?: ReactNode
}
```

在 return JSX 中，`</div>` (grid 容器的闭合标签) 之前添加 FAB：

```tsx
{/* 移动端 FAB */}
{onFabAction && growthContent && (
  <Fab onAction={onFabAction} growthContent={growthContent} />
)}
```

同时在 `page.tsx` 中传入新 props：
```tsx
<AppShell
  // ...existing props...
  onFabAction={intent.handleGrowthAction}
  growthContent={<GrowthMenu domainActions={intent.domainActions as any} onAction={intent.handleGrowthAction} />}
/>
```

- [ ] **Step 3: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/layout/fab.tsx frontend/src/components/layout/app-shell.tsx frontend/src/app/page.tsx
git commit -m "feat(ui): 新增移动端 FAB 浮动操作按钮 + Growth Sheet"
```

---

## Task 10: 平板端 overlay LeftPanel

**Files:**
- Modify: `frontend/src/components/layout/app-shell.tsx`

平板端（640–1023px，即 `sm` 到 `lg-` 断点）LeftPanel 使用 overlay 模式：浮层覆盖在内容区上方，带 Scrim 遮罩。

- [ ] **Step 1: 修改 `app-shell.tsx`——平板端 overlay 模式**

当前 AppShell 使用 `md:flex` 和 `md:hidden` 做桌面/移动端切换。需要调整为三断点：
- 移动端（< 640px / `sm`）：单列 + BottomNav + FAB，无 LeftPanel
- 平板端（640–1023px / `sm`–`lg`）：LeftPanel overlay 模式（浮层 + Scrim）
- 桌面端（≥ 1024px / `lg`）：标准三栏布局

修改 AppShell 的 JSX：

```tsx
return (
  <div className="grid h-screen grid-rows-[56px_1fr] bg-canvas">
    <TopNav onMenuClick={toggle} onSettingsClick={onSettingsClick} isPanelOpen={isOpen} />

    <div className="flex min-h-0 flex-col overflow-hidden">
      {tilesBanner}

      {/* 桌面端（≥ 1024px）：标准三栏 */}
      <div className="hidden min-h-0 flex-1 lg:flex" ref={containerRef}>
        {isOpen && (
          <>
            <div style={{ width: leftWidth }} className="shrink-0 overflow-hidden">
              <LeftPanel activeTab={activeTab} onTabChange={onTabChange} onHomeClick={onHomeClick}>
                {leftPanelContent}
              </LeftPanel>
            </div>
            <ResizableSplitter onMouseDown={handleMouseDown} />
          </>
        )}
        <div className="min-h-0 flex-1 flex flex-col">
          <MainContent viewKey={viewKey}>{mainContent}</MainContent>
        </div>
      </div>

      {/* 平板端（640–1023px）：overlay 模式 */}
      {isOpen && (
        <div className="hidden sm:flex lg:hidden fixed inset-0 z-30">
          <div className="absolute inset-0 bg-scrim" onClick={toggle} />
          <div className="relative z-40 w-[300px] shrink-0 shadow-xl">
            <LeftPanel activeTab={activeTab} onTabChange={onTabChange} onHomeClick={onHomeClick}>
              {leftPanelContent}
            </LeftPanel>
          </div>
        </div>
      )}

      {/* 平板端 + 移动端：主内容 */}
      <div className="min-h-0 flex-1 flex flex-col lg:hidden">
        <MainContent viewKey={viewKey}>{mainContent}</MainContent>
      </div>
    </div>

    {/* 移动端 BottomNav */}
    {onBottomNavNavigate && (
      <BottomNav currentView={currentViewType as any} onNavigate={onBottomNavNavigate} />
    )}

    {/* 移动端 FAB */}
    {onFabAction && growthContent && (
      <Fab onAction={onFabAction} growthContent={growthContent} />
    )}
  </div>
)
```

关键变化：
1. `md:flex` → `lg:flex`，`md:hidden` → `lg:hidden`（桌面断点从 768px 提升至 1024px）
2. 新增平板端 overlay 层（`sm:flex lg:hidden`），仅在 `isOpen` 时渲染
3. LeftPanel 在 overlay 中宽度固定 300px（不可拖拽调整）
4. 主内容区域在平板和移动端共享（`lg:hidden`）

- [ ] **Step 2: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/layout/app-shell.tsx
git commit -m "feat(ui): 平板端 LeftPanel overlay 模式，三断点响应式布局"
```

---

## Task 11: 交互叠加色应用到组件

**Files:**
- Modify: `frontend/src/components/layout/top-nav.tsx`
- Modify: `frontend/src/components/layout/growth-menu.tsx`
- Modify: `frontend/src/components/layout/conversation-view.tsx`
- Modify: `frontend/src/components/layout/session-list.tsx`

CSS 变量已定义（`--hover-overlay`, `--pressed-overlay`, `--focus-ring`, `--scrim`），Tailwind 映射已存在（`bg-hover-overlay`, `bg-pressed-overlay`, `ring-focus-ring`, `bg-scrim`）。此任务将它们应用到组件交互状态。

- [ ] **Step 1: 审查并替换组件 hover 状态**

全局搜索 `hover:opacity-` 和 `hover:bg-surface-soft`，替换为 `hover:bg-hover-overlay`：

**top-nav.tsx** — `hover:opacity-80` on logo link:
```tsx
// Before:
className="... hover:opacity-80 transition-opacity"
// After:
className="... hover:bg-hover-overlay transition-colors"
```

**growth-menu.tsx** — `hover:bg-surface-soft` on action buttons:
```tsx
// Before:
className="... hover:bg-surface-soft hover:text-ink transition-colors"
// After:
className="... hover:bg-hover-overlay hover:text-ink transition-colors"
```

**session-list.tsx** — `hover:bg-surface-soft` on session items:
```tsx
// Before:
className="... hover:bg-surface-soft transition-colors"
// After:
className="... hover:bg-hover-overlay transition-colors"
```

**conversation-view.tsx** — `hover:bg-surface-soft` on intent trigger buttons:
```tsx
// Before:
className="... hover:bg-surface-soft hover:text-ink transition-colors"
// After:
className="... hover:bg-hover-overlay hover:text-ink transition-colors"
```

- [ ] **Step 2: 审查并替换 focus 状态**

全局搜索 `focus:ring-1 focus:ring-primary`，替换为 `focus-visible:ring-2 focus-visible:ring-focus-ring`：

**conversation-view.tsx** — input focus:
```tsx
// Before:
className="... focus:outline-none focus:ring-1 focus:ring-primary"
// After:
className="... focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
```

- [ ] **Step 3: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/
git commit -m "feat(ui): 应用交互叠加色（hover-overlay, focus-ring）到组件交互状态"
```

---

## Task 12: 全局搜索（可选）

**Files:**
- Modify: `frontend/package.json`（安装 command 组件）
- Create: `frontend/src/components/search/command-menu.tsx`
- Modify: `frontend/src/components/layout/app-shell.tsx`

全局搜索面板：Ctrl+K 唤起，搜索 Domain Actions、习惯、任务、对话。

- [ ] **Step 1: 安装 shadcn command 组件**

Run: `cd frontend && npx shadcn@latest add command`
Expected: `components/ui/command.tsx` 创建成功

- [ ] **Step 2: 创建 `frontend/src/components/search/command-menu.tsx`**

```tsx
"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { CheckSquare, Clock, MessageSquare, Repeat, Settings, Target } from "lucide-react"

interface SearchableItem {
  id: string
  label: string
  group: string
  icon: React.ComponentType<{ className?: string }>
  onSelect: () => void
}

interface CommandMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: SearchableItem[]
}

export function CommandMenu({ open, onOpenChange, items }: CommandMenuProps) {
  const { theme } = useTheme()

  // Ctrl+K 唤起
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  // 按组分类
  const groups = items.reduce<Record<string, SearchableItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = []
    acc[item.group].push(item)
    return acc
  }, {})

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="搜索操作、习惯、任务、对话..." />
      <CommandList>
        <CommandEmpty>未找到匹配结果</CommandEmpty>
        {Object.entries(groups).map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map(item => (
              <CommandItem key={item.id} onSelect={item.onSelect}>
                <item.icon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
```

- [ ] **Step 3: 在 AppShell 或 page.tsx 中集成**

在 `page.tsx` 的 `HomeContent()` 中添加：

```tsx
const [searchOpen, setSearchOpen] = useState(false)

// 构建搜索项列表
const searchableItems = useMemo(() => [
  // Domain Actions
  ...intent.domainActions.flatMap(d =>
    d.actions.map(a => ({
      id: `${d.domainId}:${a.action}`,
      label: a.description,
      group: d.domainName,
      icon: DOMAIN_ICONS[d.domainId] ?? CheckSquare,
      onSelect: () => { intent.handleGrowthAction(d.domainId, a.action); setSearchOpen(false) },
    }))
  ),
  // Sessions
  ...conv.sessions.slice(0, 5).map(s => ({
    id: `session:${s.id}`,
    label: s.title,
    group: '最近对话',
    icon: MessageSquare,
    onSelect: () => { conv.handleSelectSession(s.id); setSearchOpen(false) },
  })),
], [intent.domainActions, conv.sessions])
```

在 return JSX 中添加：
```tsx
<CommandMenu open={searchOpen} onOpenChange={setSearchOpen} items={searchableItems} />
```

- [ ] **Step 4: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/search/ frontend/src/app/page.tsx
git commit -m "feat(ui): 全局搜索面板（Ctrl+K），搜索操作、习惯、对话"
```

---

## Task 13: 最终验证

- [ ] **Step 1: 完整构建**

Run: `cd frontend && npm run build`
Expected: 构建成功，8/8 页面生成

- [ ] **Step 2: §14 检查清单逐项验收**

| 检查项 | 验证方法 | 预期 |
|--------|----------|------|
| C-01 色彩合规 | `grep -rn "bg-red-\|text-red-\|bg-amber-\|text-amber-\|bg-gray-\|text-gray-" frontend/src/components/ frontend/src/app/` | 零匹配 |
| C-02 组件规范 | `grep -rn "<svg" frontend/src/components/` | 零内联 SVG |
| C-03 间距排版 | 目视检查 | 4px 整数倍 |
| C-04 交互 | `grep -rn "alert(" frontend/src/components/ frontend/src/app/page.tsx` | 零 alert() |
| C-05 响应式 | 浏览器 375px / 768px / 1440px 验证 | 三断点布局正确 |
| C-06 暗色模式 | 浏览器切换暗色 + DevTools 对比度检查 | 对比度 ≥ 4.5:1 |
| C-07 可访问性 | `grep -rn "aria-label" frontend/src/components/layout/` | 所有交互元素有 aria-label |

- [ ] **Step 3: page.tsx 行数验证**

Run: `wc -l frontend/src/app/page.tsx`
Expected: ≤ 100 行

- [ ] **Step 4: lint 检查**

Run: `cd frontend && npm run lint`
Expected: 无新增 lint 错误

- [ ] **Step 5: 更新 `docs/UI-REDESIGN.md` Phase 3 完成状态**

将 Phase 3 所有任务标记为 `[x]`。

- [ ] **Step 6: 最终提交**

```bash
git add -A
git commit -m "docs(ui): Phase 3 架构重构完成，更新 UI-REDESIGN.md 状态"
```
