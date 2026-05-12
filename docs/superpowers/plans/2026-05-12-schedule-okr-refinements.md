# 时间安排高度统一 + OKR 目录优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一时间安排日/周视图高度并修复滚动，优化 OKR 目录为可折叠分组并添加文本截断与悬停提示

**Architecture:** Task 5 修改布局容器使 `overflow-y-auto` 生效（需要父级 flex 列约束），同时统一日/周视图高度。Task 6 给 OKR 目录添加折叠状态管理和 flex 布局截断。

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS

---

## File Structure

| File | Action | Task | Responsibility |
|------|--------|------|---------------|
| `frontend/src/components/timebox/week-view.tsx` | Modify | 5 | 周视图高度从 500 改为 960 |
| `frontend/src/components/layout/app-shell.tsx` | Modify | 5 | 主内容区包装器添加 `flex flex-col` |
| `frontend/src/components/layout/main-content.tsx` | Modify | 5 | `<main>` 添加 `min-h-0` |
| `frontend/src/components/okr/okr-directory.tsx` | Modify | 6 | 可折叠分组 + 截断 + tooltip |

---

### Task 5: 时间安排视图高度统一 + 滚动修复

**Files:**
- Modify: `frontend/src/components/timebox/week-view.tsx:85`
- Modify: `frontend/src/components/layout/app-shell.tsx:66,72`
- Modify: `frontend/src/components/layout/main-content.tsx:16`

**背景**: 当前日视图时间轴高度为 24×40=960px，但周视图 Calendar 高度仅 500px。此外，`<main>` 的 `overflow-y-auto` 实际不生效——因为其父容器不是 flex 列，`<main>` 高度为 auto（随内容增长），永远不会溢出。

- [ ] **Step 1: 修改周视图高度**

修改 `frontend/src/components/timebox/week-view.tsx` 第 85 行：

```typescript
// 修改前
style={{ height: 500 }}

// 修改后
style={{ height: 960 }}
```

日视图时间轴高度为 `HOURS * 40 = 24 * 40 = 960px`，周视图 Calendar 高度对齐此值。

- [ ] **Step 2: 修复 AppShell 主内容区滚动支持**

修改 `frontend/src/components/layout/app-shell.tsx`：

第 66 行，桌面端主内容区包装器添加 `flex flex-col`：

```typescript
// 修改前
<div className="min-h-0 flex-1">

// 修改后
<div className="min-h-0 flex-1 flex flex-col">
```

第 72 行，移动端主内容区包装器同样添加 `flex flex-col`：

```typescript
// 修改前
<div className="min-h-0 flex-1 md:hidden">

// 修改后
<div className="min-h-0 flex-1 flex flex-col md:hidden">
```

**原理**：包装器成为 flex 列后，内部 `<main>` 的 `flex-1` 才会生效，使其高度被约束在可用空间内。当内容超出时，`overflow-y-auto` 才会触发滚动。

- [ ] **Step 3: MainContent 添加 min-h-0**

修改 `frontend/src/components/layout/main-content.tsx` 第 16 行：

```typescript
// 修改前
className="min-w-0 flex-1 overflow-y-auto bg-canvas p-6"

// 修改后
className="min-w-0 min-h-0 flex-1 overflow-y-auto bg-canvas p-6"
```

`min-h-0` 允许 flex 子元素收缩到比内容更小，这是 `overflow-y-auto` 在 flex 布局中生效的必要条件。

- [ ] **Step 4: 验证**

Run: `cd frontend && npm run lint`
Expected: 无新增 lint 错误

手动验证：
1. 启动 dev server，进入时间安排页面
2. 日视图和周视图切换，确认两者高度一致
3. 缩小浏览器窗口高度，确认纵向滚动条自动出现

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/timebox/week-view.tsx frontend/src/components/layout/app-shell.tsx frontend/src/components/layout/main-content.tsx
git commit -m "fix(schedule): 统一日/周视图高度，修复内容区滚动支持"
```

---

### Task 6: OKR 目录可折叠分组 + 文本截断

**Files:**
- Modify: `frontend/src/components/okr/okr-directory.tsx`

- [ ] **Step 1: 添加 React useState 导入**

在 `frontend/src/components/okr/okr-directory.tsx` 顶部添加 React 导入（第 2 行之后）：

```typescript
// 在现有 import 之后添加
import { useState } from "react"
```

- [ ] **Step 2: 添加折叠状态管理**

在组件函数内部（`OKRDirectory` 解构参数之后），`groupMap` 之前，添加折叠状态：

```typescript
export function OKRDirectory({
  objectives, selectedId, statusFilter,
  onStatusFilterChange, onSelect, onEdit, onDelete, onCreate, onImport,
}: OKRDirectoryProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const groupMap = new Map<string, Objective[]>()
  // ... 后续代码不变
```

- [ ] **Step 3: 替换分组渲染为可折叠 + 截断 + tooltip**

找到底部渲染部分（约第 151-169 行的 `groups.map`），替换为：

```tsx
{groups.map(group => (
  <div key={group.key}>
    <button type="button"
      onClick={() => toggleGroup(group.key)}
      className="flex items-center gap-1 text-xs font-semibold text-muted-foreground py-1 w-full hover:bg-muted/50 rounded px-1 transition-colors">
      <span className="text-[10px] leading-none">
        {collapsedGroups.has(group.key) ? '▸' : '▾'}
      </span>
      {group.key}
      <span className="font-normal text-muted-foreground/60">({group.items.length})</span>
    </button>
    {!collapsedGroups.has(group.key) && (
      <div className="space-y-0.5">
        {group.items.map(obj => (
          <button key={obj.id} type="button"
            onClick={() => onSelect(obj.id)}
            title={obj.title}
            className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm hover:bg-muted/80 transition-colors ${
              selectedId === obj.id ? 'bg-muted font-medium' : ''
            }`}>
            {obj.objectiveNumber && (
              <span className="font-mono text-xs text-muted-foreground shrink-0">{obj.objectiveNumber}</span>
            )}
            <span className="truncate min-w-0">{obj.title}</span>
          </button>
        ))}
      </div>
    )}
  </div>
))}
```

关键变更说明：
1. **可折叠分组**：组头变为可点击按钮，点击切换折叠状态。使用 `▸`/`▾` Unicode 三角指示展开/折叠
2. **截断**：每个目标按钮改为 `flex` 布局，编号 `shrink-0` 不收缩，标题 `truncate min-w-0` 正确截断
3. **悬停提示**：按钮添加 `title={obj.title}`，鼠标悬停显示完整标题
4. **计数**：组头显示该组目标数量

- [ ] **Step 4: 验证**

Run: `cd frontend && npm run lint`
Expected: 无新增 lint 错误

手动验证：
1. 启动 dev server，进入 OKR 页面
2. 确认周期分组可以点击折叠/展开
3. 确认长标题被截断并显示"..."
4. 鼠标悬停截断标题时显示完整信息

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/okr/okr-directory.tsx
git commit -m "feat(okr): OKR 目录支持折叠分组、文本截断和悬停提示"
```

---

## Self-Review

### 1. 规格覆盖

| 需求 | 覆盖任务 |
|------|---------|
| [005] 日/周视图高度统一 | Task 5 Step 1 — 周视图 500→960 |
| [005] 窗口高度不足时滚动 | Task 5 Step 2-3 — flex 布局修复 |
| [006] 分组可收起/展开 | Task 6 Step 2-3 — useState + toggle |
| [006] 截断 + 悬停提示 | Task 6 Step 3 — flex + truncate + title |

### 2. 占位符扫描

无 TBD、TODO 或占位符。所有步骤包含完整代码。

### 3. 类型一致性

- `collapsedGroups` 类型 `Set<string>`，key 来自 `getPeriodGroupKey` 返回的 `string`
- `toggleGroup` 参数类型 `string`，与 group.key 类型一致
- `<main>` 保留原有 `min-w-0 flex-1`，仅添加 `min-h-0`
- app-shell 的 `flex flex-col` 不影响现有 props 类型
