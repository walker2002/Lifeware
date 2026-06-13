# CNUI Surface 规范合规修正设计

> **依据**: UI-DESIGN-SPEC §十一 CN-UI Surface 视觉规范
> **目标**: 将所有 habits、tasks、timebox Domain 的 CNUI Surface 组件统一到规范要求

---

## 1. 修正范围

11 个 Surface 文件，按修正类型分组。

### 列表操作型（已具备翻页+全屏，需修正样式细节）

| 文件 | 类型 |
|---|---|
| `domains/habits/cnui/surfaces/HabitActionPanel.tsx` | 习惯批量操作 |
| `domains/habits/cnui/surfaces/HabitCheckinPanel.tsx` | 习惯打卡 |
| `domains/tasks/cnui/surfaces/TaskActionPanel.tsx` | 任务批量操作 |
| `domains/tasks/cnui/surfaces/ThreadActionPanel.tsx` | 主线批量操作 |

### 表单型（需统一容器+按钮）

| 文件 | 类型 |
|---|---|
| `domains/habits/cnui/surfaces/HabitCreationCard.tsx` | 习惯创建 |
| `domains/tasks/cnui/surfaces/TaskCreationCard.tsx` | 任务创建 |
| `domains/tasks/cnui/surfaces/ThreadCreationCard.tsx` | 主线创建 |
| `domains/tasks/cnui/surfaces/TaskEditCard.tsx` | 任务编辑 |
| `domains/tasks/cnui/surfaces/TaskSplitCard.tsx` | 任务拆分（MVP 占位） |

### 特殊型

| 文件 | 类型 |
|---|---|
| `domains/tasks/cnui/surfaces/TaskTreeView.tsx` | 任务树（view/edit/select 三模式） |
| `domains/timebox/cnui/surfaces/TimeboxList.tsx` | 时间盒列表 |

---

## 2. 修正项

### A. 容器统一

**规范 §11.1**: `border border-hairline rounded-lg bg-surface-soft p-4`

| 文件 | 当前 | 修正 |
|---|---|---|
| TaskCreationCard | `<Card>` 组件 | `<div className="border border-hairline rounded-lg bg-surface-soft p-4">` |
| TaskSplitCard | `<Card>` 组件 | 同上 |
| ThreadCreationCard | `<Card>` 组件 | 同上 |
| TimeboxList | `<Card>` 组件 | 同上 |
| HabitCreationCard | `<div className="w-full max-w-md">` | `<div className="w-full max-w-md border border-hairline rounded-lg bg-surface-soft p-4">` |
| TaskEditCard | `<div className="w-full max-w-md">` | 同 HabitCreationCard |
| TaskTreeView | `<div className="... border border-hairline bg-canvas">` | `bg-canvas` → `bg-surface-soft` |

去掉 Card 组件后，CardHeader/CardContent/CardTitle 的布局用 div + flex 手动实现，保持相同的视觉结构：
- 标题：`text-sm font-medium text-ink`
- 内容区间隔：`space-y-3` 或 `flex flex-col gap-3`

### B. 按钮样式统一

**规范 §11.6**:

- 主操作：`bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-xs font-medium disabled:opacity-50`
- 取消：`rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors`

**全局替换**:

| 查找 | 替换 | 涉及文件 |
|---|---|---|
| `text-on-primary` | `text-primary-foreground` | HabitActionPanel, TaskActionPanel, ThreadActionPanel, TaskEditCard, TaskTreeView |
| `disabled:opacity-40` | `disabled:opacity-50` | 所有含此样式的文件 |
| `text-body/60 hover:text-ink transition-colors`（取消按钮文字态） | `border border-hairline text-ink hover:bg-hover-overlay transition-colors` | TaskCreationCard, TaskSplitCard, ThreadCreationCard |
| `border` → `border border-hairline`（取消按钮边框缺失） | 加 `border-hairline` | HabitActionPanel, HabitCheckinPanel |

**HabitCheckinPanel 特殊按钮**:

| 当前 | 修正 |
|---|---|
| "完成" `bg-success text-on-primary` | `bg-primary text-primary-foreground`（打卡是主操作） |
| "详情" `bg-muted text-on-primary` | `border border-hairline bg-canvas text-ink`（次要操作） |

**CnuiButton 组件**（TaskCreationCard、ThreadCreationCard、TimeboxList 使用）:

检查 CnuiButton 内部样式是否已符合规范。如不符合，统一修改 CnuiButton 组件本身。

### C. 完成态统一

**规范 §11.7**: 由 CnuiSurfaceWrapper 统一处理

- 列表操作型 Surface（HabitActionPanel、TaskActionPanel、ThreadActionPanel）：已通过 CnuiSurfaceWrapper 处理 done 态 ✅，但组件内部的 `isDone` 简单文本渲染可保留作为 fallback
- 表单型 Surface：保留简单的 `✅ XXX已完成` 文本即可（表单内容固定，无需展开回看）
- TaskTreeView：done 态改为 `rounded-lg border border-hairline bg-surface-soft p-4` 容器包裹

### D. 全屏 + 翻页

**规则**: 列表型 Surface 必须支持，表单型不强制。

| 文件 | 加全屏 | 加翻页 |
|---|---|---|
| HabitCheckinPanel | ✅ 已有 | ✅ 已有 |
| TaskTreeView | 加 onRequestFullscreen prop + 标题行按钮 | 不加（自带搜索筛选，不适合翻页） |
| TimeboxList | 加 onRequestFullscreen prop + 标题行按钮 | 加翻页（items 可超 5） |
| TaskEditCard | 不加（列表短+内联编辑） | 不加（列表通常不长） |
| 表单型 | 不加 | 不加 |

---

## 3. 不修改项

- **CnuiSurfaceWrapper / CnuiRenderer / CnuiSurfaceFullscreen / CnuiSurfaceDone**: 基础设施层已合规，不修改
- **pagination.ts**: 工具函数已合规，不修改
- **cnui-form-adapter.tsx**: 通用表单适配器，HabitCreationCard 通过它渲染，不在本次范围
- **cnui/components/*.tsx**: CNUI 基础组件（Button、TextInput 等），如需修改 Button 统一 token 则单独处理
- **Handler 文件**: 只改 Surface 视觉层，不改 Handler 逻辑

---

## 4. 执行顺序

1. **先修 CnuiButton** — 确认/修正其内部 token，确保使用 `text-primary-foreground` 和 `disabled:opacity-50`
2. **列表操作型 4 文件** — 统一按钮 token（text-on-primary → text-primary-foreground，opacity-40 → opacity-50）
3. **表单型 5 文件** — Card → div 容器 + 按钮统一 + 标题行样式
4. **特殊型 2 文件** — TaskTreeView 容器背景 + TimeboxList 全面改造
5. **TypeScript 验证** — `tsc --noEmit` 零错误
