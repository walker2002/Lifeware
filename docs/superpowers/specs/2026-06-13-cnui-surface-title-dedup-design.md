# CNUI Surface 标题去重设计

> **问题**: CNUI Surface 在对话中显示时，AI 消息文本与 Surface 内部标题形成视觉重复嵌套
> **目标**: 移除与 AI 文本重复的静态内部标题，保留含动态信息的标题

---

## 1. 问题根因

在 `conversation-view.tsx:364-376` 中，CNUI 消息渲染流程：

```
msg.content          → "请选择要删除的任务"    ← AI 文本（外层上下文）
CnuiSurfaceWrapper   → 容器包裹
  └─ TaskActionPanel → "删除任务"              ← Surface 内部标题（重复）
```

两层标题形成视觉嵌套重复。

## 2. 修改范围

### 需移除静态标题的 Surface（8 个）

| 文件 | 内部标题 |
|---|---|
| `domains/tasks/cnui/surfaces/TaskActionPanel.tsx` | "删除任务"/"完成任务"/"归档任务"/"细化任务" |
| `domains/tasks/cnui/surfaces/ThreadActionPanel.tsx` | "暂停主线"/"恢复主线"/"完成主线"/"归档主线"/"编辑主线"/"选择要编辑的主线" |
| `domains/habits/cnui/surfaces/HabitActionPanel.tsx` | "激活草稿习惯"/"暂停活跃习惯"/"恢复暂停习惯"/"归档暂停习惯" |
| `domains/tasks/cnui/surfaces/TaskCreationCard.tsx` | "创建任务" |
| `domains/tasks/cnui/surfaces/ThreadCreationCard.tsx` | "创建主线" |
| `domains/tasks/cnui/surfaces/TaskEditCard.tsx` | "编辑任务"/"请选择要修改的任务" |
| `domains/tasks/cnui/surfaces/TaskSplitCard.tsx` | "任务拆分" |
| `domains/tasks/cnui/surfaces/TaskTreeView.tsx` | "任务树"/多处"编辑任务" |
| `domains/habits/cnui/surfaces/HabitCreationCard.tsx` | "习惯创建" |

### 保留动态标题的 Surface（2 个）

| 文件 | 内部标题 | 保留原因 |
|---|---|---|
| `domains/habits/cnui/surfaces/HabitCheckinPanel.tsx` | "今日打卡 (2/5)" | 含动态打卡进度 |
| `domains/timebox/cnui/surfaces/TimeboxList.tsx` | "智能编排方案 (3 项)" | 含动态项目计数 |

## 3. 修改方法

### 列表型 Surface

删除标题行及其包裹的 flex 容器，翻页控件和全屏按钮保留为独立元素。

修改前：
```tsx
<div className="mb-3 flex items-center justify-between">
  <span className="text-sm font-medium text-ink">{labels.title}</span>
  <div className="flex items-center gap-1.5">
    {/* 翻页 + 全屏 */}
  </div>
</div>
```

修改后：
```tsx
{/* 翻页 + 全屏按钮行 — 仅在有控件时渲染 */}
{(dataModel._pagination || onRequestFullscreen) && (
  <div className="mb-3 flex items-center justify-end gap-1.5">
    {/* 翻页 + 全屏 */}
  </div>
)}
```

### 表单型 Surface

直接删除标题行 div。

修改前：
```tsx
<div className="mb-3 text-sm font-medium text-ink">创建任务</div>
```

修改后：删除该行。

### TaskTreeView

删除各模式下的静态标题行。标签列表标题行（含动态标签数量）保留。

## 4. 不修改项

- **CnuiSurfaceWrapper** — 不渲染标题，无需改动
- **CnuiSurfaceFullscreen** — 已有独立标题机制（`rawData._title ?? action`）
- **CnuiSurfaceDone** — 已有独立摘要机制
- **ACTION_LABELS 常量** — `title` 字段不再用于 UI 渲染但保留不影响，`button` 字段继续使用
- **Handler 文件** — 不涉及
- **conversation-view.tsx** — `msg.content` 继续正常渲染
