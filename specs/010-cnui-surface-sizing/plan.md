# CN-UI Surface 尺寸约束改进方案

> 状态：待审批 | 日期：2026-06-10
> 关联：`docs/UI-DESIGN-SPEC.md` §4（CN-UI 对话界面）

---

## 问题诊断

### 现状

CN-UI Surface 组件各自独立管理宽高约束，存在三个问题：

| 问题 | 影响 | 紧迫度 |
|---|---|---|
| **高度无界** — 12 个 Surface 中仅 3 个有 `max-h`，其余无限撑高 | 长列表（打卡面板 15+ 项）将对话流全部挤出视口，用户看不到上下文 | **现在就有** |
| **宽度不一致** — `max-w-md`（6 个）、`max-w-lg`（5 个）、`max-w-2xl`（1 个）各自为政 | 新 Surface 不知道用什么宽度，风格不统一 | 低（LeftPanel 300px 天然约束） |
| **无展开机制** — 列表型 Surface 在 300px 面板 + 高度限制下体验局促 | 移动端嵌套滚动是反模式，桌面端长列表操作也不便 | Phase 2（移动端启动时） |

### 根因

尺寸约束逻辑分散在 12 个 Surface 组件内部，`CnuiSurfaceWrapper` 作为包装层不做任何尺寸管控。

---

## 改进方案

### 总览

```
                    ┌─ CnuiSurfaceWrapper (包装层) ─┐
                    │  max-h-[55vh]                  │  ← 新增：统一高度上限
                    │  overflow-y-auto               │  ← 新增：超出内部滚动
                    │  max-w-2xl                     │  ← 新增：统一宽度上限
                    │  expandable prop               │  ← 新增：预留展开入口
                    │                                │
                    │  ┌─ Surface 组件 ────────────┐ │
                    │  │  (移除冗余 max-w-*)        │ │  ← 清理：宽度交给包装层
                    │  │  保留 w-full               │ │
                    │  │  极宽场景可覆盖包装层约束   │ │
                    │  └───────────────────────────┘ │
                    └────────────────────────────────┘
```

### Phase 1：立即执行（3 项变更）

#### 1-1. CnuiSurfaceWrapper 添加尺寸约束

**文件**：`frontend/src/components/cnui/CnuiSurfaceWrapper.tsx`

修改两个 div 容器的 className：

- **active 状态容器**（L80）：`className="mt-3 rounded-lg border border-hairline bg-surface-soft p-4"`
  → `className="mt-3 rounded-lg border border-hairline bg-surface-soft p-4 w-full max-h-[55vh] overflow-y-auto"`

- **done 状态容器**（L51）：`className="relative mt-3 rounded-lg border border-hairline bg-surface-soft p-4"`
  → `className="relative mt-3 rounded-lg border border-hairline bg-surface-soft p-4 max-h-48 overflow-hidden"`

宽度不在包装层强加 `max-w-*`，原因是：
- 桌面端 LeftPanel（260-400px）已经天然约束，加了也不生效
- 个别组件如 `TaskTreeView` 确实需要 `max-w-2xl`（672px），包装层不应阻止
- 宽度由各 Surface 根据内容类型自行决定是可接受的设计自由度

| 约束 | 值 | 理由 |
|---|---|---|
| max-height（active） | `55vh` | 保证对话上下文始终可见约一半视口 |
| max-height（done） | `12rem`（`max-h-48`） | 已完成卡片不需要展示全部内容 |
| overflow | `overflow-y-auto`（active）/ `overflow-hidden`（done） | active 内部滚动，done 裁切 + 遮罩 |

#### 1-2. 各 Surface 补充 max-height（仅列表型，其余不动）

以下 **列表型** Surface 的列表区域加 `max-h` + `overflow-y-auto`：

| Surface | 文件 | 列表区域 | 建议值 |
|---|---|---|---|
| HabitActionPanel | `domains/habits/cnui/surfaces/` | `.flex.flex-col.gap-2` | `max-h-64 overflow-y-auto` |
| HabitCheckinPanel | 同上 | `.flex.flex-col.gap-2` | `max-h-64 overflow-y-auto` |
| TaskActionPanel | `domains/tasks/cnui/surfaces/` | 列表容器 | `max-h-64 overflow-y-auto` |
| ThreadActionPanel | `domains/tasks/cnui/surfaces/` | 列表 + 表单容器 | `max-h-72 overflow-y-auto` |

已自行添加的（ThreadPromoteCard `max-h-32`、TaskSplitCard `max-h-40`、TaskTreeView `max-h-[400px]`）保持不变。

**表单型** Surface（TaskCreationCard、HabitCreationCard、ThreadCreationCard、TaskEditCard）不额外加高度限制 — 它们内容固定，不会过度撑高。

#### 1-3. UI 规范补充

在 `docs/UI-DESIGN-SPEC.md` §4 增加一条 CN-UI Surface 尺寸规则。

---

### Phase 2：展开到全屏（移动端启动时实现）

#### 设计思路

```
对话内（缩略态）                        全屏态（Dialog / Sheet）
┌── LeftPanel ────────────────┐        ┌─ 全屏浮层 ───────────────────────┐
│  AI: 以下是今日打卡清单      │        │  ← 返回对话   今日打卡         ✕  │
│                              │        │  ────────────────────────────── │
│  ┌ Surface ──────── [⛶] ┐   │        │                                  │
│  │ 项目 1          [完成] │   │  ──▶  │  项目 1                     [完成] │
│  │ 项目 2          [详情] │   │        │  项目 2                     [详情] │
│  │ (max-h:[55vh], 内部滚动) │   │        │  ...                      ▲    │
│  └────────────────────────┘   │        │  项目 15                    █    │
│                              │        │  项目 16                    █    │
│  AI: 还有其他需要吗？        │        │  项目 17                    ▼    │
└──────────────────────────────┘        │                                  │
                                        │  [取消]               [确认 (3)]  │
                                        └──────────────────────────────────┘
```

#### 关键交互约束

| 规则 | 说明 |
|---|---|
| **数据双向同步** | 全屏态修改实时反映到缩略态（同一份 `lifecycleState.surfaceData`），关闭不丢数据 |
| **确认按钮重复** | 全屏态底部保留确认/取消按钮，与缩略态的按钮行为一致（调用同一 `lifecycleActions`） |
| **返回 = 不提交** | 点击"← 返回对话"只关闭全屏态，不执行 submit |
| **键盘** | Esc 关闭全屏态，Ctrl+Enter 提交 |
| **桌面 vs 移动** | 桌面用 `<Dialog>`（居中模态），移动用底部 Sheet（带拖拽手柄） |

#### 接口预留（现在就做）

`CnuiSurfaceWrapperProps` 新增可选字段（Phase 1 只定义类型，不渲染 UI）：

```typescript
interface CnuiSurfaceWrapperProps {
  // ... 现有字段 ...

  /** 是否允许展开到全屏（默认 true，列表型 Surface 自动生效） */
  expandable?: boolean
  /** 展开按钮的屏幕提示文本 */
  expandLabel?: string
}
```

---

## 变更清单

### Phase 1 文件变更

| # | 文件 | 变更 | 风险 |
|---|---|---|---|
| 1 | `CnuiSurfaceWrapper.tsx` | 两个容器 div 添加 `max-h` + `overflow` | 低 — 纯 CSS，不影响逻辑 |
| 2 | `HabitActionPanel.tsx` | 列表区域加 `max-h-64 overflow-y-auto` | 低 |
| 3 | `HabitCheckinPanel.tsx` | 列表区域加 `max-h-64 overflow-y-auto` | 低 |
| 4 | `TaskActionPanel.tsx` | 列表区域加 `max-h-64 overflow-y-auto` | 低 |
| 5 | `ThreadActionPanel.tsx` | 列表/表单区域加 `max-h-72 overflow-y-auto` | 低 |
| 6 | `CnuiSurfaceWrapper.tsx`（Props） | 增加 `expandable?` / `expandLabel?` 类型 | 极低 — 仅类型定义 |
| 7 | `docs/UI-DESIGN-SPEC.md` | 新增 CN-UI Surface 尺寸约束规则 | 极低 |

### Phase 2 文件变更（预留，不在本次执行）

| # | 变更 |
|---|------|
| 8 | `CnuiSurfaceWrapper.tsx` — 渲染 `⛶` 展开按钮（当 `expandable !== false`） |
| 9 | 新建 `CnuiSurfaceFullscreen.tsx` — 全屏 Dialog/Sheet 容器 |
| 10 | `CnuiSurfaceWrapper.tsx` — 集成全屏态状态管理 |
| 11 | 响应式适配：桌面 Dialog / 移动 Bottom Sheet |

---

## 验收标准

- [ ] 打卡面板包含 15+ 项时，Surface 最高不超过 55vh，对话上下文仍可见
- [ ] 列表区域内部滚动不影响外部对话滚动（单次触摸/滚轮只作用在一个上下文）
- [ ] 已完成/已取消的 Surface 高度不超过 12rem，不占据过多空间
- [ ] 现有所有 Surface 渲染无 layout regression
- [ ] UI-DESIGN-SPEC.md 已补充 CN-UI 尺寸规则
- [ ] `CnuiSurfaceWrapperProps` 包含 `expandable?` 字段（类型层面预留）
