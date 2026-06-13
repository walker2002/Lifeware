# CN-UI Surface 尺寸约束与全屏展开设计

> 日期：2026-06-13
> 状态：已审批
> 关联：`docs/UI-DESIGN-SPEC.md` §4（CN-UI 对话界面）、`specs/010-cnui-surface-sizing/plan.md`（初版方案）
> 治理依据：Constitution VIII CN-UI Protocol Constraints、VI Domain Surface Ownership

---

## 1. 问题陈述

CN-UI Surface 组件嵌入 AI 对话面板（LeftPanel 260–400px）中，存在三类尺寸问题：

1. **高度无界**：12 个 Surface 中仅 3 个有 `max-h`，长列表（15+ 项）将对话上下文挤出视口
2. **嵌套滚动**：Surface 内部滚动 + 对话外部滚动在移动端是反模式
3. **宽度不一致**：`max-w-md`(6)、`max-w-lg`(5)、`max-w-2xl`(1) 各自为政

根因：`CnuiSurfaceWrapper`（公共包装层）不做任何尺寸管控，约束分散在各 Surface 内部。

---

## 2. 设计决策

### 2.1 三模式架构

| 模式 | 列表处理 | 高度约束 | 适用场景 |
|---|---|---|---|
| **对话内**（Inline） | 翻页，5 项/页 | `65vh` (active) | 所有 Surface 默认状态 |
| **全屏**（Fullscreen） | 直接滚动，全量展示 | 无限制 | 用户点击 `⛶` 展开 |
| **完成态**（Done） | 折叠摘要 + 可展开只读 | 展开后 `12rem` | Surface 已保存/取消 |

### 2.2 对话内模式（Inline）

**翻页机制**：
- 包装层拦截 `dataModel[itemsKey]`，按 `pageSize`（默认 5）自动分页
- `items.length ≤ pageSize` 时不分页，原始 `dataModel` 直接传递
- 翻页控件 `‹ page/totalPages ›` 内联于 Surface 标题行右侧，不占独立行
- 触发翻页：Surface 通过 `onDataChange({ _page: newPage })` 通知包装层

**高度约束**：
- active 容器：`max-h-[65vh] overflow-hidden`（由包装层控制）
- 桌面 1080p：65vh ≈ 631px，可见 ~13 项（远超每页 5 项，不会触发裁切）
- 移动端：65vh ≈ 360–508px，预留 35vh 给对话上下文

**`⛶` 全屏按钮**：
- 位于标题行最右侧（与翻页控件同行）
- 所有 Surface 通用（列表型 + 表单型）
- 不受 `expandable` prop 控制（Phase 2 该 prop 控制移动端是否自动提示展开）

### 2.3 全屏模式（Fullscreen）

**触发**：点击 `⛶` 按钮

**渲染方式**：
- **桌面端**：覆盖主显示区（MainContent），LeftPanel 保持可见
- **移动端**：覆盖全部可显示区域（全屏 Sheet，底部无拖拽手柄）

**顶部栏**：
```
[← 返回对话]     [标题]     [✕]
```

**行为约束**：
- 列表全量展示 + `overflow-y-auto` 滚动（无嵌套滚动问题）
- 表单型 Surface 无高度限制，自由展示
- 与对话内共享同一份 `lifecycleState`，关闭不丢数据
- `[← 返回对话]` / `[✕]` / `Esc` 只关闭全屏，不提交
- 全屏底部保留 `[取消]` `[确认]` 按钮，行为与对话内一致

### 2.4 完成态（Done）

**替换当前方案**（50% 透明 + 遮罩）→ 折叠摘要 + 可展开只读

**折叠态**（默认）：
```
┌─────────────────────────────────────┐
│ ✅ 已打卡 5 项                    ▶ │
└─────────────────────────────────────┘
```
- 摘要文本由 Surface submit 时写入 `dataModel._summary`
- 格式：`{ icon: string; title: string; items?: string[] }`
- 高度 ~60px，不占对话空间

**展开态**（点击后）：
- 渲染原始 Surface（只读），`max-h-48 overflow-y-auto`
- 收起按钮 `▼` 恢复折叠
- 展开/收起是纯 UI state（`useState`），不影响 `lifecycleState`

**摘要 fallback**：
- 未提供 `_summary` 时：`state === 'saved' ? '已保存' : '已取消'`

---

## 3. 架构设计

### 3.1 组件职责分工

```
CnuiSurfaceWrapper（公共包装层）
  ├─ 翻页逻辑：拦截 dataModel.items → slice 分页
  ├─ page state：useState 管理
  ├─ _pagination 注入：{ page, totalPages, total }
  ├─ 全屏状态：useState + Dialog/Sheet 渲染
  ├─ done 态：摘要/展开状态管理
  └─ CnuiRenderer → Surface 组件
       ├─ 条件渲染翻页指示器（读 _pagination）
       ├─ ⛶ 全屏按钮（点击回调通知包装层）
       └─ 业务逻辑不变
```

| 职责 | 归属 | 说明 |
|---|---|---|
| 分页计算 | 包装层 | `slice(pageStart, pageEnd)` |
| page state | 包装层 | `useState` 管理 |
| `_pagination` 注入 | 包装层 | `{ page, totalPages, total }` |
| `‹ 1/3 ›` 渲染 | Surface | 标题行右侧条件渲染（`_pagination` 存在时） |
| 翻页点击回调 | Surface → 包装层 | `onDataChange({ _page: newPage })` |
| 全屏开关 | 包装层 | Dialog/Sheet 容器 + 状态管理 |
| `⛶` 按钮渲染 | Surface | 标题行最右侧，点击回调通知包装层 |
| done 摘要/展开 | 包装层 | 不涉及 Surface 内部 |

### 3.2 Props 扩展

```typescript
interface CnuiSurfaceWrapperProps {
  // 现有 7 个字段（不变）
  surfaceId: string
  domainId: string
  action: string
  surfaceType: string
  dataSnapshot: Record<string, unknown> | undefined
  lifecycleState: CnuiLifecycleState
  lifecycleActions: CnuiLifecycleActions

  // 新增
  /** 列表数据字段名（默认 'items'） */
  itemsKey?: string
  /** 每页项目数（默认 5） */
  pageSize?: number
  /** 是否允许展开到全屏（默认 true） */
  expandable?: boolean
}
```

### 3.3 分页数据流

```
用户输入 → Surface.onDataChange({ _page: 2 })
  → CnuiSurfaceWrapper 拦截
    → 更新 page state
    → 重新 slice dataModel.items
    → 注入 _pagination = { page: 2, totalPages: 3, total: 15 }
    → 传递给 CnuiRenderer
      → Surface 收到 items[5..10] + _pagination
        → 渲染 5 项 + "‹ 2/3 ›"
```

---

## 4. 文件变更清单

| # | 文件 | 变更 | 说明 |
|---|---|---|---|
| 1 | `components/cnui/CnuiSurfaceWrapper.tsx` | 重构：添加翻页逻辑、全屏模式、done 态处理、Props 扩展 | 核心变更 |
| 2 | `components/cnui/CnuiSurfaceFullscreen.tsx` | **新建**：全屏 Dialog/Sheet 容器组件 | 全屏模式 |
| 3 | `components/cnui/CnuiSurfaceDone.tsx` | **新建**：done 态折叠摘要 + 可展开组件 | done 态 |
| 4 | `domains/habits/cnui/surfaces/HabitActionPanel.tsx` | 标题行添加翻页指示器 + ⛶ 按钮（~15 行） | 列表型 |
| 5 | `domains/habits/cnui/surfaces/HabitCheckinPanel.tsx` | 同上 | 列表型 |
| 6 | `domains/tasks/cnui/surfaces/TaskActionPanel.tsx` | 同上 | 列表型 |
| 7 | `domains/tasks/cnui/surfaces/ThreadActionPanel.tsx` | 同上 | 列表型 |
| 8 | `docs/UI-DESIGN-SPEC.md` | §4 新增 CN-UI Surface 尺寸规则 | 规范同步 |

**不变更的文件**：
- `CnuiRenderer.tsx` — 透传机制不变
- 表单型 Surface（TaskCreationCard、HabitCreationCard 等）— 不涉及翻页
- `use-cnui-lifecycle.ts` — 状态管理不变
- Nexus 层（types.ts、surface-store.ts）— 纯前端 UI 变更

---

## 5. 宪法合规检查

| 约束 | 合规 | 说明 |
|---|---|---|
| VI Domain Surface Ownership | ✅ | Surface 组件仍在 `domains/{domain}/cnui/`，公共层只改 `components/cnui/` |
| VIII CN-UI Protocol #3 (closed-loop) | ✅ | 全屏模式仍在对话流内，不导航到独立页面 |
| VIII CN-UI Protocol #5 (registry) | ✅ | 不修改 CnuiSurfaceRegistry 或 CnuiRenderer 的注册机制 |
| IV USOM Sovereignty | ✅ | 不涉及 USOM 对象或数据库变更 |
| V Repository Isolation | ✅ | 纯 UI 层变更，不触碰 Repository |
| Tier 2 文档同步 | ✅ | UI-DESIGN-SPEC.md 同步更新 |

---

## 6. 验收标准

- [ ] 列表型 Surface 包含 15+ 项时，对话内翻页展示（5 项/页），对话上下文可见
- [ ] 翻页控件 `‹ 1/3 ›` 内联于标题行，不占独立行
- [ ] 点击 `⛶` 进入全屏，列表全量展示 + 滚动，无高度限制
- [ ] 全屏关闭后数据不丢失，对话内 Surface 状态一致
- [ ] 已完成/已取消 Surface 默认折叠为摘要行，点击可展开只读
- [ ] 表单型 Surface 在对话内有 65vh 高度上限，全屏无限制
- [ ] 现有所有 Surface 渲染无 layout regression
- [ ] UI-DESIGN-SPEC.md 新增 §N「CN-UI Surface 视觉规范」完整章节（见下方要求）
- [ ] `CnuiSurfaceWrapperProps` 包含 `itemsKey?` / `pageSize?` / `expandable?`

### UI-DESIGN-SPEC 新增章节要求

在 `docs/UI-DESIGN-SPEC.md` 中新增独立章节「CN-UI Surface 视觉规范」，涵盖：

1. **容器样式**：边框（`border-hairline`）、圆角（`rounded-lg`）、背景（`bg-surface-soft`）、内边距（`p-4`）
2. **标题行**：字体（`text-sm font-medium text-ink`）、与翻页控件/全屏按钮的布局关系
3. **翻页控件**：`‹ page/total ›` 按钮尺寸（20×20px）、页码文字样式、disabled 态、与标题行对齐方式
4. **全屏按钮（⛶）**：样式、hover 态、在标题行中的定位
5. **列表项**：选中态（`border-primary/40 bg-primary/10`）、间距（`gap-2`）、分隔线
6. **操作按钮**：主操作（`bg-primary text-primary-foreground`）、取消（`border border-hairline`）、disabled 态、尺寸规范
7. **Done 态**：折叠摘要样式、展开/收起指示器、只读遮罩
8. **全屏模式**：顶部栏样式、内容区布局、与 AppShell 的层级关系
9. **高度约束**：对话内 `65vh` / done `12rem` 的 CSS 变量令牌定义

此章节为 CN-UI Surface 开发的权威视觉参考，所有新增 Surface 必须遵守。
