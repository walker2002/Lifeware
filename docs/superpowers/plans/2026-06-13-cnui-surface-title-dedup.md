# CNUI Surface 标题去重实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除所有 CNUI Surface 中与 AI 消息文本重复的静态内部标题，消除视觉嵌套重复

**Architecture:** 10 个 Surface 文件按类型分为 3 组处理：列表型（3 个 ActionPanel）需保留翻页/全屏控件行但移除标题文本；表单型（5 个 CreationCard/EditCard/SplitCard）直接删除标题行；TaskTreeView 单独处理多种模式下的静态标题。HabitCheckinPanel 和 TimeboxList 的动态标题不做修改。

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4

---

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx` | 修改 | 删除标题行，保留翻页/全屏控件 |
| `frontend/src/domains/tasks/cnui/surfaces/ThreadActionPanel.tsx` | 修改 | 删除标题行（3 处），保留翻页/全屏控件 |
| `frontend/src/domains/habits/cnui/surfaces/HabitActionPanel.tsx` | 修改 | 删除标题行，保留翻页/全屏控件 |
| `frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx` | 修改 | 删除标题行 |
| `frontend/src/domains/tasks/cnui/surfaces/ThreadCreationCard.tsx` | 修改 | 删除标题行 |
| `frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx` | 修改 | 删除标题行（2 处） |
| `frontend/src/domains/tasks/cnui/surfaces/TaskSplitCard.tsx` | 修改 | 删除标题行 |
| `frontend/src/domains/tasks/cnui/surfaces/TaskTreeView.tsx` | 修改 | 删除静态标题行（5 处） |
| `frontend/src/domains/habits/cnui/surfaces/HabitCreationCard.tsx` | 修改 | 删除标题行 |

---

### Task 1: 列表型 Surface 标题移除（TaskActionPanel + HabitActionPanel）

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx:123-165`
- Modify: `frontend/src/domains/habits/cnui/surfaces/HabitActionPanel.tsx:96-138`

- [ ] **Step 1: 修改 TaskActionPanel**

在 `TaskActionPanel.tsx` 中，将标题行 + 翻页/全屏的合并容器拆分为仅保留翻页/全屏控件行。

将第 124-165 行（`<div className="w-full max-w-lg">` 内的第一段）：

```tsx
  return (
    <div className="w-full max-w-lg">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{labels.title}</span>
        <div className="flex items-center gap-1.5">
          {(() => {
  const p = dataModel._pagination as { page: number; totalPages: number } | undefined
  return p && (
    <>
      <button
        type="button"
        disabled={p.page <= 1}
        onClick={() => onDataChange({ ...dataModel, _page: p.page - 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ‹
      </button>
      <span className="min-w-[2rem] text-center text-xs text-muted">
        {p.page}/{p.totalPages}
      </span>
      <button
        type="button"
        disabled={p.page >= p.totalPages}
        onClick={() => onDataChange({ ...dataModel, _page: p.page + 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ›
      </button>
    </>
  )
})()}
          {onRequestFullscreen && (
            <button
              type="button"
              onClick={onRequestFullscreen}
              className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
              title="全屏展开"
            >
              ⛶
            </button>
          )}
        </div>
      </div>
```

替换为（删除标题文本，控件行条件渲染且右对齐）：

```tsx
  return (
    <div className="w-full max-w-lg">
      {/* 翻页 + 全屏控件 — 仅在有控件时渲染 */}
      {(dataModel._pagination || onRequestFullscreen) && (
        <div className="mb-3 flex items-center justify-end gap-1.5">
          {(() => {
  const p = dataModel._pagination as { page: number; totalPages: number } | undefined
  return p && (
    <>
      <button
        type="button"
        disabled={p.page <= 1}
        onClick={() => onDataChange({ ...dataModel, _page: p.page - 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ‹
      </button>
      <span className="min-w-[2rem] text-center text-xs text-muted">
        {p.page}/{p.totalPages}
      </span>
      <button
        type="button"
        disabled={p.page >= p.totalPages}
        onClick={() => onDataChange({ ...dataModel, _page: p.page + 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ›
      </button>
    </>
  )
})()}
          {onRequestFullscreen && (
            <button
              type="button"
              onClick={onRequestFullscreen}
              className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
              title="全屏展开"
            >
              ⛶
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 2: 修改 HabitActionPanel**

在 `HabitActionPanel.tsx` 中，同样的模式。将第 96-138 行（标题行+控件行）：

```tsx
  return (
    <div className="w-full max-w-lg">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{labels.title}</span>
        <div className="flex items-center gap-1.5">
          {(() => {
            const p = dataModel._pagination as { page: number; totalPages: number } | undefined
            return p && (
            <>
              <button
                type="button"
                disabled={p.page <= 1}
                onClick={() => onDataChange({ ...dataModel, _page: p.page - 1 })}
                className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
              >
                ‹
              </button>
              <span className="min-w-[2rem] text-center text-xs text-muted">
                {p.page}/{p.totalPages}
              </span>
              <button
                type="button"
                disabled={p.page >= p.totalPages}
                onClick={() => onDataChange({ ...dataModel, _page: p.page + 1 })}
                className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
              >
                ›
              </button>
            </>
          )
          })()}
          {onRequestFullscreen && (
            <button
              type="button"
              onClick={onRequestFullscreen}
              className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
              title="全屏展开"
            >
              ⛶
            </button>
          )}
        </div>
      </div>
```

替换为：

```tsx
  return (
    <div className="w-full max-w-lg">
      {/* 翻页 + 全屏控件 — 仅在有控件时渲染 */}
      {(dataModel._pagination || onRequestFullscreen) && (
        <div className="mb-3 flex items-center justify-end gap-1.5">
          {(() => {
            const p = dataModel._pagination as { page: number; totalPages: number } | undefined
            return p && (
            <>
              <button
                type="button"
                disabled={p.page <= 1}
                onClick={() => onDataChange({ ...dataModel, _page: p.page - 1 })}
                className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
              >
                ‹
              </button>
              <span className="min-w-[2rem] text-center text-xs text-muted">
                {p.page}/{p.totalPages}
              </span>
              <button
                type="button"
                disabled={p.page >= p.totalPages}
                onClick={() => onDataChange({ ...dataModel, _page: p.page + 1 })}
                className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
              >
                ›
              </button>
            </>
          )
          })()}
          {onRequestFullscreen && (
            <button
              type="button"
              onClick={onRequestFullscreen}
              className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
              title="全屏展开"
            >
              ⛶
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 3: TypeScript 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "(TaskActionPanel|HabitActionPanel)" || echo "No errors in modified files"`
Expected: "No errors in modified files"

- [ ] **Step 4: 提交**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx frontend/src/domains/habits/cnui/surfaces/HabitActionPanel.tsx
git commit -m "fix: 移除 TaskActionPanel/HabitActionPanel 重复静态标题 [023]"
```

---

### Task 2: ThreadActionPanel 标题移除（3 处）

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/ThreadActionPanel.tsx`

ThreadActionPanel 有 3 处标题行，分别在：
1. **update 模式-编辑表单** (约 L115-155)：标题"编辑主线" + 翻页/全屏
2. **update 模式-选择主线** (约 L244-284)：标题"选择要编辑的主线" + 翻页/全屏
3. **默认批量操作模式** (约 L334-375)：标题 `{labels.title}` + 翻页/全屏

- [ ] **Step 1: 修改 update 模式-编辑表单（约 L114-155）**

将：

```tsx
        <div className="w-full max-w-lg">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">编辑主线</span>
            <div className="flex items-center gap-1.5">
              {(() => {
  const p = dataModel._pagination as { page: number; totalPages: number } | undefined
  return p && (
    <>
      <button
        type="button"
        disabled={p.page <= 1}
        onClick={() => onDataChange({ ...dataModel, _page: p.page - 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ‹
      </button>
      <span className="min-w-[2rem] text-center text-xs text-muted">
        {p.page}/{p.totalPages}
      </span>
      <button
        type="button"
        disabled={p.page >= p.totalPages}
        onClick={() => onDataChange({ ...dataModel, _page: p.page + 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ›
      </button>
    </>
  )
})()}
              {onRequestFullscreen && (
                <button
                  type="button"
                  onClick={onRequestFullscreen}
                  className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
                  title="全屏展开"
                >
                  ⛶
                </button>
              )}
            </div>
          </div>
```

替换为：

```tsx
        <div className="w-full max-w-lg">
          {/* 翻页 + 全屏控件 */}
          {(dataModel._pagination || onRequestFullscreen) && (
            <div className="mb-3 flex items-center justify-end gap-1.5">
              {(() => {
  const p = dataModel._pagination as { page: number; totalPages: number } | undefined
  return p && (
    <>
      <button
        type="button"
        disabled={p.page <= 1}
        onClick={() => onDataChange({ ...dataModel, _page: p.page - 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ‹
      </button>
      <span className="min-w-[2rem] text-center text-xs text-muted">
        {p.page}/{p.totalPages}
      </span>
      <button
        type="button"
        disabled={p.page >= p.totalPages}
        onClick={() => onDataChange({ ...dataModel, _page: p.page + 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ›
      </button>
    </>
  )
})()}
              {onRequestFullscreen && (
                <button
                  type="button"
                  onClick={onRequestFullscreen}
                  className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
                  title="全屏展开"
                >
                  ⛶
                </button>
              )}
            </div>
          )}
```

- [ ] **Step 2: 修改 update 模式-选择主线（约 L243-284）**

将：

```tsx
      <div className="w-full max-w-lg">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-ink">选择要编辑的主线</span>
          <div className="flex items-center gap-1.5">
            {(() => {
  const p = dataModel._pagination as { page: number; totalPages: number } | undefined
  return p && (
    <>
      <button
        type="button"
        disabled={p.page <= 1}
        onClick={() => onDataChange({ ...dataModel, _page: p.page - 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ‹
      </button>
      <span className="min-w-[2rem] text-center text-xs text-muted">
        {p.page}/{p.totalPages}
      </span>
      <button
        type="button"
        disabled={p.page >= p.totalPages}
        onClick={() => onDataChange({ ...dataModel, _page: p.page + 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ›
      </button>
    </>
  )
})()}
            {onRequestFullscreen && (
              <button
                type="button"
                onClick={onRequestFullscreen}
                className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
                title="全屏展开"
              >
                ⛶
              </button>
            )}
          </div>
        </div>
```

替换为：

```tsx
      <div className="w-full max-w-lg">
        {/* 翻页 + 全屏控件 */}
        {(dataModel._pagination || onRequestFullscreen) && (
          <div className="mb-3 flex items-center justify-end gap-1.5">
            {(() => {
  const p = dataModel._pagination as { page: number; totalPages: number } | undefined
  return p && (
    <>
      <button
        type="button"
        disabled={p.page <= 1}
        onClick={() => onDataChange({ ...dataModel, _page: p.page - 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ‹
      </button>
      <span className="min-w-[2rem] text-center text-xs text-muted">
        {p.page}/{p.totalPages}
      </span>
      <button
        type="button"
        disabled={p.page >= p.totalPages}
        onClick={() => onDataChange({ ...dataModel, _page: p.page + 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ›
      </button>
    </>
  )
})()}
            {onRequestFullscreen && (
              <button
                type="button"
                onClick={onRequestFullscreen}
                className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
                title="全屏展开"
              >
                ⛶
              </button>
            )}
          </div>
        )}
```

- [ ] **Step 3: 修改默认批量操作模式（约 L333-375）**

将：

```tsx
    <div className="w-full max-w-lg">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{labels.title}</span>
        <div className="flex items-center gap-1.5">
          {(() => {
  const p = dataModel._pagination as { page: number; totalPages: number } | undefined
  return p && (
    <>
      <button
        type="button"
        disabled={p.page <= 1}
        onClick={() => onDataChange({ ...dataModel, _page: p.page - 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ‹
      </button>
      <span className="min-w-[2rem] text-center text-xs text-muted">
        {p.page}/{p.totalPages}
      </span>
      <button
        type="button"
        disabled={p.page >= p.totalPages}
        onClick={() => onDataChange({ ...dataModel, _page: p.page + 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ›
      </button>
    </>
  )
})()}
          {onRequestFullscreen && (
            <button
              type="button"
              onClick={onRequestFullscreen}
              className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
              title="全屏展开"
            >
              ⛶
            </button>
          )}
        </div>
      </div>
```

替换为：

```tsx
    <div className="w-full max-w-lg">
      {/* 翻页 + 全屏控件 */}
      {(dataModel._pagination || onRequestFullscreen) && (
        <div className="mb-3 flex items-center justify-end gap-1.5">
          {(() => {
  const p = dataModel._pagination as { page: number; totalPages: number } | undefined
  return p && (
    <>
      <button
        type="button"
        disabled={p.page <= 1}
        onClick={() => onDataChange({ ...dataModel, _page: p.page - 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ‹
      </button>
      <span className="min-w-[2rem] text-center text-xs text-muted">
        {p.page}/{p.totalPages}
      </span>
      <button
        type="button"
        disabled={p.page >= p.totalPages}
        onClick={() => onDataChange({ ...dataModel, _page: p.page + 1 })}
        className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40"
      >
        ›
      </button>
    </>
  )
})()}
          {onRequestFullscreen && (
            <button
              type="button"
              onClick={onRequestFullscreen}
              className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
              title="全屏展开"
            >
              ⛶
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 4: TypeScript 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep "ThreadActionPanel" || echo "No errors"`
Expected: "No errors"

- [ ] **Step 5: 提交**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/ThreadActionPanel.tsx
git commit -m "fix: 移除 ThreadActionPanel 重复静态标题 [023]"
```

---

### Task 3: 表单型 Surface 标题移除（5 个文件）

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx:79`
- Modify: `frontend/src/domains/tasks/cnui/surfaces/ThreadCreationCard.tsx:66`
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx:259,268`
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskSplitCard.tsx:39`
- Modify: `frontend/src/domains/habits/cnui/surfaces/HabitCreationCard.tsx:38`

所有修改都是简单删除单行标题 div，模式完全一致。

- [ ] **Step 1: TaskCreationCard — 删除标题行**

在 `TaskCreationCard.tsx` 第 79 行，删除：

```tsx
      <div className="mb-3 text-sm font-medium text-ink">创建任务</div>
```

- [ ] **Step 2: ThreadCreationCard — 删除标题行**

在 `ThreadCreationCard.tsx` 第 66 行，删除：

```tsx
      <div className="mb-3 text-sm font-medium text-ink">创建主线</div>
```

- [ ] **Step 3: TaskEditCard — 删除 2 处标题行**

在 `TaskEditCard.tsx`：

1. 第 259 行（直接编辑模式），删除：
```tsx
        <div className="mb-3 text-sm font-medium text-ink">编辑任务</div>
```

2. 第 268 行（列表模式），删除：
```tsx
      <div className="mb-3 text-sm font-medium text-ink">请选择要修改的任务</div>
```

- [ ] **Step 4: TaskSplitCard — 删除标题行**

在 `TaskSplitCard.tsx` 第 39 行，删除：

```tsx
      <div className="mb-3 text-sm font-medium text-ink">任务拆分</div>
```

- [ ] **Step 5: HabitCreationCard — 删除标题行**

在 `HabitCreationCard.tsx` 第 38 行，删除：

```tsx
      <div className="mb-3 text-sm font-medium text-ink">习惯创建</div>
```

- [ ] **Step 6: TypeScript 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "(TaskCreationCard|ThreadCreationCard|TaskEditCard|TaskSplitCard|HabitCreationCard)" || echo "No errors"`
Expected: "No errors"

- [ ] **Step 7: 提交**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx frontend/src/domains/tasks/cnui/surfaces/ThreadCreationCard.tsx frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx frontend/src/domains/tasks/cnui/surfaces/TaskSplitCard.tsx frontend/src/domains/habits/cnui/surfaces/HabitCreationCard.tsx
git commit -m "fix: 移除表单型 Surface 重复静态标题 [023]"
```

---

### Task 4: TaskTreeView 静态标题移除（5 处）

**Files:**
- Modify: `frontend/src/domains/tasks/cnui/surfaces/TaskTreeView.tsx`

TaskTreeView 有 5 处静态标题行需要处理：

1. **direct-confirm 模式**（约 L673）：`确认{ACTION_LABELS[action!]?.button ?? action!}` — 含动态按钮文本，但与 AI 消息重复
2. **direct-edit 模式**（约 L705）：`编辑任务`
3. **edit 模式-选中编辑**（约 L725）：`编辑任务`
4. **select 模式-确认阶段**（约 L746）：`确认{btnLabel} {selectedIds.size} 项任务` — 含动态数量，但与按钮文本重复
5. **树形视图标题栏**（约 L798）：`{labels.title}` — 静态标题
6. **树形视图-edit 模式无 labels**（约 L824）：`选择要修改的任务`

其中 #4 `确认{btnLabel} {selectedIds.size} 项任务` 含动态数据（已选数量），但按钮也已显示 `确认{btnLabel} ({selectedIds.size})`，形成信息重复。设计文档说"仅保留含动态信息的标题"，但此处动态信息已在按钮中体现，故一并移除。

- [ ] **Step 1: direct-confirm 模式标题移除（约 L670-698）**

将：

```tsx
  if (isDirectConfirm && detailTask) {
    return (
      <div className="w-full max-w-md">
        <div className="mb-3 text-sm font-medium text-ink">
          确认{ACTION_LABELS[action!]?.button ?? action!}
        </div>
        <div className="rounded-md border border-hairline p-3 flex items-center gap-2">
```

替换为（删除标题行）：

```tsx
  if (isDirectConfirm && detailTask) {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-md border border-hairline p-3 flex items-center gap-2">
```

- [ ] **Step 2: direct-edit 模式标题移除（约 L701-718）**

将：

```tsx
      <div className="w-full max-w-md">
        <div className="mb-3 text-sm font-medium text-ink">编辑任务</div>
        <EditForm
```

替换为：

```tsx
      <div className="w-full max-w-md">
        <EditForm
```

- [ ] **Step 3: edit 模式-选中后编辑标题移除（约 L722-738）**

将：

```tsx
      <div className="w-full max-w-md">
        <div className="mb-3 text-sm font-medium text-ink">编辑任务</div>
        <EditForm
```

替换为：

```tsx
      <div className="w-full max-w-md">
        <EditForm
```

- [ ] **Step 4: select 确认阶段标题移除（约 L742-789）**

将：

```tsx
      <div className="w-full max-w-md">
        <div className="mb-3 text-sm font-medium text-ink">
          确认{btnLabel} {selectedIds.size} 项任务
        </div>

        {/* 影响的任务列表 */}
```

替换为：

```tsx
      <div className="w-full max-w-md">
        {/* 影响的任务列表 */}
```

- [ ] **Step 5: 树形视图标题栏 — 改为仅保留全屏/全选控件（约 L796-822）**

将：

```tsx
      {/* 标题栏 */}
      {labels && (
        <div className="px-3 pt-3 pb-1 text-sm font-medium text-ink flex items-center justify-between">
          <span>{labels.title}</span>
          <div className="flex items-center gap-1.5">
            {mode === 'select' && allVisibleTaskIds.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs text-primary hover:text-primary-active font-normal transition-colors"
              >
                {selectedIds.size === allVisibleTaskIds.length ? '取消全选' : '全选'}
              </button>
            )}
            {onRequestFullscreen && (
              <button
                type="button"
                onClick={onRequestFullscreen}
                className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
                title="全屏展开"
              >
                ⛶
              </button>
            )}
          </div>
        </div>
      )}
```

替换为（删除标题文本，保留全选和全屏按钮，条件渲染）：

```tsx
      {/* 控件栏 — 全选/全屏 */}
      {((mode === 'select' && allVisibleTaskIds.length > 0) || onRequestFullscreen) && (
        <div className="px-3 pt-3 pb-1 flex items-center justify-end gap-1.5">
          {mode === 'select' && allVisibleTaskIds.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs text-primary hover:text-primary-active font-normal transition-colors"
            >
              {selectedIds.size === allVisibleTaskIds.length ? '取消全选' : '全选'}
            </button>
          )}
          {onRequestFullscreen && (
            <button
              type="button"
              onClick={onRequestFullscreen}
              className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
              title="全屏展开"
            >
              ⛶
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 6: edit 模式无 labels 标题栏（约 L823-837）**

将：

```tsx
      {mode === 'edit' && !labels && (
        <div className="px-3 pt-3 pb-1 text-sm font-medium text-ink flex items-center justify-between">
          <span>选择要修改的任务</span>
          {onRequestFullscreen && (
            <button
              type="button"
              onClick={onRequestFullscreen}
              className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
              title="全屏展开"
            >
              ⛶
            </button>
          )}
        </div>
      )}
```

替换为（仅保留全屏按钮，条件渲染）：

```tsx
      {mode === 'edit' && !labels && onRequestFullscreen && (
        <div className="px-3 pt-3 pb-1 flex items-center justify-end">
          <button
            type="button"
            onClick={onRequestFullscreen}
            className="flex size-[22px] items-center justify-center rounded border border-primary text-xs text-primary hover:bg-primary/10 transition-colors"
            title="全屏展开"
          >
            ⛶
          </button>
        </div>
      )}
```

- [ ] **Step 7: TypeScript 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep "TaskTreeView" || echo "No errors"`
Expected: "No errors"

- [ ] **Step 8: 提交**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskTreeView.tsx
git commit -m "fix: 移除 TaskTreeView 重复静态标题 [023]"
```

---

### Task 5: 全量验证

**Files:** 无新修改

- [ ] **Step 1: 全量 TypeScript 检查**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "(tasks|habits|timebox)/cnui/surfaces" || echo "All Surface files clean"`
Expected: "All Surface files clean"

- [ ] **Step 2: 残留标题扫描**

确认没有遗漏的静态标题。搜索所有 Surface 文件中剩余的 `font-medium text-ink` 标题：

Run: `grep -rn "text-sm font-medium text-ink" frontend/src/domains/*/cnui/surfaces/ | grep -v "HabitCheckinPanel\|TimeboxList" || echo "No remaining static titles"`

Expected: 仅 HabitCheckinPanel 和 TimeboxList 的动态标题保留（它们不在过滤中因为用 grep -v 排除了），或者输出为空。

- [ ] **Step 3: 验证完成**
