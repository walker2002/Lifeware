# Lifeware 界面优化实施规划

> 版本：v1.0 | 更新日期：2026-05-31
> 状态：待执行
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
| V1 | 硬编码错误色 | `HabitListPage.tsx:270` | `bg-red-50 border-red-300 text-red-800` | `bg-error-soft border-error text-error` |
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
| I5 | 反馈系统不统一 | 多处 | 统一使用 Toast（操作反馈）、Inline（验证）、Dialog（确认）、Banner（系统级） |

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

#### T1.2 TopNav 替换内联 SVG 为 Lucide 图标

- 文件：`components/layout/top-nav.tsx`
- 替换通知图标内联 SVG → `<Bell />`
- 替换设置图标内联 SVG → `<Settings />`
- 检查：所有图标来自 `lucide-react`

#### T1.3 替换硬编码颜色为语义令牌

- `HabitListPage.tsx:270`：`bg-red-50 border-red-300 text-red-800` → `bg-error-soft border-error text-error`
- `conversation-view.tsx:776-780`：`border-amber-200 bg-amber-50 text-amber-800` → `bg-warning-soft border-warning text-warning`
- 全局搜索 `bg-red-`、`text-red-`、`bg-amber-`、`bg-gray-`、`text-gray-` 等非令牌颜色，逐个替换

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
- 日期行：`text-caption text-muted`（格式：2026年5月31日 周日）
- 统计行：`text-body text-body`，数字用 `text-ink font-medium` 强调
  - 今日待办 N · 已完成 N
  - 习惯打卡 N/M · 连续 N 天
- 进度条：`h-1.5 rounded-full bg-hairline`，填充 `bg-primary`，宽度按完成百分比

**右侧：快捷操作**：
- 4 个快捷按钮，`variant="outline" size="sm"`
- 按钮文字 + Lucide 图标（`Plus`, `Check`, `ListTodo`, `RotateCcw`）
- 移动端缩小为 2 个主操作

**数据来源**：
- 日期：`new Date()` 本地格式化
- 待办/完成数：从现有 `timeboxes` state 统计
- 习惯打卡：需新增 `getHabitStats()` server action 或复用 CNUI handler
- 初期可使用静态占位数据，后续对接真实 API

**集成方式**：

在 `page.tsx` 的 `renderMainContent()` 中，当 `mainViewState.type === 'schedule'` 时，在时间盒视图上方渲染 Banner：

```tsx
// page.tsx renderMainContent() 的 schedule 分支
if (mainViewState.type === 'schedule') {
  return (
    <div className="flex w-full flex-col gap-4">
      <HomeBanner
        timeboxes={timeboxes}
        habitStats={habitStats}    // 新增 state
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
- 用户消息：右对齐 + `bg-primary/10` 背景 + 右侧圆角缩小
- AI 消息：左对齐 + `bg-surface-soft` 背景 + 左侧圆角缩小
- 系统消息：居中 + `text-muted-soft` + 斜体 + 无气泡
- 每条消息显示角色标签 + 时间戳

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

**Phase 2 完成标准**：
- [x] 用户/AI/系统消息视觉区分明确
- [x] 所有列表页有空状态组件
- [x] LeftPanel 使用 shadcn/ui Tabs
- [x] 视图切换有过渡动画
- [x] 快捷键在 UI 中可见

---

### Phase 3 — 架构重构（5-10 天）

> 目标：解决结构性问题，补齐移动端和暗色模式。

#### T3.1 拆分 page.tsx

当前 `page.tsx` 的职责需要拆分：

| 提取为 | 职责 |
|--------|------|
| `hooks/use-app-state.ts` | 所有 state 声明和状态管理逻辑 |
| `hooks/use-intent-handler.ts` | 意图提交、确认、表单处理 |
| `hooks/use-conversation.ts` | 对话消息管理、session CRUD |
| `hooks/use-timebox.ts` | 时间盒数据加载、日期导航 |
| `hooks/use-navigation.ts` | mainViewState 管理、视图切换 |
| `views/ScheduleView.tsx` | 时间盒日/周/月视图渲染 |
| `views/ConversationViewWrapper.tsx` | 对话视图 + split 逻辑 |
| `views/ActionView.tsx` | Domain 页面路由渲染 |
| `views/SettingsView.tsx` | 设置页面 |

拆分后 `page.tsx` 应缩减至 100 行以内，仅作为组装层。

#### T3.2 暗色模式实施

- 在 `globals.css` 添加 `.dark { ... }` 完整色板（参照 UI-DESIGN-SPEC 1.6 节）
- 在 `globals.css` 添加语义色 Soft 变量（`--success-soft` 等）
- 新建 `hooks/use-theme.ts`：检测 `prefers-color-scheme` + localStorage 持久化
- 在 TopNav 设置区域添加主题切换按钮（Light / Dark / System）
- 逐一审查所有组件在暗色模式下的表现

#### T3.3 移动端底部导航

- 新建 `components/layout/bottom-nav.tsx`
- 4 个 Tab：首页、对话、领域（Sheet）、设置
- 仅在 `< md` 断点显示（`md:hidden`）
- 修改 `app-shell.tsx`，移动端使用 BottomNav + MainContent 布局
- 成长领域菜单改为底部 Sheet 弹出
- 浮动操作按钮（FAB）：右下角 `+`，展开快捷创建菜单

#### T3.4 全局搜索（可选）

- 安装 `npx shadcn@latest add command`
- Ctrl+K 唤起搜索面板
- 搜索范围：Domain Actions、习惯、任务、对话
- 使用 Cmdk 底层

**Phase 3 完成标准**：
- [x] page.tsx ≤ 100 行
- [x] 暗色模式完整可用
- [x] 移动端有底部导航和 Sheet
- [x] 所有组件在 375px / 1440px / 暗色模式下验证通过

---

## 四、风险与注意事项

1. **Phase 3 的 T3.1（拆分 page.tsx）是最高风险项** — 涉及 40+ 个 state 的大规模重构，需要充分的手动测试覆盖
2. **暗色模式需要全组件审查** — 不能只改 CSS 变量，每个页面都需要实际目视验证
3. **移动端 BottomNav 与 LeftPanel 的状态同步** — 两个导航入口必须共享同一份 mainViewState
4. **DESIGN.md 保留不动** — 它是品牌上游参考，UI-DESIGN-SPEC.md 是应用层下游规范，二者不冲突

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
