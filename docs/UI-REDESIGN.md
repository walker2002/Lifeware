# Lifeware 界面优化实施规划

> 版本：v1.1 | 更新日期：2026-06-01
> 状态：待执行
> 变更记录：v1.1 根据规范审查修正圆角方向、类名、移动端导航、新增遗漏任务
> 规范依据：`docs/UI-DESIGN-SPEC.md`（界面设计规范）
> 代码基准：main 分支 9d148f5

---

## 一、现状问题清单

### P0 — 结构性问题（影响架构演进）

| ID | 问题 | 位置 | 详细说明 |
|----|------|------|----------|
| S1 | page.tsx 巨型组件 | `app/page.tsx`（900+ 行） | 所有路由逻辑、40+ 个 state、事件处理、渲染函数集中在一个文件。任何状态变化触发整个组件重渲染，维护和性能都有隐患 |
| S2 | DESIGN.md 定位偏差 | `DESIGN.md` | 内容是 Claude.com 营销站设计规范（含 hero-band、pricing-tier-card 等营销组件），与 Lifeware 应用场景脱节。已新建 `docs/UI-DESIGN-SPEC.md` 作为应用层规范 |
| S3 | 无暗色模式 | `globals.css` | CSS 变量只定义了亮色 `:root`，缺少 `.dark` 块。`prefers-color-scheme` 未处理 |
| S4 | 移动端导航缺失 | `app-shell.tsx:66` | LeftPanel 在 `< md` 断点直接隐藏（`md:hidden`），无 BottomNav、Sheet 等替代方案。移动端无法访问 AI 助手和成长领域菜单 |

### P1 — 视觉一致性问题

| ID | 问题 | 位置 | 当前写法 | 规范要求 |
|----|------|------|----------|----------|
| V1 | 硬编码错误色 | 全局约 20+ 处 | `bg-red-50`、`bg-amber-100`、`bg-gray-100`、`text-red-600` 等 | 全部替换为语义令牌（详见 T1.3） |
| V2 | TopNav 内联 SVG | `top-nav.tsx:46-55` | 15 行内联 SVG path | 使用 `lucide-react` 的 `Bell`, `Settings` |
| V3 | 消息无视觉区分 | `conversation-view.tsx:311-326` | 用户/AI/系统消息仅颜色不同，布局相同 | 用户右对齐+气泡、AI 左对齐+卡片、系统居中 |
| V4 | Tab 手写样式 | `left-panel.tsx:46-50` | `<button>` + 内联 className 判断 | 使用 shadcn/ui `Tabs` 组件 |
| V5 | 加载状态简陋 | `HabitListPage.tsx:258`、`ProjectsView.tsx:27` | 纯文本"加载中..." | 骨架屏（Skeleton） |
| V6 | 空状态缺少引导 | `conversation-view.tsx:183` | 仅标题"有什么可以帮你的？" | 图标 + 标题 + 描述 + 快捷操作 |
| V7 | TopNav 缺少 APP 图标 | `top-nav.tsx:35-39` | 仅文字 "Lifeware"，无图标 | 在文字左侧显示 `Lifeware APP 图标.png`（28×28px, rounded-lg） |
| V8 | 主页缺少信息摘要 | `page.tsx` schedule 视图 | 仅标题"我的时间盒" + DateNav，无今日概览 | 通栏 Banner：今日统计 + 进度条 + 快捷操作 |

### P2 — 交互体验问题

| ID | 问题 | 位置 | 规范要求 |
|----|------|------|----------|
| I1 | 视图切换无过渡 | `page.tsx` 的 `renderMainContent()` | 200ms ease-out 淡入 + translateY |
| I2 | 使用浏览器 alert() | `conversation-view.tsx:88` | 替换为 Toast |
| I3 | 确认对话框按钮顺序不一致 | `page.tsx:899` vs `HabitListPage.tsx:316` | 破坏性操作：取消（左）+ 确认（右） |
| I4 | 快捷键不可见 | `growth-menu.tsx` | shortcut 值存在但未展示，hover 时 title 才显示 |
| I5 | 反馈系统不统一 | 多处 | 统一使用 Toast（操作反馈）、Inline（验证）、Dialog（确认）、Banner（系统级）。当前 LLM 未配置提示（`page.tsx:776`）用硬编码 `bg-amber-50`，应改为 Banner 组件 |

---

## 二、组件差距分析

### 已安装 shadcn/ui 组件（14 个）

```
button, input, label, textarea,
card, dialog, sheet, alert-dialog,
select, switch, slider,
badge, tooltip, popover,
calendar
```

### 需要新增的 shadcn/ui 组件

| 组件 | 用途 | 优先级 |
|------|------|--------|
| `tabs` | 替换 LeftPanel 手写 Tab | Phase 1 |
| `skeleton` | 替换"加载中..."文本 | Phase 1 |
| `sonner`（Toast） | 统一操作反馈，替换 alert() | Phase 1 |
| `separator` | 语义分隔线 | Phase 2 |
| `scroll-area` | 自定义滚动区域（消息列表） | Phase 2 |
| `dropdown-menu` | 更多操作菜单 | Phase 2 |
| `command` | 全局搜索（Ctrl+K） | Phase 3 |
| `avatar` | 用户头像 | Phase 3 |

### 需要自建的组件

| 组件 | 用途 | 优先级 |
|------|------|--------|
| `HomeBanner` | 主页通栏信息摘要（今日概览 + 快捷操作） | Phase 1 |
| `EmptyState` | 空状态展示（图标+标题+描述+操作） | Phase 2 |
| `ChatBubble` | 消息气泡（区分用户/AI/系统角色） | Phase 2 |
| `Banner` | 系统级消息横幅（页面顶部，手动关闭，用于 LLM 未配置等场景） | Phase 2 |
| `BottomNav` | 移动端底部导航栏 | Phase 3 |
| `PageHeader` | 页面标题区（标题+描述+操作按钮） | Phase 2 |
| `StatusBadge` | 状态徽标（active/suspended/archived） | Phase 2 |
| `LoadingPage` | 页面级骨架屏容器 | Phase 2 |

---

## 三、实施路线

### Phase 1 — 快速修正（1-2 天）

> 目标：消除明显的规范违规，无架构变更，可独立 PR。

#### T1.1 安装缺失的 shadcn/ui 组件

```bash
cd frontend
npx shadcn@latest add tabs skeleton sonner
```

验证：`components/ui/tabs.tsx`、`skeleton.tsx`、`sonner.tsx` 存在。

#### T1.2 全局替换内联 SVG 为 Lucide 图标，统一 stroke width

**TopNav**：
- 文件：`components/layout/top-nav.tsx`
- 替换通知图标内联 SVG → `<Bell />`
- 替换设置图标内联 SVG → `<Settings />`

**其他文件内联 SVG**（全局搜索 `<svg` 确认）：
- `session-list.tsx`：删除图标内联 SVG → `<Trash2 />` 或 `<X />`
- `conversation-view.tsx`：消息图标内联 SVG → 对应 Lucide 组件
- `timebox-card.tsx`：状态图标内联 SVG → 对应 Lucide 组件
- `intent-input.tsx`：发送按钮内联 SVG → `<Send />`
- `intent-form.tsx`：发送按钮内联 SVG → `<Send />`
- `file-uploader.tsx`：附件图标内联 SVG → `<Paperclip />` 或 `<Upload />`

**stroke width 统一**：
- 当前混用 strokeWidth 2/3/4，规范要求同一层级图标保持相同 stroke width
- 统一标准：行内图标 strokeWidth=2（Lucide 默认值），不显式指定
- 搜索 `strokeWidth` 关键字，移除所有非必要的显式 strokeWidth 覆盖

**验证**：全局搜索 `<svg` 确认零匹配（排除 lucide-react 生成的 SVG）。全局搜索 `strokeWidth` 确认仅 Lucide 默认值。

#### T1.3 替换硬编码颜色为语义令牌

**注意**：当前 `globals.css` 缺少 UI-DESIGN-SPEC §1.4 定义的 Info 色及所有语义色 Soft 变体（`--info`、`--success-soft`、`--warning-soft`、`--error-soft`、`--info-soft`）。必须先补齐这些 CSS 变量，再进行颜色替换。

**前置步骤**：在 `globals.css` 的 `:root` 中补齐缺失的 CSS 变量：

```css
/* 语义色 — 补齐缺失变量 */
--info: #5b8fb9;
--success-soft: #e8f5ec;
--warning-soft: #fdf6e3;
--error-soft: #fde8e8;
--info-soft: #e8f0f8;

/* 交互叠加色（UI-DESIGN-SPEC §1.5）*/
--hover-overlay: rgba(20,20,19,0.04);
--pressed-overlay: rgba(20,20,19,0.08);
--focus-ring: rgba(204,120,92,0.3);
--scrim: rgba(20,20,19,0.5);
```

同时在 `@theme inline` 块中添加对应的 Tailwind 映射：

```css
--color-scrim: var(--scrim);
--color-hover-overlay: var(--hover-overlay);
--color-pressed-overlay: var(--pressed-overlay);
--color-focus-ring: var(--focus-ring);
```

**逐文件替换**（按文件分组）：

- `page.tsx:776-777`：`border-amber-200 bg-amber-50 text-amber-800` → `bg-warning-soft border-warning text-warning`
- `page.tsx:889-890`：`bg-black/50` → `bg-scrim`；`bg-white` → `bg-canvas`；`z-50` → `z-40`（modal 层级）
- `HabitListPage.tsx:270-274`：`bg-red-50 border-red-300 text-red-800` → `bg-error-soft border-error text-error`；`bg-red-200 hover:bg-red-300` → `bg-error-soft hover:bg-error-soft/80 text-error`
- `execution-log-dialog.tsx:19-20,117,126,160,201,245`：`bg-amber-100 text-amber-800 border-amber-300` → `bg-warning-soft text-warning border-warning`；`bg-red-100 text-red-800 border-red-300` → `bg-error-soft text-error border-error`；`text-red-600` → `text-error`；`text-green-600` → `text-success`；`bg-gray-100` → `bg-surface-card`
- `confirm-delete-dialog.tsx:28`：`bg-red-600 hover:bg-red-700` → `bg-error hover:bg-error/90`
- `session-list.tsx:101`：`text-red-500` → `text-error`
- `dynamic-form.tsx:152,156`：`text-red-500` → `text-error`
- `CnuiRenderer.tsx:22`、`cnui-form-adapter.tsx:51,71`、`CnuiSurfaceWrapper.tsx:65`：`border-red-300 text-red-500` → `border-error text-error`；`bg-red-50 text-red-800` → `bg-error-soft text-error`
- `timebox-card.tsx:120,173,175,219,229`：`text-red-600` → `text-error`；`bg-red-50 border-red-200` → `bg-error-soft border-error`；`text-green-600` → `text-success`；`bg-red-500` → `bg-error`；`bg-green-500` → `bg-success`
- `timebox-timeline.tsx:22`：`bg-gray-300/20 border-gray-300` → `bg-surface-card/50 border-hairline`
- `habit-form.tsx:338`：`bg-red-50 border-red-300 text-red-800` → `bg-error-soft border-error text-error`
- `habit-list.tsx:256,294,363`：`bg-amber-500 hover:bg-amber-600` → `bg-warning hover:bg-warning/90`；`bg-gray-500 hover:bg-gray-600` → `bg-muted hover:bg-muted/80`；`bg-red-50 border-red-300 text-red-800` → `bg-error-soft border-error text-error`
- `habit-template-view.tsx:94,100`：`bg-amber-100 text-amber-800 border-amber-300` → `bg-warning-soft text-warning border-warning`；`text-amber-600` → `text-warning`
- `habit-card.tsx:157`：`text-gray-400` → `text-muted`
- `HabitTemplatePage.tsx:88,93`：同 HabitListPage 模式
- `kr-progress.tsx:34,38-39`：`bg-gray-400` / `bg-gray-300` → `bg-muted` / `bg-hairline`
- `okr-import-panel.tsx:68`：`bg-red-50 text-red-800 border-red-200` → `bg-error-soft text-error border-error`
- `okr-form.tsx:167,175`：`bg-red-600 text-white` → `bg-error text-on-primary`；`bg-gray-500 text-white` → `bg-muted text-on-primary`
- `TimeboxList.tsx:53`：`text-red-400 hover:text-red-600` → `text-error/70 hover:text-error`
- `HabitStatsWeekView.tsx:12,14-16,31-32`、`HabitStatsDayView.tsx:13-15,20-21`：`bg-gray-50 text-gray-200/300` → `bg-surface-card text-muted-soft`；`bg-amber-100 text-amber-600` → `bg-warning-soft text-warning`；`bg-red-50 text-red-400` → `bg-error-soft text-error`；`text-red-500` → `text-error`；`text-gray-400` → `text-muted`
- `HabitActionPanel.tsx:111,119`、`HabitCheckinPanel.tsx:115,118,133`、`HabitListCard.tsx:64`、`TaskActionPanel.tsx:107,110`：`text-gray-400` → `text-muted`；`bg-gray-400/500` → `bg-muted`

**验证**：替换完成后，全局搜索 `bg-red-`、`text-red-`、`bg-amber-`、`bg-gray-`、`text-gray-` 等确认零匹配。

#### T1.4 消除 alert() 调用

- 文件：`components/layout/conversation-view.tsx:88`
- 替换 `alert(validation.error)` 为 Toast（使用 sonner）
- 在 `app/layout.tsx` 添加 `<Toaster />`

#### T1.5 统一确认对话框按钮顺序

- 文件：`domains/habits/pages/HabitListPage.tsx:316`
- 调整 AlertDialogFooter 中按钮顺序：`AlertDialogCancel` 在前，`AlertDialogAction` 在后
- 同时检查 `page.tsx:899` 的过渡确认对话框

#### T1.6 加载状态替换为骨架屏

- `HabitListPage.tsx:258`：替换 `<p>加载中...</p>` 为 `<Skeleton />` 列表
- `ProjectsView.tsx:27`：同上
- 其他使用"加载中..."的位置，全局搜索确认

#### T1.7 TopNav 增加 Lifeware APP 图标

- 文件：`components/layout/top-nav.tsx`
- 图标资源：`public/Lifeware APP 图标.png`（已存在）
- 在 "Lifeware" 文字左侧增加 `<Image>` 图标
- 图标尺寸：28×28px（与 56px TopNav 高度协调）
- 圆角：rounded-lg（12px），与卡片圆角一致
- 实现示例：

```tsx
import Image from "next/image"

// TopNav Logo 区域
<div className="flex items-center gap-2">
  {onMenuClick && (
    <Button variant="ghost" size="icon-sm" onClick={onMenuClick}
      aria-label={isPanelOpen ? "收起 AI 面板" : "展开 AI 面板"}>
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
  <Link href="/" className="font-display text-xl font-medium text-ink hover:opacity-80 transition-opacity"
    aria-label="Lifeware 首页">
    Lifeware
  </Link>
</div>
```

- 注意：中文文件名在 Next.js `public/` 下可正常使用，但如遇部署问题可考虑重命名为 `lifeware-icon.png`

#### T1.8 主页通栏 Banner

- 文件：新建 `components/layout/home-banner.tsx`
- 插入位置：`app-shell.tsx` 的 `tilesBanner` 同级，在 TopNav 下方、主内容区上方
- 作用：主页第一屏的信息摘要与操作入口，替代当前"我的时间盒"纯标题
- **设计原则**：Phase 1 作为纯展示组件，通过 props 接收所有数据，不在 `page.tsx` 中新增 state。数据暂时从现有 `timeboxes` 计算而来，`habitStats` 使用占位数据。等 Phase 3 拆分完成后，再将数据获取逻辑迁入 `ScheduleView.tsx`

**设计稿**：

```
┌─────────────────────────────────────────────────────────────────┐
│  通栏 Banner（bg-surface-soft, border-b border-hairline）       │
│                                                                 │
│  ┌──────────────────────────────┐  ┌──────────────────────────┐ │
│  │ 左侧：今日概览               │  │ 右侧：快捷操作           │ │
│  │                              │  │                          │ │
│  │  📅 2026年5月31日 周日       │  │  [创建时间盒]  [打卡习惯]│ │
│  │  今日待办 5 · 已完成 2       │  │  [新建任务]    [开始复盘] │ │
│  │  习惯打卡 3/5 · 连续 6 天    │  │                          │ │
│  │                              │  │                          │ │
│  │  ── 进度条 ──────────────    │  │                          │ │
│  │  40% 完成                    │  │                          │ │
│  └──────────────────────────────┘  └──────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**布局规范**：
- 背景：`bg-surface-soft`
- 底部分隔：`border-b border-hairline`
- 内边距：`px-6 py-4`（桌面）/ `px-4 py-3`（移动）
- 内容最大宽度：`max-w-4xl mx-auto`（与主内容区对齐）
- 左右分栏：桌面端 `flex justify-between`，移动端纵向堆叠

**左侧：今日概览**：
- 日期行：`text-xs font-medium text-muted`（格式：2026年5月31日 周日）
- 统计行：`text-sm text-body`，数字用 `text-ink font-medium` 强调
  - 今日待办 N · 已完成 N
  - 习惯打卡 N/M · 连续 N 天
- 进度条：`h-2 rounded-full bg-hairline`，填充 `bg-primary`，宽度按完成百分比

**右侧：快捷操作**：
- 4 个快捷按钮，`variant="outline" size="sm"`（桌面）
- 移动端：缩减为 2 个主操作，且使用 `size="default"`（36px 高度），触控区域通过外层 padding 补足至 44px
- 按钮文字 + Lucide 图标（`Plus`, `Check`, `ListTodo`, `RotateCcw`）

**数据来源**：
- 日期：`new Date()` 本地格式化
- 待办/完成数：从现有 `timeboxes` props 统计
- 习惯打卡：Phase 1 使用静态占位数据，Phase 3 拆分后对接真实数据
- Props 接口：`{ timeboxes, onAction }`，不依赖额外 state

**集成方式**：

在 `page.tsx` 的 `renderMainContent()` 中，当 `mainViewState.type === 'schedule'` 时，在时间盒视图上方渲染 Banner：

```tsx
// page.tsx renderMainContent() 的 schedule 分支
if (mainViewState.type === 'schedule') {
  return (
    <div className="flex w-full flex-col gap-4">
      <HomeBanner
        timeboxes={timeboxes}
        onAction={handleGrowthAction}
      />
      <DateNav ... />
      {/* 日/周/月视图 */}
    </div>
  )
}
```

**Phase 1 完成标准**：
- [x] 全局无硬编码颜色类
- [x] 全局无 alert()/confirm()/prompt()
- [x] 全局无内联 SVG 图标
- [x] 确认对话框按钮顺序统一
- [x] 加载状态均为骨架屏
- [x] TopNav 显示 Lifeware APP 图标
- [x] 主页 schedule 视图顶部显示通栏 Banner

---

### Phase 2 — 体验提升（3-5 天）

> 目标：改善核心交互体验，提升视觉专业度。

#### T2.1 消息气泡视觉区分

- 文件：`components/layout/conversation-view.tsx`
- 新建 `components/chat-bubble.tsx`
- 用户消息：右对齐 + `bg-primary/10` 背景 + **左上/左下圆角缩小**（`rounded-tl-sm rounded-bl-sm rounded-tr-lg rounded-br-lg`），远离边缘一侧为小圆角，形成气泡来源感
- AI 消息：左对齐 + `bg-surface-soft` 背景 + **右上/右下圆角缩小**（`rounded-tr-sm rounded-br-sm rounded-tl-lg rounded-bl-lg`），与用户消息镜像对称
- 系统消息：居中 + `text-muted-soft` + 斜体 + 无气泡
- 每条消息显示角色标签 + 时间戳
- 角色标签样式：`text-xs font-medium text-muted-soft`，时间戳：`text-xs text-muted-soft`

#### T2.2 新建空状态组件

- 新建 `components/empty-state.tsx`
- 接口：`{ icon, title, description, action? }`
- 视觉：图标 48px muted-soft + 标题 subtitle ink + 描述 body muted + 可选 primary 按钮
- 应用到：习惯列表、任务列表、项目列表、对话初始页

#### T2.3 对话初始页引导增强

- 文件：`components/layout/conversation-view.tsx`
- 替换纯标题为结构化引导：
  - 问候语（font-display 标题）
  - 功能引导卡片（2-3 个常用场景卡片，带图标）
  - 常用意图按钮（保留现有 intentTriggers 逻辑）

#### T2.4 LeftPanel Tab 替换为 shadcn/ui Tabs

- 文件：`components/layout/left-panel.tsx`
- 替换手写 `<button>` Tab 为 `<Tabs>` / `<TabsList>` / `<TabsTrigger>` / `<TabsContent>`
- 保持现有功能（assistant / growth 两个 Tab）

#### T2.5 视图切换过渡动画

- 文件：`components/layout/main-content.tsx` 或 `app/page.tsx`
- 主内容区包裹过渡容器
- 切换 mainViewState 时触发 200ms ease-out 淡入 + translateY(4px→0)
- 在 `globals.css` 添加 `@keyframes viewIn`
- 添加 `prefers-reduced-motion: reduce` 媒体查询禁用

#### T2.6 GrowthMenu 快捷键标签展示

- 文件：`components/layout/growth-menu.tsx`
- 在每个 action 项右侧显示 shortcut 值（如有）
- 样式：`bg-surface-soft rounded-md px-2 py-0.5 text-caption text-muted`
- 移除 hover title 的 shortcut 显示

#### T2.7 自建 StatusBadge 组件

- 新建 `components/status-badge.tsx`
- 支持状态：active（success）/ suspended（warning）/ archived（muted）
- 使用 pill 圆角 + 语义色

#### T2.8 新建 Banner 反馈组件

- 新建 `components/feedback/banner.tsx`
- 用于系统级消息（LLM 未配置、数据库连接失败等）
- 规范要求：页面顶部、手动关闭、`bg-surface-soft` 背景 + 左侧语义色竖条
- 接口：`{ variant: 'info' | 'warning' | 'error', title: string, description?: string, onClose: () => void }`
- 替换 `page.tsx:776` 的 LLM 未配置硬编码 div 为 Banner 组件

#### T2.9 z-index 管理规范化

- 在 `globals.css` 或 Tailwind 配置中定义 z-index token，对齐 UI-DESIGN-SPEC §7.3：
  - `--z-base: 0`、`--z-sticky: 10`、`--z-dropdown: 20`、`--z-overlay: 30`、`--z-modal: 40`、`--z-toast: 50`、`--z-tooltip: 60`
- 审查所有组件的 z-index 使用，修正不符合规范的值：
  - `page.tsx` 的 `transitionConfirm` 模态框：`z-50` → `z-40`（modal 层）
  - shadcn/ui 组件（dialog、sheet、alert-dialog）的 z-index 需按规范调整
  - TopNav：确认为 `z-40`（modal 层，规范 §8.1 要求 `sticky top-0 z-40`）

#### T2.10 键盘交互实施

- `/` 键：聚焦意图输入框（全局快捷键，需排除在输入框内时）
- `Ctrl/Cmd + Enter`：提交当前表单（已有部分实现，需确认覆盖所有表单场景）
- `Escape`：关闭模态/对话框/Sheet（shadcn/ui 已内置，需确认一致）
- 实现方式：在 `app-shell.tsx` 或 `page.tsx` 添加全局 `useEffect` 监听 `keydown`

**Phase 2 完成标准**：
- [x] 用户/AI/系统消息视觉区分明确
- [x] 所有列表页有空状态组件
- [x] LeftPanel 使用 shadcn/ui Tabs
- [x] 视图切换有过渡动画
- [x] 快捷键在 UI 中可见
- [x] Banner 反馈组件可用，LLM 未配置提示已替换
- [x] z-index 层级符合规范，无越级使用
- [x] `/` 和 `Ctrl+Enter` 快捷键可用

---

### Phase 3 — 架构重构（5-10 天）

> 目标：解决结构性问题，补齐移动端和暗色模式。

#### T3.1 拆分 page.tsx

当前 `page.tsx` 的职责需要拆分。拆分原则：**按领域内聚拆分 state，每个 hook 自管自己的 state**，不建立集中式 `use-app-state`。跨 hook 共享的状态通过轻量 React Context 传递。

**状态共享策略**：

引入 `contexts/AppContext.tsx`，存放全局共享状态（`mainViewState`、`activeSessionId` 等），各 hook 通过 Context 读写，避免交叉回调。

| 提取为 | 职责 | 自管 state |
|--------|------|------------|
| `hooks/use-intent-handler.ts` | 意图提交、确认、表单处理 | `confirmation`、`intentForm`、`traceEnabled` 等 |
| `hooks/use-conversation.ts` | 对话消息管理、session CRUD | `sessions`、`messages`、`activeSessionId` |
| `hooks/use-timebox.ts` | 时间盒数据加载、日期导航 | `timeboxes`、`selectedDate`、`viewMode` |
| `hooks/use-navigation.ts` | mainViewState 管理、视图切换 | `mainViewState`（放入 Context） |
| `views/ScheduleView.tsx` | 时间盒日/周/月视图渲染 | — |
| `views/ConversationViewWrapper.tsx` | 对话视图 + split 逻辑 | — |
| `views/ActionView.tsx` | Domain 页面路由渲染 | — |
| `views/SettingsView.tsx` | 设置页面 | — |

拆分后 `page.tsx` 应缩减至 100 行以内，仅作为组装层，组合各 hook 和视图组件。

#### T3.2 暗色模式实施

- 在 `globals.css` 的 `.dark { ... }` 块中重定义所有色板（参照 UI-DESIGN-SPEC §1.1–§1.5）
- 在 `globals.css` 的 `.dark { ... }` 块中重定义语义色 Soft 变体的暗色值（`--success-soft: #1a2e1e` 等，参照 §1.4）
- 在 `globals.css` 的 `.dark { ... }` 块中重定义交互叠加色（Hover Overlay、Pressed Overlay、Focus Ring、Scrim，参照 §1.5，暗色模式下 rgba alpha 值可能需要调整）
- 新建 `hooks/use-theme.ts`：检测 `prefers-color-scheme` + localStorage 持久化，核心职责是操作 `document.documentElement.classList` 切换 `dark` 类
- **FOUC 防护**：使用 `next-themes` 库或内联 `<script>` 在 `<head>` 中注入 class，避免 JS 未加载时的闪烁
- 在 TopNav 设置区域添加主题切换按钮（Light / Dark / System）
- **对比度验证**：使用浏览器 DevTools 或 axe-core 验证所有组件暗色模式下文字对比度 ≥ 4.5:1
- 逐一审查所有组件在暗色模式下的表现

**注意**：Phase 1 T1.3 已在 `:root` 中补齐了语义色和 Soft 变体的亮色值。此处只需添加 `.dark` 块的重定义。

#### T3.3 移动端与平板导航适配

**移动端（< 640px）**：

- 新建 `components/layout/bottom-nav.tsx`
- 3 个 Tab：**首页**、**对话**、**设置** — 均为导航目的地，点击切换页面视图
- 仅在 `< sm` 断点显示（`sm:hidden`）
- 修改 `app-shell.tsx`，移动端使用 BottomNav + MainContent 布局
- 成长领域菜单通过 **FAB（浮动操作按钮）** 展开：右下角 `+` 按钮，点击展开快捷创建菜单（创建时间盒、打卡习惯、新建任务、开始复盘），同时包含"成长领域"入口，点击后以底部 Sheet 弹出
- FAB 使用 `bg-primary text-on-primary`，圆角 `rounded-pill`，尺寸 56×56px（满足触控目标 ≥ 44px）

**平板端（640–1023px，即 `sm` 到 `lg-1` 断点）**：

- LeftPanel 默认隐藏，通过 TopNav 上的面板按钮点击展开
- 展开时使用 **overlay 模式**（浮层覆盖在内容区上方，带 Scrim 遮罩），不推挤主内容区
- 左面板宽度保持 300px，关闭按钮在面板右上角
- 此断点下不显示 BottomNav 和 FAB

**桌面端（≥ 1024px）**：

- 保持现有标准三栏布局不变

#### T3.4 全局搜索（可选）

- 安装 `npx shadcn@latest add command`
- Ctrl+K 唤起搜索面板
- 搜索范围：Domain Actions、习惯、任务、对话
- 使用 Cmdk 底层

#### T3.5 补齐交互叠加色变量

- 在 `globals.css` 的 `:root` 中定义交互叠加色（参照 UI-DESIGN-SPEC §1.5）：
  ```css
  --hover-overlay: rgba(20,20,19,0.04);
  --pressed-overlay: rgba(20,20,19,0.08);
  --focus-ring: rgba(204,120,92,0.3);
  --scrim: rgba(20,20,19,0.5);
  ```
- 在 `.dark` 块中定义暗色模式值（可能需要调整 alpha）
- 在按钮、卡片等组件的 hover/pressed/focus 状态中使用这些变量
- shadcn/ui 组件的 focus ring 样式需对齐 `--focus-ring`

**Phase 3 完成标准**：
- [x] page.tsx ≤ 100 行，仅作为组装层
- [x] 各 hook 按领域内聚拆分，无集中式 state 管理
- [x] AppContext 提供跨 hook 状态共享
- [x] 暗色模式完整可用，对比度 ≥ 4.5:1
- [x] 移动端有底部导航（3 Tab）和 FAB
- [x] 平板端 LeftPanel 可折叠（overlay 模式）
- [x] 交互叠加色变量定义并应用于组件状态
- [x] 所有组件在 375px / 768px / 1440px / 暗色模式下验证通过

---

## 四、风险与注意事项

1. **Phase 3 的 T3.1（拆分 page.tsx）是最高风险项** — 涉及 18+ 个 state 的大规模重构，按领域内聚拆分而非集中管理，需要充分的手动测试覆盖
2. **暗色模式需要全组件审查** — 不能只改 CSS 变量，每个页面都需要实际目视验证，包括对比度检测
3. **移动端 BottomNav / FAB 与 LeftPanel 的状态同步** — BottomNav、FAB、LeftPanel 三个导航入口必须共享同一份 mainViewState（通过 AppContext）
4. **DESIGN.md 保留不动** — 它是品牌上游参考，UI-DESIGN-SPEC.md 是应用层下游规范，二者不冲突
5. **Phase 1 的 HomeBanner 不引入新 state** — 保持为纯展示组件，避免增加 page.tsx 复杂度，拆分后再迁入数据获取逻辑
6. **Phase 1 T1.3 必须先补齐 CSS 变量** — Info 色和 Soft 变体在亮色模式也未定义，需先在 `:root` 补齐再替换硬编码颜色
7. **交互叠加色（Hover/Pressed/Focus Ring/Scrim）** — 当前 `globals.css` 完全未定义，需在暗色模式实施时一并添加

---

## 五、与设计规范的关系

```
DESIGN.md（品牌令牌定义）
    ↓
globals.css（CSS 变量实现 + shadcn 兼容层）
    ↓
UI-DESIGN-SPEC.md（界面设计规范 — "应该是什么样"）
    ↓
UI-REDESIGN.md（本文件 — "怎么改过去"）
    ↓
代码实现（各 Phase 的具体 PR）
```

每个 Phase 完成后，对照 `UI-DESIGN-SPEC.md` 第十四章的检查清单逐项验收。
