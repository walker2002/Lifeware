# UI 重构 Phase 2 — 体验提升 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改善核心交互体验，提升视觉专业度——消息气泡视觉区分、空状态引导、LeftPanel Tabs、过渡动画、快捷键、反馈组件、z-index 规范化。

**Architecture:** 新建 4 个自建组件（ChatBubble、EmptyState、Banner、StatusBadge），修改 3 个布局组件（LeftPanel、ConversationView、MainContent），无架构变更。

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui (tabs/sonner/skeleton 已安装), Lucide React

**规范依据:** `docs/UI-DESIGN-SPEC.md`（§6.4 气泡, §6.5 标签, §6.6 空状态, §9.2 反馈, §7.3 z-index, §8.2 LeftPanel, §9.4 键盘, §11 图标）

---

## 文件结构

### 新增文件
| 文件 | 职责 |
|------|------|
| `frontend/src/components/chat-bubble.tsx` | 消息气泡（区分 user/assistant/system 角色） |
| `frontend/src/components/empty-state.tsx` | 空状态展示（图标+标题+描述+操作） |
| `frontend/src/components/feedback/banner.tsx` | 系统级消息横幅（页面顶部） |
| `frontend/src/components/status-badge.tsx` | 通用状态徽标（active/suspended/archived） |

### 修改文件
| 文件 | 变更 |
|------|------|
| `frontend/src/app/globals.css` | 添加 z-index token + `@keyframes viewIn` |
| `frontend/src/components/layout/left-panel.tsx` | 手写 Tab → shadcn/ui Tabs |
| `frontend/src/components/layout/conversation-view.tsx` | 消息渲染用 ChatBubble + 空状态增强 |
| `frontend/src/components/layout/growth-menu.tsx` | 快捷键标签可见 |
| `frontend/src/components/layout/main-content.tsx` | 视图切换过渡动画 |
| `frontend/src/app/page.tsx` | LLM 配置提示 → Banner 组件 |
| `frontend/src/components/ui/*.tsx` | z-index 对齐规范（dialog/sheet/alert-dialog/tooltip/popover/select） |

---

## Task 1: z-index 令牌化 + shadcn 组件对齐

**Files:**
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/components/ui/dialog.tsx`
- Modify: `frontend/src/components/ui/sheet.tsx`
- Modify: `frontend/src/components/ui/alert-dialog.tsx`
- Modify: `frontend/src/components/ui/tooltip.tsx`
- Modify: `frontend/src/components/ui/popover.tsx`
- Modify: `frontend/src/components/ui/select.tsx`

- [ ] **Step 1: 在 globals.css 的 `:root` 中定义 z-index 令牌**

在 `--scrim: rgba(20,20,19,0.5);` 行之后添加：

```css
  /* --- z-index 层级（UI-DESIGN-SPEC §7.3）--- */
  --z-base: 0;
  --z-sticky: 10;
  --z-dropdown: 20;
  --z-overlay: 30;
  --z-modal: 40;
  --z-toast: 50;
  --z-tooltip: 60;
```

在 `@theme inline` 块的 `--color-scrim: var(--scrim);` 行之后添加：

```css
  /* --- z-index --- */
  --z-base: var(--z-base);
  --z-sticky: var(--z-sticky);
  --z-dropdown: var(--z-dropdown);
  --z-overlay: var(--z-overlay);
  --z-modal: var(--z-modal);
  --z-toast: var(--z-toast);
  --z-tooltip: var(--z-tooltip);
```

- [ ] **Step 2: 更新 shadcn 组件 z-index**

按照 §7.3 规范逐组件更新：

**dialog.tsx** — overlay `z-50` → `z-overlay`，content `z-50` → `z-modal`：
```tsx
// DialogOverlay: "fixed inset-0 z-50 bg-scrim ..." → "fixed inset-0 z-overlay bg-scrim ..."
// DialogContent: "fixed top-[50%] left-[50%] z-50 ..." → "fixed top-[50%] left-[50%] z-modal ..."
```

**sheet.tsx** — overlay `z-50` → `z-overlay`，content `z-50` → `z-modal`：
```tsx
// SheetOverlay: "fixed inset-0 z-50 bg-scrim ..." → "fixed inset-0 z-overlay bg-scrim ..."
// SheetContent / SheetClose: "fixed z-50 ..." → "fixed z-modal ..."
```

**alert-dialog.tsx** — overlay `z-50` → `z-overlay`，content `z-50` → `z-modal`：
```tsx
// AlertDialogOverlay: "fixed inset-0 z-50 bg-scrim ..." → "fixed inset-0 z-overlay bg-scrim ..."
// AlertDialogContent: "... z-50 ..." → "... z-modal ..."
```

**tooltip.tsx** — content `z-50` → `z-tooltip`，arrow `z-50` → `z-tooltip`：
```tsx
// TooltipContent: "z-50 w-fit ..." → "z-tooltip w-fit ..."
// TooltipArrow: "z-50 size-2.5 ..." → "z-tooltip size-2.5 ..."
```

**popover.tsx** — content `z-50` → `z-dropdown`：
```tsx
// PopoverContent: "z-50 w-72 ..." → "z-dropdown w-72 ..."
```

**select.tsx** — content `z-50` → `z-dropdown`：
```tsx
// SelectContent: "relative z-50 max-h-..." → "relative z-dropdown max-h-..."
```

注意：只需替换 className 字符串中的 `z-50` 为对应的令牌名，不要改动其他样式。

- [ ] **Step 3: 验证自定义组件 z-index 已正确**

```bash
cd /home/walker/lifeware/frontend/src
grep -rn "z-50\|z-40\|z-30\|z-20\|z-10\|z-60" --include="*.tsx" | grep -v node_modules | grep -v "components/ui/" | grep -v ".next"
```

Expected: 仅 TopNav `z-40`（modal 层，符合 §7.3）、page.tsx 确认对话框 `z-40`、timeline/habit-card `z-10`（sticky 层）。无 `z-50`。

- [ ] **Step 4: 构建验证并提交**

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

```bash
cd /home/walker/lifeware
git add -A
git commit -m "feat(ui): 定义 z-index 令牌，shadcn 组件对齐 §7.3 层级规范"
```

---

## Task 2: LeftPanel Tab 替换为 shadcn/ui Tabs

**Files:**
- Modify: `frontend/src/components/layout/left-panel.tsx`

- [ ] **Step 1: 替换 LeftPanel 内部实现**

将 `left-panel.tsx` 整体替换为：

```tsx
"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PanelTab } from "./main-view-state"

interface LeftPanelProps {
  activeTab: PanelTab
  onTabChange: (tab: PanelTab) => void
  onHomeClick: () => void
  children: ReactNode
}

const TABS: { key: PanelTab; label: string }[] = [
  { key: 'assistant', label: 'AI 助手' },
  { key: 'growth', label: '成长领域' },
]

export function LeftPanel({ activeTab, onTabChange, onHomeClick, children }: LeftPanelProps) {
  return (
    <aside
      className="flex h-full w-80 flex-col border-r border-hairline bg-canvas"
      role="complementary"
      aria-label="导航面板"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onHomeClick}
          aria-label="回到主页"
          className="shrink-0"
        >
          <Home className="size-4 text-body" />
        </Button>
        <span className="text-sm font-medium text-ink">Home</span>
      </div>

      {/* Tabs — §8.2 要求使用 shadcn/ui Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as PanelTab)}>
        <TabsList className="mx-3 mt-2 mb-1">
          {TABS.map(tab => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {children}
      </div>
    </aside>
  )
}
```

关键变更：
- 手写 `<button>` + className 判断 → `<Tabs>` / `<TabsList>` / `<TabsTrigger>`
- Tab 逻辑不变：`activeTab` 控制、`onTabChange` 回调
- 移除手写的 active/inactive className 判断逻辑

- [ ] **Step 2: 验证构建并提交**

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

```bash
cd /home/walker/lifeware
git add frontend/src/components/layout/left-panel.tsx
git commit -m "fix(ui): LeftPanel Tab 替换为 shadcn/ui Tabs 组件，对齐 §8.2 规范"
```

---

## Task 3: GrowthMenu 快捷键标签可见化

**Files:**
- Modify: `frontend/src/components/layout/growth-menu.tsx`

- [ ] **Step 1: 在 GrowthMenu 中显示快捷键标签**

在 `growth-menu.tsx` 中，修改 pinnedActions 和 unpinnedActions 的渲染，在操作描述右侧添加快捷键标签。

找到 pinnedActions 渲染块（约第 113-135 行），在每个 action button 内部，Pin 按钮之前，添加快捷键标签：

```tsx
// 在 <span className="truncate">{act.description}</span> 之后，
// <span role="button" ... Pin ...> 之前，添加：
{act.shortcut && (
  <span className="ml-auto shrink-0 rounded-md bg-surface-soft px-2 py-0.5 text-xs text-muted-foreground">
    {act.shortcut}
  </span>
)}
```

对 unpinnedActions 的渲染块（约第 147-169 行）做相同修改。

最后，移除两个 button 上的 `title={act.shortcut ?? undefined}` 属性（快捷键已直接显示，不再需要 hover title）。

完整示例（pinnedActions button）：

```tsx
<button
  key={act.action}
  type="button"
  onClick={() => onAction(domain.domainId, act.action)}
  className="group flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-sm text-body hover:bg-surface-soft hover:text-ink transition-colors"
>
  {(() => {
    const RespIcon = RESPONSE_TYPE_ICON[act.response_type ?? '']
    return RespIcon ? <RespIcon className="size-3.5 shrink-0 text-body/40" /> : null
  })()}
  <span className="truncate">{act.description}</span>
  {act.shortcut && (
    <span className="ml-auto shrink-0 rounded-md bg-surface-soft px-2 py-0.5 text-xs text-muted-foreground">
      {act.shortcut}
    </span>
  )}
  <span
    role="button"
    tabIndex={0}
    onClick={e => { e.stopPropagation(); togglePin(domain.domainId, act.action) }}
    className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-body/30 hover:text-primary transition-opacity"
  >
    <Pin className="size-3" />
  </span>
</button>
```

注意：当快捷键存在时，Pin 按钮仍需保留（hover 显示）。快捷键标签使用 `ml-auto` 推到右侧，Pin 按钮通过 `shrink-0` 固定在最后。当快捷键不存在时，Pin 按钮仍使用 `ml-auto` 推到右侧（保持原有行为）。

- [ ] **Step 2: 验证构建并提交**

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

```bash
cd /home/walker/lifeware
git add frontend/src/components/layout/growth-menu.tsx
git commit -m "fix(ui): GrowthMenu 快捷键标签可见化，移除 hover title"
```

---

## Task 4: 新建通用 StatusBadge 组件

**Files:**
- Create: `frontend/src/components/status-badge.tsx`

- [ ] **Step 1: 创建通用 StatusBadge**

新建 `frontend/src/components/status-badge.tsx`：

```tsx
import { Badge } from "@/components/ui/badge"

type StatusType = "active" | "suspended" | "archived"

interface StatusBadgeProps {
  status: StatusType
  label?: string
  size?: "sm" | "md"
}

const STATUS_CONFIG: Record<StatusType, { label: string; className: string }> = {
  active: {
    label: "进行中",
    className: "bg-success-soft text-success border-success",
  },
  suspended: {
    label: "已暂停",
    className: "bg-warning-soft text-warning border-warning",
  },
  archived: {
    label: "已归档",
    className: "bg-surface-soft text-muted-foreground border-hairline",
  },
}

export function StatusBadge({ status, label, size = "md" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge
      variant="outline"
      className={`rounded-pill border ${config.className} ${size === "sm" ? "text-xs px-2" : "text-xs px-2.5"}`}
    >
      {label ?? config.label}
    </Badge>
  )
}
```

注意：此组件位于 `components/` 共享层，与 `domains/tasks/components/status-badge.tsx`（任务域专用）并存。任务域的专用组件保持不变（它处理更多任务特有的 status 类型）。通用 StatusBadge 只覆盖 3 种跨域通用状态。

- [ ] **Step 2: 验证构建并提交**

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

```bash
cd /home/walker/lifeware
git add frontend/src/components/status-badge.tsx
git commit -m "feat(ui): 新建通用 StatusBadge 组件，支持 active/suspended/archived 状态"
```

---

## Task 5: 新建 EmptyState 组件

**Files:**
- Create: `frontend/src/components/empty-state.tsx`

- [ ] **Step 1: 创建 EmptyState 组件**

新建 `frontend/src/components/empty-state.tsx`：

```tsx
"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import type { LucideIcon } from "lucide-react"

interface EmptyStateProps {
  /** 图标组件（48px） */
  icon: LucideIcon
  /** 标题 */
  title: string
  /** 描述文字 */
  description?: string
  /** 可选操作按钮 */
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <Icon className="size-12 text-muted-foreground/40" />
      <h3 className="mt-4 text-base font-medium text-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-xs text-sm text-body">{description}</p>
      )}
      {action && (
        <Button
          variant="default"
          size="sm"
          onClick={action.onClick}
          className="mt-4"
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
```

设计对齐 §6.6：
- 图标：48px（`size-12`），使用 `text-muted-foreground/40`（淡化效果）
- 标题：`text-base font-medium text-ink`（subtitle 字号）
- 描述：`text-sm text-body`（body 字号）
- 操作按钮：可选，`primary` 变体

- [ ] **Step 2: 验证构建并提交**

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

```bash
cd /home/walker/lifeware
git add frontend/src/components/empty-state.tsx
git commit -m "feat(ui): 新建 EmptyState 组件，对齐 §6.6 空状态规范"
```

---

## Task 6: 新建 Banner 反馈组件

**Files:**
- Create: `frontend/src/components/feedback/banner.tsx`

- [ ] **Step 1: 创建 Banner 组件**

新建目录和文件 `frontend/src/components/feedback/banner.tsx`：

```tsx
"use client"

import { X } from "lucide-react"

type BannerVariant = "info" | "warning" | "error"

interface BannerProps {
  variant: BannerVariant
  title: string
  description?: string
  onClose: () => void
}

const VARIANT_STYLES: Record<BannerVariant, { bar: string; bg: string }> = {
  info: {
    bar: "bg-info",
    bg: "bg-info-soft",
  },
  warning: {
    bar: "bg-warning",
    bg: "bg-warning-soft",
  },
  error: {
    bar: "bg-error",
    bg: "bg-error-soft",
  },
}

export function Banner({ variant, title, description, onClose }: BannerProps) {
  const styles = VARIANT_STYLES[variant]
  return (
    <div
      className={`relative flex items-start gap-3 rounded-md border border-hairline ${styles.bg} p-3 pl-4`}
      role="alert"
    >
      {/* 左侧语义色竖条 */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-md ${styles.bar}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && (
          <p className="mt-0.5 text-xs text-body">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-sm p-1 text-body/40 hover:text-body transition-colors"
        aria-label="关闭"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 在 page.tsx 中替换 LLM 未配置硬编码 div**

文件：`frontend/src/app/page.tsx`

添加导入：
```tsx
import { Banner } from "@/components/feedback/banner"
```

找到 LLM 配置提示（在 Task 3 中已替换为 `bg-warning-soft` 的 div），替换为 Banner 组件：

```tsx
// 旧：
<div className="mb-3 rounded-md border border-warning bg-warning-soft p-3">
  <p className="text-sm text-warning">请先配置大语言模型</p>
  <button type="button" onClick={() => setMainViewState({ type: 'settings', section: 'llm' })}
    className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
    前往设置
  </button>
</div>

// 新：
<Banner
  variant="warning"
  title="请先配置大语言模型"
  description="配置后即可使用 AI 助手功能"
  onClose={() => {}}
/>
```

注意：Phase 1 中 LLM 未配置提示是无条件显示的（不显示时整个 div 不渲染）。Banner 的 `onClose` 暂时为空函数，因为 LLM 未配置时不应允许关闭提示。如果后续需要可关闭功能，需要添加 state 管理。

- [ ] **Step 3: 验证构建并提交**

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

```bash
cd /home/walker/lifeware
git add frontend/src/components/feedback/banner.tsx frontend/src/app/page.tsx
git commit -m "feat(ui): 新建 Banner 反馈组件，替换 LLM 未配置硬编码提示"
```

---

## Task 7: 新建 ChatBubble 组件

**Files:**
- Create: `frontend/src/components/chat-bubble.tsx`

- [ ] **Step 1: 创建 ChatBubble 组件**

新建 `frontend/src/components/chat-bubble.tsx`：

```tsx
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
```

设计对齐 §6.4：
- **User**：右对齐，`bg-primary/10`，`text-ink`，左上/左下圆角缩小（`rounded-tl-sm rounded-bl-sm`）
- **Assistant**：左对齐，`bg-surface-soft`，`text-body`，右上/右下圆角缩小（`rounded-tr-sm rounded-br-sm`）
- **System**：居中，`text-muted-foreground/60`，斜体，无气泡
- 每条消息显示角色标签 + 可选时间戳

- [ ] **Step 2: 验证构建并提交**

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

```bash
cd /home/walker/lifeware
git add frontend/src/components/chat-bubble.tsx
git commit -m "feat(ui): 新建 ChatBubble 组件，对齐 §6.4 消息气泡规范"
```

---

## Task 8: ConversationView 消息渲染 + 空状态增强

**Files:**
- Modify: `frontend/src/components/layout/conversation-view.tsx`

- [ ] **Step 1: 替换消息渲染为 ChatBubble**

在 `conversation-view.tsx` 中：

添加导入：
```tsx
import { ChatBubble } from "@/components/chat-bubble"
import { EmptyState } from "@/components/empty-state"
import { MessageSquare } from "lucide-react"
```

替换消息渲染区域（约第 308-331 行）：

```tsx
// 旧：
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
      {msg.cnuiSurface && (
        <CnuiSurfaceWrapper ... />
      )}
    </div>
  ))}
  <div ref={bottomRef} />
</div>

// 新：
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
```

注意：CN-UI Surface 仅在 assistant 消息中出现。当消息包含 `cnuiSurface` 时，文字内容和 Surface 组件一起放在气泡内。对于非 CN-UI 消息，直接渲染文字。

移除文件顶部的 `ROLE_LABELS` 常量（ChatBubble 内部已定义）。

- [ ] **Step 2: 增强空状态引导**

替换空状态区域（约第 182-305 行，`messages.length === 0` 分支）。

保持现有的输入框、附件、常用意图、最近对话功能不变，但将标题 `有什么可以帮你的？` 替换为结构化引导：

```tsx
{messages.length === 0 ? (
  <div className="flex flex-1 flex-col items-center pt-[10vh] px-4">
    {/* 问候语 */}
    <div className="flex flex-col items-center gap-3 mb-8">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-soft">
        <MessageSquare className="size-7 text-primary" />
      </div>
      <h2 className="font-display text-2xl font-medium text-ink">有什么可以帮你的？</h2>
      <p className="text-sm text-body">通过自然语言描述你的意图，AI 会帮你规划执行</p>
    </div>

    {/* 输入框、常用意图、最近对话 — 以下保持原有代码不变，不做任何修改 */}
  </div>
) : (...)}
```

只替换标题区域（原来的 `<h2>有什么可以帮你的？</h2>`），下方输入框、意图按钮、最近对话保持不变。

- [ ] **Step 3: 确认 timestamp 传入**

`ChatMessage` 类型已有 `timestamp: Timestamp`（即 `string`）字段。在 ChatBubble 使用处传入：

```tsx
<ChatBubble key={i} role={msg.role} timestamp={msg.timestamp}>
```

如果 timestamp 值为 ISO 字符串（如 `"2026-03-19T08:00:00Z"`），可选择性格式化为本地时间。简单实现直接传入原始字符串。

- [ ] **Step 4: 验证构建并提交**

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

```bash
cd /home/walker/lifeware
git add frontend/src/components/layout/conversation-view.tsx
git commit -m "fix(ui): ConversationView 消息渲染使用 ChatBubble，空状态增强引导"
```

---

## Task 9: 视图切换过渡动画

**Files:**
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/components/layout/main-content.tsx`

- [ ] **Step 1: 在 globals.css 中添加过渡动画关键帧**

在文件末尾（`body { ... }` 块之后）添加：

```css
/* ========================================================================
   过渡动画
   ======================================================================== */

@keyframes viewIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-view-in {
  animation: viewIn 200ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .animate-view-in {
    animation: none;
  }
}
```

- [ ] **Step 2: 在 MainContent 中添加过渡效果**

修改 `main-content.tsx`，添加 `key` 触发重新动画：

```tsx
"use client"

import { type ReactNode, useState, useEffect } from "react"

interface MainContentProps {
  children: ReactNode
  /** 传入 view key 变化时触发过渡动画 */
  viewKey?: string
}

export function MainContent({ children, viewKey }: MainContentProps) {
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    if (viewKey !== undefined) {
      setAnimating(true)
      const timer = setTimeout(() => setAnimating(false), 200)
      return () => clearTimeout(timer)
    }
  }, [viewKey])

  return (
    <main
      className={`min-w-0 min-h-0 flex-1 overflow-y-auto bg-canvas p-6 ${animating ? "animate-view-in" : ""}`}
      role="main"
    >
      <div className="w-full h-full">{children}</div>
    </main>
  )
}
```

- [ ] **Step 3: 在 page.tsx 中传入 viewKey**

在 `page.tsx` 中找到使用 `<MainContent>` 的位置，传入 `mainViewState.type` 作为 key：

```tsx
<MainContent viewKey={mainViewState.type}>
  {renderMainContent()}
</MainContent>
```

这样每次视图类型切换（schedule → conversation → action → settings）都会触发 200ms 淡入动画。

- [ ] **Step 4: 验证构建并提交**

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

```bash
cd /home/walker/lifeware
git add frontend/src/app/globals.css frontend/src/components/layout/main-content.tsx frontend/src/app/page.tsx
git commit -m "feat(ui): 视图切换过渡动画（200ms ease-out），尊重 prefers-reduced-motion"
```

---

## Task 10: 键盘交互实施

**Files:**
- Modify: `frontend/src/components/layout/app-shell.tsx`

- [ ] **Step 1: 在 app-shell.tsx 中添加全局键盘监听**

在 `app-shell.tsx` 中添加一个 `useEffect` 来监听全局键盘事件。

需要先读取 `app-shell.tsx` 了解其结构。它当前是一个简单的布局组件。需要：
1. 接收 `onFocusIntentInput` 回调 prop（用于 `/` 快捷键）
2. 添加 `useEffect` 监听 `keydown`

```tsx
// 在 import 区域添加：
import { useEffect } from "react"

// 添加到 interface：
interface AppShellProps {
  topNav?: ReactNode
  leftPanel?: ReactNode
  mainContent?: ReactNode
  /** `/` 键聚焦意图输入框的回调 */
  onFocusIntentInput?: () => void
}

// 在组件函数内添加 effect：
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    // `/` 键聚焦意图输入框（排除已在输入框中的情况）
    if (e.key === "/" && !isEditable(e.target)) {
      e.preventDefault()
      onFocusIntentInput?.()
    }
  }

  window.addEventListener("keydown", handleKeyDown)
  return () => window.removeEventListener("keydown", handleKeyDown)
}, [onFocusIntentInput])

// 辅助函数（组件外部）：
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  )
}
```

注意：`Escape` 关闭模态/对话框和 `Ctrl/Cmd + Enter` 提交表单的功能：
- `Escape`：shadcn/ui 的 Dialog/Sheet/AlertDialog 已内置支持，无需额外实现
- `Ctrl/Cmd + Enter`：表单的 `<form onSubmit>` 已覆盖，需确认 `<textarea>` 中也支持。在 `conversation-view.tsx` 的输入框是 `<input type="text">`，Enter 即可提交。如果后续有 `<textarea>` 场景，需单独处理。

- [ ] **Step 2: 在 page.tsx 中传入 onFocusIntentInput**

在 `page.tsx` 中找到 `<AppShell>` 的使用位置，添加 prop：

```tsx
<AppShell
  onFocusIntentInput={focusIntentInput}
  ...existing props
>
```

其中 `focusIntentInput` 需要聚焦到对话输入框。在 page.tsx 中，当 LeftPanel 的 `activeTab` 为 `assistant` 且当前视图不是 conversation 时，需要先切换到 conversation 视图。简化实现：

```tsx
// 在 page.tsx 组件内添加：
const handleFocusIntentInput = useCallback(() => {
  if (mainViewState.type !== 'conversation') {
    // 切换到对话视图
    const activeSessionId = sessions[0]?.id
    if (activeSessionId) {
      setMainViewState({ type: 'conversation', sessionId: activeSessionId })
    } else {
      // 创建新会话 — 使用现有的新建会话逻辑
      handleNewSession()
    }
  }
  // 聚焦输入框 — 通过 ref 或直接查询
  // conversation-view.tsx 已有 inputRef.current?.focus()
  // 简单实现：延迟聚焦让视图切换完成
  setTimeout(() => {
    document.querySelector<HTMLInputElement>('input[placeholder="输入消息..."]')?.focus()
  }, 100)
}, [mainViewState.type, sessions])
```

注意：这是一个简单实现。更精确的做法是通过 ref 传递，但那需要跨组件 ref forwarding（属于 Phase 3 page.tsx 拆分的范畴）。

- [ ] **Step 3: 验证构建并提交**

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

```bash
cd /home/walker/lifeware
git add frontend/src/components/layout/app-shell.tsx frontend/src/app/page.tsx
git commit -m "feat(ui): 全局键盘交互，/ 聚焦意图输入框"
```

---

## Task 11: Phase 2 完整验收

- [ ] **Step 1: 构建验证**

```bash
cd /home/walker/lifeware/frontend && npm run build
```

Expected: 构建成功，无 TypeScript 错误。

- [ ] **Step 2: §14 检查清单验收**

```bash
# C-01 色彩合规
cd /home/walker/lifeware/frontend/src
grep -rn "bg-red-\|text-red-\|bg-amber-\|text-amber-\|bg-gray-\|text-gray-\|bg-green-\|text-green-\|bg-blue-\|text-blue-" --include="*.tsx" | grep -v node_modules
# Expected: 零匹配

# C-02 图标 + 加载
grep -rn "<svg" --include="*.tsx" | grep -v node_modules | grep -v lucide
# Expected: 零匹配
grep -rn "加载中" --include="*.tsx" | grep -v node_modules | grep -v __tests__
# Expected: 零匹配

# C-04 交互
grep -rn "alert(" --include="*.tsx" | grep -v node_modules | grep -v "AlertDialog" | grep -v "toast"
# Expected: 零匹配

# z-index 规范
grep -rn "z-50" --include="*.tsx" | grep -v node_modules
# Expected: 零匹配（所有 z-50 已替换为令牌）
```

- [ ] **Step 3: 组件清单验证**

逐项确认：
1. `ChatBubble` 组件存在，user/assistant/system 三种角色渲染正确
2. `EmptyState` 组件存在，icon + title + description + action 结构完整
3. `Banner` 组件存在，info/warning/error 三种变体样式正确
4. `StatusBadge` 组件存在，active/suspended/archived 三种状态正确
5. `LeftPanel` 使用 shadcn/ui Tabs（非手写 button）
6. `GrowthMenu` 快捷键标签直接可见（非仅 hover title）
7. 视图切换有 200ms 过渡动画
8. `/` 键可聚焦意图输入框
9. shadcn 组件 z-index 对齐 §7.3 规范
10. `prefers-reduced-motion` 禁用动画

- [ ] **Step 4: 最终提交（如有遗漏修复）**

```bash
cd /home/walker/lifeware
git add -A
git commit -m "fix(ui): Phase 2 验收修复"
```
