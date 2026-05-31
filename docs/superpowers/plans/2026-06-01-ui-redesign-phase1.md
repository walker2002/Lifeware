# UI 重构 Phase 1 — 快速修正 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 UI-DESIGN-SPEC 规范违规，包括硬编码颜色、内联 SVG、alert() 调用、加载状态文本、确认对话框按钮顺序、TopNav 图标和主页 Banner。

**Architecture:** 逐项修正，无架构变更。每个任务独立 PR，不改动 page.tsx 的核心逻辑。新增 CSS 变量在 globals.css 中补齐。新增组件（HomeBanner）为纯展示组件，通过 props 接收数据。

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Lucide React

**规范依据:** `docs/UI-DESIGN-SPEC.md`（§1.1–§1.5 颜色, §6.1 按钮, §6.4 气泡, §6.7 加载, §8.1 导航, §11 图标）

---

## 文件结构

### 修改文件
| 文件 | 变更 |
|------|------|
| `frontend/src/app/globals.css` | 补齐 Info 色、语义色 Soft 变体 CSS 变量 + Tailwind 映射 |
| `frontend/src/app/layout.tsx` | 添加 `<Toaster />` |
| `frontend/src/components/layout/top-nav.tsx` | 内联 SVG → Lucide，添加 APP 图标 |
| `frontend/src/components/layout/conversation-view.tsx:87` | `alert()` → `toast.error()` |
| `frontend/src/domains/habits/pages/HabitListPage.tsx:258,270-274,310-318` | 加载骨架屏 + 颜色令牌 + 按钮顺序 |
| `frontend/src/domains/tasks/components/projects-view.tsx:27` | 加载骨架屏 |
| `frontend/src/app/page.tsx:776-777,889-897` | amber → warning-soft + 过渡确认对话框 z-index + 颜色 |
| 硬编码颜色文件（~20 个） | 全局替换非令牌颜色 |

### 新增文件
| 文件 | 职责 |
|------|------|
| `frontend/src/components/layout/home-banner.tsx` | 主页通栏信息摘要（纯展示） |

### 安装
| 组件 | 命令 |
|------|------|
| tabs, skeleton, sonner | `npx shadcn@latest add tabs skeleton sonner` |

---

## Task 1: 补齐 CSS 变量 + 安装 shadcn/ui 组件

**Files:**
- Modify: `frontend/src/app/globals.css`
- Create: `frontend/src/components/ui/tabs.tsx`, `skeleton.tsx`, `sonner.tsx`（通过 shadcn CLI）

- [ ] **Step 1: 安装 shadcn/ui 组件**

```bash
cd /home/walker/lifeware/frontend
npx shadcn@latest add tabs skeleton sonner
```

验证：`ls src/components/ui/tabs.tsx src/components/ui/skeleton.tsx src/components/ui/sonner.tsx` 三个文件都存在。

- [ ] **Step 2: 在 globals.css 的 `:root` 中补齐缺失变量**

在 `:root` 块中 `--error: #c64545;` 行之后添加：

```css
  --info: #5b8fb9;
  --success-soft: #e8f5ec;
  --warning-soft: #fdf6e3;
  --error-soft: #fde8e8;
  --info-soft: #e8f0f8;

  /* --- 交互叠加色（UI-DESIGN-SPEC §1.5）--- */
  --hover-overlay: rgba(20,20,19,0.04);
  --pressed-overlay: rgba(20,20,19,0.08);
  --focus-ring: rgba(204,120,92,0.3);
  --scrim: rgba(20,20,19,0.5);
```

- [ ] **Step 3: 在 globals.css 的 `@theme inline` 块中补齐 Tailwind 映射**

在 `--color-error: var(--error);` 行之后添加：

```css
  --color-info: var(--info);
  --color-success-soft: var(--success-soft);
  --color-warning-soft: var(--warning-soft);
  --color-error-soft: var(--error-soft);
  --color-info-soft: var(--info-soft);

  --color-hover-overlay: var(--hover-overlay);
  --color-pressed-overlay: var(--pressed-overlay);
  --color-focus-ring: var(--focus-ring);
  --color-scrim: var(--scrim);
```

- [ ] **Step 4: 验证构建通过**

```bash
cd /home/walker/lifeware/frontend
npm run build 2>&1 | tail -5
```

Expected: 构建成功（`✓ Compiled successfully` 或无错误退出）。

- [ ] **Step 5: 提交**

```bash
cd /home/walker/lifeware
git add frontend/src/app/globals.css frontend/src/components/ui/tabs.tsx frontend/src/components/ui/skeleton.tsx frontend/src/components/ui/sonner.tsx
git commit -m "feat(ui): 补齐语义色 CSS 变量，安装 tabs/skeleton/sonner 组件"
```

---

## Task 2: TopNav 替换内联 SVG + 添加 APP 图标

**Files:**
- Modify: `frontend/src/components/layout/top-nav.tsx`

- [ ] **Step 1: 替换内联 SVG 并添加 APP 图标**

将 `top-nav.tsx` 整体替换为：

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, Menu, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TopNavProps {
  onMenuClick?: () => void;
  onSettingsClick?: () => void;
  isPanelOpen?: boolean;
}

export function TopNav({ onMenuClick, onSettingsClick, isPanelOpen }: TopNavProps) {
  return (
    <header
      className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-hairline bg-canvas px-4"
      role="banner"
    >
      <div className="flex items-center gap-2">
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onMenuClick}
            aria-label={isPanelOpen ? "收起 AI 面板" : "展开 AI 面板"}
          >
            <Menu className="size-5 text-body" />
          </Button>
        )}
        <Image
          src="/Lifeware APP 图标.png"
          alt="Lifeware"
          width={28}
          height={28}
          className="rounded-lg"
          priority
        />
        <Link
          href="/"
          className="font-display text-xl font-medium text-ink hover:opacity-80 transition-opacity"
          aria-label="Lifeware 首页"
        >
          Lifeware
        </Link>
      </div>

      <nav className="flex items-center gap-1" aria-label="主导航">
        <Button variant="ghost" size="icon-sm" aria-label="通知">
          <Bell className="size-[18px] text-body" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="设置" onClick={onSettingsClick}>
          <Settings className="size-[18px] text-body" />
        </Button>
      </nav>
    </header>
  );
}
```

关键变更：
- 内联 SVG → `<Bell />` + `<Settings />` 从 lucide-react 导入
- 添加 `<Image>` APP 图标（28×28px, rounded-lg）
- TopNav 高度从 `h-16`(64px) 改为 `h-14`(56px)，与 §8.1 规范对齐
- 添加 `sticky top-0 z-40`，与 §8.1 规范对齐

- [ ] **Step 2: 验证 TopNav 渲染正常**

```bash
cd /home/walker/lifeware/frontend
npm run build 2>&1 | tail -5
```

Expected: 构建成功。

- [ ] **Step 3: 提交**

```bash
cd /home/walker/lifeware
git add frontend/src/components/layout/top-nav.tsx
git commit -m "fix(ui): TopNav 替换内联 SVG 为 Lucide 图标，添加 APP 图标，对齐规范高度"
```

---

## Task 3: 全局替换硬编码颜色为语义令牌

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/components/layout/confirm-delete-dialog.tsx`
- Modify: `frontend/src/components/layout/session-list.tsx`
- Modify: `frontend/src/components/editor/dynamic-form.tsx`
- Modify: `frontend/src/components/cnui/CnuiRenderer.tsx`
- Modify: `frontend/src/components/cnui/cnui-form-adapter.tsx`
- Modify: `frontend/src/components/cnui/CnuiSurfaceWrapper.tsx`
- Modify: `frontend/src/domains/habits/pages/HabitListPage.tsx`
- Modify: `frontend/src/domains/habits/components/habit-form.tsx`
- Modify: `frontend/src/domains/habits/components/habit-list.tsx`
- Modify: `frontend/src/domains/habits/components/habit-template-view.tsx`
- Modify: `frontend/src/domains/habits/components/habit-card.tsx`
- Modify: `frontend/src/domains/habits/pages/HabitTemplatePage.tsx`
- Modify: `frontend/src/domains/habits/components/statistics/HabitStatsWeekView.tsx`
- Modify: `frontend/src/domains/habits/components/statistics/HabitStatsDayView.tsx`
- Modify: `frontend/src/domains/habits/cnui/surfaces/HabitActionPanel.tsx`
- Modify: `frontend/src/domains/habits/cnui/surfaces/HabitCheckinPanel.tsx`
- Modify: `frontend/src/domains/habits/cnui/surfaces/HabitListCard.tsx`
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx`
- Modify: `frontend/src/domains/timebox/components/timebox-card.tsx`
- Modify: `frontend/src/domains/timebox/components/timebox-timeline.tsx`
- Modify: `frontend/src/domains/timebox/cnui/surfaces/TimeboxList.tsx`
- Modify: `frontend/src/domains/okrs/components/kr-progress.tsx`
- Modify: `frontend/src/domains/okrs/components/okr-import-panel.tsx`
- Modify: `frontend/src/domains/okrs/components/okr-form.tsx`
- Modify: `frontend/src/components/execution-log-dialog.tsx`

> **注意：** 这是最多文件的任务。实施者应逐文件替换，每个文件改完后立即检查构建。替换模式参见下方规则表。

### 替换规则表

所有替换遵循以下模式（`X` 表示变量部分）：

| 搜索模式 | 替换为 | 语义 |
|----------|--------|------|
| `bg-red-50` | `bg-error-soft` | 错误背景 |
| `border-red-200` / `border-red-300` | `border-error` | 错误边框 |
| `text-red-400` / `text-red-500` / `text-red-600` / `text-red-800` | `text-error` | 错误文字 |
| `bg-red-100` | `bg-error-soft` | 错误背景（浅） |
| `bg-red-200` | `bg-error-soft` | 错误背景按钮 |
| `hover:bg-red-300` | `hover:bg-error-soft/80` | 错误背景悬停 |
| `bg-red-500` / `bg-red-600` | `bg-error` | 错误实色 |
| `hover:bg-red-600` / `hover:bg-red-700` | `hover:bg-error/90` | 错误实色悬停 |
| `text-green-600` | `text-success` | 成功文字 |
| `bg-green-500` | `bg-success` | 成功实色 |
| `bg-amber-50` | `bg-warning-soft` | 警告背景 |
| `bg-amber-100` | `bg-warning-soft` | 警告背景（浅） |
| `border-amber-200` / `border-amber-300` | `border-warning` | 警告边框 |
| `text-amber-600` / `text-amber-800` | `text-warning` | 警告文字 |
| `bg-amber-500` | `bg-warning` | 警告实色 |
| `hover:bg-amber-600` | `hover:bg-warning/90` | 警告实色悬停 |
| `text-gray-300` / `text-gray-400` | `text-muted` | 灰色文字 |
| `bg-gray-100` | `bg-surface-card` | 灰色背景 |
| `bg-gray-400` / `bg-gray-500` | `bg-muted` | 灰色实色（按钮等） |
| `hover:bg-gray-500` / `hover:bg-gray-600` | `hover:bg-muted/80` | 灰色悬停 |
| `bg-gray-50` | `bg-surface-card` | 极浅灰背景 |
| `border-gray-300` | `border-hairline` | 灰色边框 |
| `bg-black/50` | `bg-scrim` | 遮罩 |
| `bg-white` (在弹窗中) | `bg-canvas` | 白色背景 |
| `text-white` (在深色按钮中) | `text-on-primary` | 白色文字 |

- [ ] **Step 1: 替换 `page.tsx` 中的硬编码颜色**

文件：`frontend/src/app/page.tsx`

修改第 776-782 行的 LLM 配置提示：

```tsx
// 旧：
<div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3">
  <p className="text-sm text-amber-800">请先配置大语言模型</p>
  <button type="button" onClick={() => setMainViewState({ type: 'settings', section: 'llm' })}
    className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
    前往设置
  </button>
</div>

// 新：
<div className="mb-3 rounded-md border border-warning bg-warning-soft p-3">
  <p className="text-sm text-warning">请先配置大语言模型</p>
  <button type="button" onClick={() => setMainViewState({ type: 'settings', section: 'llm' })}
    className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
    前往设置
  </button>
</div>
```

修改第 889-897 行的过渡确认对话框：

```tsx
// 旧：
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
  <div className="mx-4 max-w-sm rounded-lg bg-white p-6 shadow-lg">

// 新：
<div className="fixed inset-0 z-40 flex items-center justify-center bg-scrim">
  <div className="mx-4 max-w-sm rounded-lg bg-canvas p-6 shadow-lg">
```

注意：`z-50` → `z-40`（对齐 §7.3 modal 层级），`bg-black/50` → `bg-scrim`（对齐 §1.5），`bg-white` → `bg-canvas`。

- [ ] **Step 2: 批量替换其余文件**

对以下每个文件，使用替换规则表中的模式进行替换。每替换 5 个文件后运行一次 `npm run build` 验证。

**组 A — 组件层**：
1. `frontend/src/components/layout/confirm-delete-dialog.tsx:28` — `bg-red-600 hover:bg-red-700` → `bg-error hover:bg-error/90`
2. `frontend/src/components/layout/session-list.tsx:101` — `text-red-500` → `text-error`
3. `frontend/src/components/editor/dynamic-form.tsx:152,156` — `text-red-500` → `text-error`
4. `frontend/src/components/cnui/CnuiRenderer.tsx:22` — `border-red-300 text-red-500` → `border-error text-error`
5. `frontend/src/components/cnui/cnui-form-adapter.tsx:51` — 同上；`:71` — `bg-red-50 text-red-800` → `bg-error-soft text-error`

构建验证：`npm run build`

**组 B — CNUI 表面**：
6. `frontend/src/components/cnui/CnuiSurfaceWrapper.tsx:65` — `border-red-300 bg-red-50 text-red-800` → `border-error bg-error-soft text-error`
7. `frontend/src/components/execution-log-dialog.tsx` — 多处替换（amber → warning-soft, red → error-soft/error, green → success, gray → surface-card）

构建验证：`npm run build`

**组 C — 习惯领域**：
8. `frontend/src/domains/habits/pages/HabitListPage.tsx:270-274` — 错误横幅替换
9. `frontend/src/domains/habits/components/habit-form.tsx:338` — 错误提示替换
10. `frontend/src/domains/habits/components/habit-list.tsx:256,294,363` — 按钮和错误提示替换
11. `frontend/src/domains/habits/components/habit-template-view.tsx:94,100` — amber → warning-soft
12. `frontend/src/domains/habits/components/habit-card.tsx:157` — `text-gray-400` → `text-muted`
13. `frontend/src/domains/habits/pages/HabitTemplatePage.tsx:88,93` — 同 HabitListPage 模式

构建验证：`npm run build`

**组 D — 习惯统计 + CNUI 面板**：
14. `frontend/src/domains/habits/components/statistics/HabitStatsWeekView.tsx` — 所有 amber/red/gray → 语义令牌
15. `frontend/src/domains/habits/components/statistics/HabitStatsDayView.tsx` — 同上
16. `frontend/src/domains/habits/cnui/surfaces/HabitActionPanel.tsx:111,119` — `text-gray-400` → `text-muted`
17. `frontend/src/domains/habits/cnui/surfaces/HabitCheckinPanel.tsx:115,118,133` — `text-gray-400` → `text-muted`, `bg-gray-400` → `bg-muted`
18. `frontend/src/domains/habits/cnui/surfaces/HabitListCard.tsx:64` — `bg-gray-100 text-gray-600` → `bg-surface-card text-muted`

构建验证：`npm run build`

**组 E — 任务 + 时间盒 + OKR**：
19. `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx:107,110` — `text-gray-400` → `text-muted`
20. `frontend/src/domains/timebox/components/timebox-card.tsx` — 多处 red/green/gray 替换
21. `frontend/src/domains/timebox/components/timebox-timeline.tsx:22` — `bg-gray-300/20 border-gray-300` → `bg-surface-card/50 border-hairline`
22. `frontend/src/domains/timebox/cnui/surfaces/TimeboxList.tsx:53` — `text-red-400 hover:text-red-600` → `text-error/70 hover:text-error`
23. `frontend/src/domains/okrs/components/kr-progress.tsx:34,38-39` — `bg-gray-400/300` → `bg-muted` / `bg-hairline`
24. `frontend/src/domains/okrs/components/okr-import-panel.tsx:68` — `bg-red-50 text-red-800 border-red-200` → `bg-error-soft text-error border-error`
25. `frontend/src/domains/okrs/components/okr-form.tsx:167,175` — `bg-red-600 text-white` → `bg-error text-on-primary`; `bg-gray-500 text-white` → `bg-muted text-on-primary`

构建验证：`npm run build`

- [ ] **Step 3: 全局搜索验证零残留**

```bash
cd /home/walker/lifeware/frontend/src
grep -rn "bg-red-\|text-red-\|bg-amber-\|text-amber-\|bg-green-\|text-green-\|bg-gray-\|text-gray-" --include="*.tsx" --include="*.ts" | grep -v "node_modules" | grep -v ".next"
```

Expected: 零匹配。如果有残留，逐个替换。

- [ ] **Step 4: 提交**

```bash
cd /home/walker/lifeware
git add -A
git commit -m "fix(ui): 全局替换硬编码颜色为语义令牌，对齐 UI-DESIGN-SPEC 色彩规范"
```

---

## Task 4: 消除 alert() 调用 + 添加 Toaster

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/components/layout/conversation-view.tsx`

- [ ] **Step 1: 在 layout.tsx 中添加 Toaster**

```tsx
// layout.tsx — 在 import 区域添加：
import { Toaster } from "@/components/ui/sonner";

// 在 JSX 中，<TooltipProvider> 的同级下方添加 <Toaster />：
<TooltipProvider delayDuration={200}>{children}</TooltipProvider>
<Toaster position="bottom-center" richColors />
```

- [ ] **Step 2: 在 conversation-view.tsx 中替换 alert() 为 toast**

```tsx
// 在 import 区域添加：
import { toast } from "sonner"

// 第 87 行，替换：
// 旧：alert(validation.error)
// 新：toast.error(validation.error)
```

- [ ] **Step 3: 验证构建**

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: 提交**

```bash
cd /home/walker/lifeware
git add frontend/src/app/layout.tsx frontend/src/components/layout/conversation-view.tsx
git commit -m "fix(ui): 替换 alert() 为 sonner toast，添加全局 Toaster"
```

---

## Task 5: 统一确认对话框按钮顺序 + 修正过渡确认框

**Files:**
- Modify: `frontend/src/domains/habits/pages/HabitListPage.tsx`
- Modify: `frontend/src/app/page.tsx`（已在 Task 3 修改了 z-index，此处调整按钮顺序）

- [ ] **Step 1: 修正 HabitListPage 确认对话框按钮顺序**

文件：`frontend/src/domains/habits/pages/HabitListPage.tsx`，第 310-318 行。

```tsx
// 旧：
<AlertDialogFooter>
  <AlertDialogAction
    onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}
  >
    确认
  </AlertDialogAction>
  <AlertDialogCancel onClick={() => setDeleteConfirm(null)}>
    取消
  </AlertDialogCancel>
</AlertDialogFooter>

// 新（取消在前，确认在后，对齐 §9.3）：
<AlertDialogFooter>
  <AlertDialogCancel onClick={() => setDeleteConfirm(null)}>
    取消
  </AlertDialogCancel>
  <AlertDialogAction
    onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}
    className="bg-error text-on-primary hover:bg-error/90"
  >
    确认
  </AlertDialogAction>
</AlertDialogFooter>
```

- [ ] **Step 2: 确认 page.tsx 过渡对话框按钮顺序**

文件：`frontend/src/app/page.tsx`，第 892-894 行。

当前代码已经是 `[取消] [确认]` 顺序（`outline` 在前，`primary` 在后），符合 §9.3。无需修改。但确认按钮是破坏性操作时，应使用 destructive 样式。此处暂保留，待 Phase 2 统一处理。

- [ ] **Step 3: 验证构建并提交**

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

```bash
cd /home/walker/lifeware
git add frontend/src/domains/habits/pages/HabitListPage.tsx
git commit -m "fix(ui): 统一确认对话框按钮顺序为取消（左）+ 确认（右），对齐 §9.3"
```

---

## Task 6: 加载状态替换为骨架屏

**Files:**
- Modify: `frontend/src/domains/habits/pages/HabitListPage.tsx`
- Modify: `frontend/src/domains/tasks/components/projects-view.tsx`

- [ ] **Step 1: 替换 HabitListPage 加载状态**

文件：`frontend/src/domains/habits/pages/HabitListPage.tsx`，第 256-262 行。

```tsx
// 旧：
if (isLoading) {
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sm text-muted-foreground">加载中...</p>
    </div>
  )
}

// 新：
if (isLoading) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg bg-surface-card p-4">
          <div className="size-5 rounded-full bg-hairline animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded bg-hairline animate-pulse" />
            <div className="h-3 w-1/3 rounded bg-hairline animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 替换 ProjectsView 加载状态**

文件：`frontend/src/domains/tasks/components/projects-view.tsx`，第 25-31 行。

```tsx
// 旧：
if (!data) {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <p className="text-sm">加载中...</p>
    </div>
  )
}

// 新：
if (!data) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-lg bg-surface-card p-4 space-y-3">
          <div className="h-5 w-1/3 rounded bg-hairline animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-hairline animate-pulse" />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: 全局搜索确认无 "加载中" 文本残留**

```bash
cd /home/walker/lifeware/frontend/src
grep -rn "加载中" --include="*.tsx" --include="*.ts" | grep -v "node_modules"
```

Expected: 零匹配或仅含注释。如果有残留，替换为骨架屏。

- [ ] **Step 4: 验证构建并提交**

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

```bash
cd /home/walker/lifeware
git add frontend/src/domains/habits/pages/HabitListPage.tsx frontend/src/domains/tasks/components/projects-view.tsx
git commit -m "fix(ui): 替换「加载中」文本为骨架屏，对齐 §6.7 加载状态规范"
```

---

## Task 7: 新建 HomeBanner 组件

**Files:**
- Create: `frontend/src/components/layout/home-banner.tsx`
- Modify: `frontend/src/app/page.tsx`（仅插入组件，不新增 state）

- [ ] **Step 1: 创建 HomeBanner 组件**

新建 `frontend/src/components/layout/home-banner.tsx`：

```tsx
"use client";

import { Check, Clock, ListTodo, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HomeBannerProps {
  /** 今日待办总数 */
  totalTodos?: number;
  /** 今日已完成数 */
  completedTodos?: number;
  /** 习惯打卡进度（如 "3/5"） */
  habitProgress?: string;
  /** 习惯连续天数 */
  habitStreak?: number;
  /** 完成百分比（0-100），用于进度条 */
  completionPercent?: number;
  /** 快捷操作回调 */
  onAction: (domainId: string, action: string) => void;
}

const QUICK_ACTIONS = [
  { label: "创建时间盒", icon: Clock, domainId: "timebox", action: "createTimebox" },
  { label: "打卡习惯", icon: Check, domainId: "habits", action: "checkinHabits" },
  { label: "新建任务", icon: ListTodo, domainId: "tasks", action: "createTask" },
  { label: "开始复盘", icon: RotateCcw, domainId: "timebox", action: "review" },
] as const;

export function HomeBanner({
  totalTodos = 0,
  completedTodos = 0,
  habitProgress = "--",
  habitStreak = 0,
  completionPercent = 0,
  onAction,
}: HomeBannerProps) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const weekDay = weekDays[today.getDay()];

  return (
    <div className="border-b border-hairline bg-surface-soft px-6 py-4 max-md:px-4 max-md:py-3">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 max-md:flex-col max-md:items-start max-md:gap-3">
        {/* 左侧：今日概览 */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted">
            {dateStr} {weekDay}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-body">
            <span>
              今日待办 <strong className="font-medium text-ink">{totalTodos}</strong> · 已完成{" "}
              <strong className="font-medium text-ink">{completedTodos}</strong>
            </span>
            <span>
              习惯打卡 <strong className="font-medium text-ink">{habitProgress}</strong>
              {habitStreak > 0 && <> · 连续 <strong className="font-medium text-ink">{habitStreak}</strong> 天</>}
            </span>
          </div>
          {/* 进度条 */}
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2 flex-1 rounded-full bg-hairline">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, Math.max(0, completionPercent))}%` }}
              />
            </div>
            <span className="text-xs text-muted">{completionPercent}%</span>
          </div>
        </div>

        {/* 右侧：快捷操作 */}
        <div className="flex flex-wrap gap-2 max-md:hidden">
          {QUICK_ACTIONS.map((act) => (
            <Button
              key={act.action}
              variant="outline"
              size="sm"
              onClick={() => onAction(act.domainId, act.action)}
            >
              <act.icon className="size-3.5" />
              {act.label}
            </Button>
          ))}
        </div>
        {/* 移动端：2 个主操作 */}
        <div className="hidden gap-2 max-md:flex">
          {QUICK_ACTIONS.slice(0, 2).map((act) => (
            <Button
              key={act.action}
              variant="outline"
              size="default"
              onClick={() => onAction(act.domainId, act.action)}
            >
              <act.icon className="size-3.5" />
              {act.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在 page.tsx 的 schedule 视图中集成 HomeBanner**

文件：`frontend/src/app/page.tsx`

在文件顶部 import 区域添加：
```tsx
import { HomeBanner } from "@/components/layout/home-banner";
```

修改 `renderMainContent()` 中 `mainViewState.type === 'schedule'` 分支（约第 795-804 行）：

```tsx
// 旧：
if (mainViewState.type === 'schedule') {
  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="text-lg font-bold text-ink">我的时间盒</h1>
      <DateNav mode={dateMode} currentDate={currentDate} onModeChange={handleDateModeChange} onNavigate={handleNavigate} />
      ...
    </div>
  );
}

// 新：
if (mainViewState.type === 'schedule') {
  return (
    <div className="flex w-full flex-col gap-4">
      <HomeBanner
        onAction={handleGrowthAction}
      />
      <DateNav mode={dateMode} currentDate={currentDate} onModeChange={handleDateModeChange} onNavigate={handleNavigate} />
      {dateMode === "day" && <DayView timeboxes={timeboxes} currentDate={currentDate} onDateSelect={handleDateSelect} onAction={handleTimeboxAction} />}
      {dateMode === "week" && <WeekView timeboxes={timeboxes} currentDate={currentDate} />}
      {dateMode === "month" && <MonthView timeboxes={timeboxes} currentDate={currentDate} />}
    </div>
  );
}
```

注意：Phase 1 中 HomeBanner 不传统计数据 props，使用默认占位值（`totalTodos=0` 等）。Phase 3 拆分后从 ScheduleView 传入真实数据。移除了 `<h1>我的时间盒</h1>`，因为 Banner 已包含日期和概览信息。

- [ ] **Step 3: 验证构建**

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: 提交**

```bash
cd /home/walker/lifeware
git add frontend/src/components/layout/home-banner.tsx frontend/src/app/page.tsx
git commit -m "feat(ui): 新建 HomeBanner 组件，替换主页标题为通栏信息摘要"
```

---

## Task 8: 全局替换剩余内联 SVG + 统一 stroke width

**Files:**
- Modify: `frontend/src/components/layout/session-list.tsx`
- Modify: `frontend/src/components/layout/conversation-view.tsx`
- Modify: `frontend/src/domains/timebox/components/timebox-card.tsx`
- Modify: `frontend/src/components/editor/intent-input.tsx`（如果存在）
- Modify: `frontend/src/components/editor/intent-form.tsx`（如果存在）
- Modify: `frontend/src/components/editor/file-uploader.tsx`（如果存在）
- Modify: `frontend/src/domains/habits/components/statistics/HabitStatsWeekView.tsx`
- Modify: `frontend/src/domains/habits/components/statistics/HabitStatsDayView.tsx`

> **注意：** TopNav 的内联 SVG 已在 Task 2 中替换。本任务处理其余文件。

- [ ] **Step 1: 全局搜索定位所有内联 SVG**

```bash
cd /home/walker/lifeware/frontend/src
grep -rn "<svg" --include="*.tsx" | grep -v "node_modules" | grep -v "lucide"
```

记录每个匹配位置，逐个替换为对应的 Lucide 组件。

- [ ] **Step 2: 逐文件替换内联 SVG**

对每个匹配的文件：
1. 确定内联 SVG 的语义（如删除图标→`Trash2`，发送图标→`Send`，附件→`Paperclip`等）
2. 在 import 中添加对应的 Lucide 组件
3. 将 `<svg>...</svg>` 替换为 `<IconName className="size-..." />`
4. 确保 className 中的颜色使用令牌

- [ ] **Step 3: 统一 stroke width**

```bash
cd /home/walker/lifeware/frontend/src
grep -rn "strokeWidth" --include="*.tsx" | grep -v "node_modules"
```

移除所有非必要的显式 `strokeWidth` 覆盖（Lucide 默认 strokeWidth=2，无需显式指定）。仅保留确实需要不同 stroke width 的场景（如特殊的装饰性图标）。

- [ ] **Step 4: 验证无残留**

```bash
cd /home/walker/lifeware/frontend/src
grep -rn "<svg" --include="*.tsx" | grep -v "node_modules" | grep -v "lucide"
```

Expected: 零匹配。

```bash
cd /home/walker/lifeware/frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 5: 提交**

```bash
cd /home/walker/lifeware
git add -A
git commit -m "fix(ui): 全局替换内联 SVG 为 Lucide 图标，统一 stroke width"
```

---

## Task 9: Phase 1 完整验收

- [ ] **Step 1: 构建验证**

```bash
cd /home/walker/lifeware/frontend && npm run build
```

Expected: 构建成功，无 TypeScript 错误。

- [ ] **Step 2: UI-DESIGN-SPEC §14 检查清单验收**

逐项检查：

```bash
# C-01 色彩合规
cd /home/walker/lifeware/frontend/src
grep -rn "bg-red-\|text-red-\|bg-amber-\|text-amber-\|bg-gray-\|text-gray-\|bg-green-\|text-green-" --include="*.tsx" | grep -v node_modules
# Expected: 零匹配

# C-02 组件规范 — 图标
grep -rn "<svg" --include="*.tsx" | grep -v node_modules | grep -v lucide
# Expected: 零匹配

# C-02 组件规范 — 加载状态
grep -rn "加载中" --include="*.tsx" | grep -v node_modules
# Expected: 零匹配

# C-04 交互 — 无 alert()
grep -rn "alert(" --include="*.tsx" | grep -v node_modules | grep -v "AlertDialog"
# Expected: 零匹配
```

- [ ] **Step 3: 运行 dev server 目视验证**

```bash
cd /home/walker/lifeware/frontend && npm run dev
```

验证项：
1. TopNav 显示 Lifeware APP 图标 + Lucide 图标（Bell, Settings）
2. 主页 schedule 视图顶部显示 HomeBanner
3. 习惯列表页的错误横幅使用正确的语义色
4. 习惯删除确认对话框按钮顺序为 [取消] [确认]
5. 加载状态显示骨架屏而非"加载中..."
6. conversation-view 文件上传错误显示 toast 而非 alert

- [ ] **Step 4: 最终提交（如有遗漏修复）**

```bash
cd /home/walker/lifeware
git add -A
git commit -m "fix(ui): Phase 1 验收修复"
```
