# Lifeware 界面设计规范

> 版本：v1.2 | 更新日期：2026-06-07
> 状态：**生效中** — 所有 UI 相关开发必须遵守本规范
> 上游：DESIGN.md（品牌设计令牌来源）
> 下游：globals.css（CSS 变量实现）

---

## 适用范围

本规范适用于 Lifeware Web 端所有界面开发，包括：
- 页面布局与路由视图
- 基础组件（按钮、输入框、卡片等）
- 领域组件（习惯、任务、时间盒、OKR 等）
- CN-UI 对话界面
- 导航结构
- 交互反馈

**所有涉及 UI 变更的代码提交，必须在 PR 描述中说明是否符合本规范。**

---

## 一、色彩体系

### 1.1 品牌基础色

来源：DESIGN.md。以下令牌定义在 `globals.css :root` 中，通过 Tailwind 工具类使用。

| 令牌 | CSS 变量 | 色值 | Tailwind 类 | 用途 |
|------|----------|------|-------------|------|
| Canvas | `--canvas` | `#faf9f5` | `bg-canvas` | 页面底色 |
| Ink | `--ink` | `#141413` | `text-ink` | 标题、主文字 |
| Primary | `--primary` | `#cc785c` | `bg-primary` / `text-primary` | 主操作、品牌强调 |
| Primary Active | `--primary-active` | `#a9583e` | `bg-primary-active` | 按下状态 |
| Primary Disabled | `--primary-disabled` | `#e6dfd8` | `bg-primary-disabled` | 禁用状态 |
| Body | `--body` | `#3d3d3a` | `text-body` | 正文文字 |
| Body Strong | `--body-strong` | `#252523` | `text-body-strong` | 强调段落 |
| Muted | `--muted` | `#6c6a64` | `text-muted` | 辅助文字 |
| Muted Soft | `--muted-soft` | `#8e8b82` | `text-muted-soft` | 极淡辅助文字 |

> **⚠️ 可访问性警告**：`--primary`（#cc785c，亮度 58%）作为背景时，`--on-primary`（#ffffff）的对比度仅为 **3.3:1**，不满足 WCAG AA 对正常文本的要求（4.5:1）。
>
> **规则**：
> - **小文本（<18px）放在 primary 背景上**：必须使用 `--primary-active`（#a9583e，对比度 5.1:1）作为背景，搭配 `--on-primary` 文字
> - **大文本（≥18px bold 或 ≥24px）放在 primary 背景上**：可直接使用 `--primary` + `--on-primary`（对比度 3.3:1 满足大文本 AA 3:1 最低要求）
> - **primary 作为文字色**：`text-primary` 在 `bg-canvas` 上对比度 3.3:1，仅限装饰性或大文本使用

### 1.2 表面色

| 令牌 | 色值 | Tailwind 类 | 用途 |
|------|------|-------------|------|
| Surface Soft | `#f5f0e8` | `bg-surface-soft` | 分区间隔条带、hover 背景 |
| Surface Card | `#efe9de` | `bg-surface-card` | 内容卡片背景 |
| Surface Cream Strong | `#e8e0d2` | `bg-surface-cream-strong` | 选中态标签背景 |
| Surface Dark | `#181715` | `bg-surface-dark` | 暗色区域（代码块、终端） |
| Surface Dark Elevated | `#252320` | `bg-surface-dark-elevated` | 暗色区域内浮层 |

### 1.3 边框色

| 令牌 | 色值 | Tailwind 类 | 用途 |
|------|------|-------------|------|
| Hairline | `#e6dfd8` | `border-hairline` | 标准边框、分隔线 |
| Hairline Soft | `#ebe6df` | `border-hairline-soft` | 极淡分隔线 |

### 1.4 语义色

| 语义 | 亮色值 | 暗色值 | Tailwind 类 | 用途 |
|------|--------|--------|-------------|------|
| Success | `#5db872` | `#6bcf82` | `text-success` | 成功状态、在线指示 |
| Success Soft | `#e8f5ec` | `#1a2e1e` | `bg-success-soft` | 成功背景 |
| Warning | `#d4a017` | `#e8b84a` | `text-warning` | 警告状态 |
| Warning Soft | `#fdf6e3` | `#2e2818` | `bg-warning-soft` | 警告背景 |
| Error | `#c64545` | `#e05555` | `text-error` | 错误状态、破坏性操作 |
| Error Soft | `#fde8e8` | `#2e1818` | `bg-error-soft` | 错误背景 |
| Info | `#5b8fb9` | `#7ba8cc` | `text-info` | 信息提示 |
| Info Soft | `#e8f0f8` | `#182838` | `bg-info-soft` | 信息背景 |

### 1.5 交互叠加色

| 令牌 | 亮色值 | 暗色值 | 用途 |
|------|--------|--------|------|
| Hover Overlay | `rgba(20,20,19,0.04)` | `rgba(250,249,245,0.06)` | hover 态叠加 |
| Pressed Overlay | `rgba(20,20,19,0.08)` | `rgba(250,249,245,0.10)` | 按下态叠加 |
| Focus Ring | `rgba(204,120,92,0.3)` | `rgba(212,136,106,0.5)` | 聚焦外发光 |
| Scrim | `rgba(20,20,19,0.5)` | `rgba(0,0,0,0.7)` | 通用模态遮罩 |
| Scrim CN-UI | `rgba(20,20,19,0.3)` | `rgba(0,0,0,0.4)` | CN-UI 对话内确认对话框遮罩，较通用 scrim 更透明以保留对话上下文 |

### 1.6 暗色模式

暗色模式通过 `.dark` 类切换（挂在 `<html>` 上），所有令牌在 `.dark` 块中重新定义。暗色模式的核心变化：

- Canvas 与 Ink 反转：底色变暗、文字变亮
- Primary 色调微提亮以保持暗底可读性
- 表面色整体变暗但仍保持层级差异
- 语义色 Soft 变体从浅底变为深底

**颜色使用铁律**：

> **禁止在组件中直接使用 Tailwind 默认颜色类**（如 `bg-red-50`、`text-gray-600`）。
> 必须使用本规范定义的语义令牌。唯一例外是临时调试。

**颜色对比度铁律**（WCAG 2.1 AA）：

> | 文本类型 | 最低对比度 | 适用场景 |
> |----------|-----------|----------|
> | 正常文本（<18px） | **4.5:1** | 正文、标签、按钮文字、表单输入 |
> | 大文本（≥18px bold 或 ≥24px） | **3:1** | 页面标题、Hero 文字 |
> | 图标、边框 | **3:1** | 操作图标、分隔线 |
>
> **所有新增/修改的颜色组合必须在亮色和暗色模式下均满足上述最低对比度。**
> 已知例外：`--primary` + `--on-primary` 仅为 3.3:1，参见 §1.1 中的替代方案。

---

## 二、排版体系

### 2.1 字体家族

| 用途 | 字体 | CSS 变量 | Tailwind 类 |
|------|------|----------|-------------|
| 标题/品牌展示 | Cormorant Garamond, serif | `--font-display` | `font-display` |
| 正文/界面 | Inter, sans-serif | `--font-body` | `font-body` |
| 代码 | JetBrains Mono, monospace | `--font-code` | `font-code` |

### 2.2 字号层级

| 层级 | 字号 | 字重 | 行高 | 用途 |
|------|------|------|------|------|
| Display | 32px (2rem) | 500 | 1.2 | 页面主标题（H1） |
| Title | 24px (1.5rem) | 600 | 1.25 | 区块标题（H2） |
| Subtitle | 18px (1.125rem) | 500 | 1.3 | 子标题（H3）、卡片标题 |
| Body | 14px (0.875rem) | 400 | 1.5 | 正文、描述 |
| Caption | 12px (0.75rem) | 500 | 1.4 | 标注、辅助文字 |
| Micro | 10px (0.625rem) | 500 | 1.3 | 徽章、角标 |

**原则**：
- Web 应用基础字号为 **14px**（信息密度更高的工具类应用标准）
- H1 级标题使用 `font-display`（Cormorant Garamond 衬线体），保留品牌辨识度
- H2 及以下全部使用 `font-body`（Inter 无衬线），确保功能界面可读性
- 标题**不做 bold（700）**，最高到 semibold（600）

### 2.3 字重使用

| 字重 | 值 | 使用场景 |
|------|----|----------|
| Regular | 400 | 正文、描述 |
| Medium | 500 | 标签、导航项、按钮、小标题 |
| Semibold | 600 | 区块标题 |

---

## 三、间距体系

基础单位：**4px**。所有间距必须是 4px 的整数倍。

| 令牌名 | 值 | Tailwind 对应 | 用途 |
|--------|----|---------------|------|
| space-1 | 4px | `p-1` / `gap-1` | 图标与文字间距、紧凑内边距 |
| space-2 | 8px | `p-2` / `gap-2` | 同组元素间距 |
| space-3 | 12px | `p-3` / `gap-3` | 卡片内元素间距 |
| space-4 | 16px | `p-4` / `gap-4` | 组件内基础间距、列表项间距 |
| space-5 | 20px | `p-5` / `gap-5` | 卡片内边距（紧凑型） |
| space-6 | 24px | `p-6` / `gap-6` | 区块间距、表单字段间距 |
| space-8 | 32px | `p-8` / `gap-8` | 卡片内边距（标准） |
| space-10 | 40px | `p-10` / `gap-10` | 页面级内边距 |
| space-12 | 48px | `p-12` / `gap-12` | 大区块间距 |
| space-16 | 64px | `p-16` / `gap-16` | 页面顶部/底部留白 |

---

## 四、圆角体系

| 令牌 | 值 | Tailwind 对应 | 使用场景 |
|------|----|---------------|----------|
| xs | 4px | `rounded-xs` | 小型徽标、下拉项 |
| sm | 6px | `rounded-sm` | 内联按钮、输入框内部元素 |
| md | 8px | `rounded-md` | 按钮、输入框、标签 |
| lg | 12px | `rounded-lg` | 卡片、对话框、弹出层 |
| xl | 16px | `rounded-xl` | 大型容器、模态框 |
| pill | 9999px | `rounded-pill` | 徽章、标签、头像 |

---

## 五、阴影与层级

**核心原则**：色块优先，阴影稀有。大多数层级通过表面色差异（canvas → surface-card → surface-dark）表达。

| 层级 | 阴影值 | 使用场景 |
|------|--------|----------|
| 无阴影 | — | 页面底色区域、内嵌卡片 |
| 微弱 | `0 1px 2px rgba(20,20,19,0.06)` | 悬浮卡片、下拉菜单 |
| 标准 | `0 4px 12px rgba(20,20,19,0.1)` | 对话框、弹出层 |
| 强 | `0 8px 24px rgba(20,20,19,0.14)` | 全屏模态 |

---

## 六、基础组件规范

### 6.1 按钮（Button）

基于 shadcn/ui Button 组件。

**变体**：

| 变体 | 样式 | 使用场景 |
|------|------|----------|
| Primary | 珊瑚色背景 `bg-primary`，白色文字 | 主操作：创建、提交、确认 |
| Secondary | `bg-surface-card`，ink 文字 | 次要操作：取消、返回 |
| Outline | hairline 边框，透明背景 | 辅助操作：筛选、展开 |
| Ghost | 无边框无背景 | 图标按钮、导航项 |
| Destructive | `bg-error` 背景白色文字 | 危险操作：删除 |

**尺寸**：

| 尺寸 | 高度 | 内边距 | 字号 | 用途 |
|------|------|--------|------|------|
| sm | 32px | 8px 12px | 12px | 内联操作、表格行内 |
| default | 36px | 12px 16px | 14px | 通用 |
| lg | 44px | 16px 24px | 14px | 主要 CTA |
| icon | 36×36px | — | — | 纯图标按钮 |

**交互状态**：
- Hover：背景色加深一层（Primary → Primary Active）
- Pressed：叠加 Pressed Overlay
- Disabled：使用 Primary Disabled 色文字，opacity 不低于 0.5
- Focus：3px Focus Ring 外发光

### 6.2 输入框（Input）

- 高度：36px（default）/ 44px（lg，移动端推荐）
- 边框：1px solid `--hairline`
- 圆角：8px（rounded-md）
- 内边距：10px 14px
- 聚焦：边框变 `--primary` + 3px Focus Ring
- 占位符：`--muted-soft` 色
- 禁用：背景 `--surface-soft`，文字 `--muted`

### 6.3 卡片（Card）

| 类型 | 背景 | 圆角 | 内边距 | 用途 |
|------|------|------|--------|------|
| 默认 | `surface-card` | 12px | 20px | 内容卡片、功能区块 |
| 交互 | `canvas` + hover 阴影 | 12px | 20px | 可点击卡片 |
| 暗色 | `surface-dark` | 12px | 24px | 代码块、终端输出 |

### 6.4 消息气泡（ChatBubble）

| 角色 | 对齐 | 背景 | 文字色 | 附加 |
|------|------|------|--------|------|
| User（用户） | 右对齐 | `primary` 的 10% 透明度 | `ink` | 圆角左上/左下偏小 |
| Assistant（AI） | 左对齐 | `surface-soft` | `body` | 可包含 CN-UI Surface |
| System（系统） | 居中 | 无 | `muted-soft` | 斜体，无气泡边框 |

每条消息显示角色标签（"你"/"AI"/"系统"）+ 时间戳。

### 6.5 标签与徽标

| 类型 | 背景 | 文字 | 圆角 | 内边距 |
|------|------|------|------|--------|
| Pill Badge | `surface-card` | `ink` | pill | 4px 12px |
| Status Badge | 语义色 Soft | 语义色 | pill | 4px 10px |
| Shortcut Tag | `surface-soft` | `muted` | md | 2px 8px |

### 6.6 空状态（EmptyState）

每个列表/集合视图必须定义空状态。

结构：
```
图标 (48px, muted-soft)
标题 (subtitle 字号, ink)
描述 (body 字号, muted)
[操作按钮] (primary, 可选)
```

### 6.7 加载状态

| 场景 | 方案 | 实现 |
|------|------|------|
| 首次加载页面 | 骨架屏 | `animate-pulse` + `bg-surface-card` 占位块 |
| 操作进行中 | 按钮 Spinner | 按钮 `disabled` + 内联 Spinner |
| 页面切换 | 顶部进度条 | 2px 高度，`bg-primary`，从左到右 |
| 流式文本响应 | 打字效果 | 逐字显示 + 光标闪烁 |

**禁止**使用纯文本"加载中..."作为加载状态。必须使用骨架屏或 Spinner。

---

## 七、布局系统

### 7.1 应用外壳（AppShell）

```
┌─────────────────────── TopNav (56px) ───────────────────────┐
├──────────────┬──────────────────────────────────────────────┤
│  LeftPanel   │  MainContent                                 │
│  (300px)     │  ┌─ max-w-4xl mx-auto px-6 ──────────────┐  │
│  可拖拽调整   │  │  页面内容（最大宽度 896px 居中）         │  │
│  最小 260px   │  └────────────────────────────────────────┘  │
│  最大 400px   │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

TopNav 高度：**56px**。LeftPanel 默认宽度：**300px**。

内容区限制最大宽度 `max-w-4xl`（896px）并居中，避免宽屏下阅读线过长。

### 7.2 内边距规范

| 位置 | 桌面 | 移动 |
|------|------|------|
| 页面两侧 | `px-6` (24px) | `px-4` (16px) |
| 页面顶部标题区 | `pt-6 pb-4` | `pt-4 pb-3` |
| 卡片组之间 | `gap-6` | `gap-4` |
| 列表项之间 | `gap-2` | `gap-2` |
| 表单字段之间 | `gap-4` | `gap-4` |

### 7.3 z-index 管理

| 层级 | 值 | 用途 |
|------|----|------|
| base | 0 | 默认内容 |
| sticky | 10 | 粘性头部、标签栏 |
| dropdown | 20 | 下拉菜单、弹出选择器 |
| overlay | 30 | Sheet 遮罩 |
| modal | 40 | 对话框、TopNav |
| toast | 50 | 通知提示 |
| tooltip | 60 | 工具提示 |

---

## 八、导航系统

### 8.1 顶部导航（TopNav）

- 高度：56px
- 左侧：Logo（`font-display`）+ 面板折叠按钮
- 右侧：功能图标（通知、设置）— **必须使用 Lucide 图标组件**，禁止内联 SVG
- 背景：`bg-canvas` + `border-b border-hairline`
- 定位：`sticky top-0 z-40`

### 8.2 左侧面板（LeftPanel）

- 宽度：默认 300px，可拖拽，最小 260px，最大 400px
- Tab 切换：使用 shadcn/ui `Tabs` 组件
- 分区结构：
  - Header（48px）：Home 按钮 + 当前上下文
  - Tab Bar（40px）
  - Content（flex-1，overflow-y-auto）
  - Footer（可选）：LLM 连接状态

### 8.3 移动端导航

- 底部导航栏（BottomNav）：最多 5 项，图标 + 文字标签
- 成长领域菜单通过 Sheet（底部弹出）呈现
- 浮动操作按钮（FAB）：右下角，展开快捷创建操作

---

## 九、交互规范

### 9.1 过渡动画

| 场景 | 时长 | 缓动 | 效果 |
|------|------|------|------|
| 视图切换 | 200ms | ease-out | opacity 0→1 + translateY(4px→0) |
| 列表展开/收起 | 150ms | ease-out | height auto 过渡 |
| 模态弹出 | 200ms | ease-out | scale(0.98→1) + opacity |
| Hover 反馈 | 150ms | ease-out | 背景色变化 |
| Toast 出现 | 200ms | ease-out | 从底部滑入 |

**所有动画必须尊重 `prefers-reduced-motion: reduce`**，在该模式下禁用非必要动画。

### 9.2 反馈系统

| 类型 | 组件 | 持续时间 | 使用场景 |
|------|------|----------|----------|
| Toast | 底部居中弹出 | 3-5s 自动消失 | 操作成功/失败 |
| Inline | 表单字段下方 | 持续显示 | 输入验证错误 |
| Dialog | 居中模态 | 手动关闭 | 确认删除、重要操作 |
| Banner | 页面顶部 | 手动关闭 | 系统级错误、配置缺失 |

**禁止**使用浏览器原生 `alert()`、`confirm()`、`prompt()`。

### 9.3 确认对话框

破坏性操作的确认对话框，按钮顺序统一：

```
[取消]（左，secondary/outline）  [确认]（右，destructive）
```

### 9.4 键盘交互

| 快捷键 | 功能 |
|--------|------|
| `Escape` | 关闭模态/对话框/Sheet |
| `Ctrl/Cmd + Enter` | 提交表单 |
| `/` | 聚焦意图输入框 |

---

## 十、响应式断点

| 名称 | 宽度 | 布局 |
|------|------|------|
| mobile | < 640px | 单列 + BottomNav + Sheet |
| tablet | 640–1023px | LeftPanel 可折叠 |
| desktop | 1024–1439px | 标准三栏 |
| wide | ≥ 1440px | 内容最大宽度 896px 居中 |

**移动优先**：所有样式从最小屏幕写起，通过 `md:` / `lg:` 向上适配。

---

## 十一、图标规范

- **图标库**：统一使用 `lucide-react`，禁止使用内联 SVG 或 Emoji
- **默认尺寸**：`size-4`（16px）用于行内图标，`size-5`（20px）用于独立按钮
- **颜色**：跟随文字色（`text-body`）或使用语义色，禁止硬编码
- **一致性**：同一层级图标保持相同尺寸和 stroke width

---

## 十二、暗色模式

暗色模式通过 `<html class="dark">` 切换，所有 CSS 变量在 `.dark` 块中重定义。

实施要求：
1. 所有颜色必须使用 CSS 变量令牌，禁止硬编码 hex
2. 新增组件必须同时在亮色和暗色模式下验证
3. 暗色模式下文字对比度不低于 4.5:1

---

## 十三、代码风格

### Tailwind 类名顺序

```
布局 → 尺寸 → 间距 → 排版 → 颜色 → 边框 → 交互 → 响应式
```

### 颜色使用规则

```tsx
// ✅ 使用语义令牌
<div className="bg-canvas text-ink border-hairline" />
<div className="bg-error-soft text-error" />

// ❌ 禁止硬编码
<div className="bg-red-50 text-red-800" />
<div className="bg-gray-100" />
```

### 响应式写法

```tsx
// ✅ 移动优先
<div className="px-4 md:px-6" />

// ❌ 桌面优先
<div className="px-6 max-md:px-4" />
```

---

## 十四、AI Agent 检查清单

> 以下检查点用于代码审查和 PR 验收。每项必须通过。

### C-01 色彩合规
- [ ] 所有颜色使用 CSS 变量令牌（`text-ink`、`bg-canvas` 等）
- [ ] 无硬编码颜色类（`bg-red-50`、`text-gray-600` 等）
- [ ] 语义色使用正确（error/warning/success/info 各归其位）
- [ ] 所有颜色组合在亮色模式下满足 WCAG AA 对比度（≥4.5:1 正常文本 / ≥3:1 大文本+图标）
- [ ] `bg-primary` + `text-on-primary` 组合仅在大文本/图标场景使用（正常文本用 `bg-primary-active`）

### C-02 组件规范
- [ ] 按钮使用正确变体和尺寸
- [ ] 图标使用 `lucide-react`，无内联 SVG / Emoji
- [ ] 加载状态使用骨架屏或 Spinner，非纯文本
- [ ] 空状态包含图标 + 标题 + 描述 + 操作按钮

### C-03 间距与排版
- [ ] 间距为 4px 整数倍
- [ ] 字号使用规范定义的层级
- [ ] 标题使用 `font-display`（H1）或 `font-body`（H2+）

### C-04 交互
- [ ] 无浏览器原生弹窗（alert/confirm/prompt）
- [ ] 破坏性操作有确认对话框，按钮顺序：取消（左）+ 确认（右）
- [ ] 异步操作期间按钮 disabled + loading 态
- [ ] 动画尊重 `prefers-reduced-motion`

### C-05 响应式
- [ ] 移动端布局可用（非仅隐藏左面板）
- [ ] 触控目标 ≥ 44px（移动端）
- [ ] 样式使用移动优先写法

### C-06 双模式
- [ ] 新增组件在亮色和暗色模式下均可读
- [ ] 亮色模式下文字对比度 ≥ 4.5:1（正常文本）/ 3:1（大文本+图标）
- [ ] 暗色模式下文字对比度 ≥ 4.5:1

### C-07 可访问性
- [ ] 交互元素有 `aria-label`
- [ ] 图片有 `alt` 文本
- [ ] 表单输入有 `<label>`
- [ ] 键盘可导航（Tab 顺序符合视觉顺序）
