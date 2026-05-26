# 习惯管理页面优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化习惯管理模块的四个 UI 方面：导航文案、列表分组、内嵌编辑、卡片角标

**Architecture:** 在现有 habit-list.tsx 内就地改造，移除双筛选器，改为状态分组+可折叠面板+内嵌编辑面板。HabitListPage 保留创建抽屉，编辑功能下沉到 habit-list.tsx。HabitForm 无需改动（已通过 `initial` prop 支持编辑模式）。GrowthMenu 无需改动（description 从 manifest 动态读取）。

**Tech Stack:** React 19, Next.js 16, Tailwind CSS 4, shadcn/ui, lucide-react

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/domains/habits/manifest.yaml` | Modify | 更新 view_list/view_templates 的 description |
| `frontend/src/domains/habits/components/habit-card.tsx` | Modify | 添加右上角角标 |
| `frontend/src/domains/habits/components/habit-list.tsx` | Rewrite | 状态分组 + 可折叠 + 内嵌编辑面板 |
| `frontend/src/domains/habits/pages/HabitListPage.tsx` | Modify | 移除编辑抽屉，传递新 props |

---

### Task 1: 更新 manifest.yaml 导航文案

**Files:**
- Modify: `frontend/src/domains/habits/manifest.yaml:53-67`

- [ ] **Step 1: 更新 manifest.yaml 中两个 intent_trigger 的 description**

将 `view_list` 的 description 从 "查看习惯列表" 改为 "习惯管理"：
```yaml
  - action: view_list
    shortcut: /habits
    description: 习惯管理
    examples:
      - 查看我的习惯
      - 有哪些习惯
    keywords: [习惯列表, 查看]
    view_route: /habits
```

将 `view_templates` 的 description 从 "查看习惯模板" 改为 "习惯模板配置"：
```yaml
  - action: view_templates
    shortcut: /habitTemplates
    description: 习惯模板配置
    examples:
      - 查看习惯模板
      - 有什么模板可以用
    keywords: [模板, template]
    view_route: /habits/templates
```

- [ ] **Step 2: 验证**

启动 dev server (`cd frontend && npm run dev`)，打开左侧 GrowthMenu 面板，确认 habits 域下显示"习惯管理"和"习惯模板配置"。

- [ ] **Step 3: 提交**

```bash
cd frontend
git add src/domains/habits/manifest.yaml
git commit -m "docs(habits): 更新导航菜单文案为习惯管理/习惯模板配置"
```

---

### Task 2: 添加 HabitCard 角标

**Files:**
- Modify: `frontend/src/domains/habits/components/habit-card.tsx:117-118`

- [ ] **Step 1: 给 Card 添加 relative 和角标元素**

在 `<Card>` 的 className 中添加 `relative overflow-hidden`，在 `<CardContent>` 内部最前面插入角标 div：

```tsx
    <Card className={cn("relative overflow-hidden transition-opacity", isSuspended && "opacity-60", isArchived && "opacity-40")}>
      <CardContent className="flex flex-col gap-3 pt-6">
        {/* 角标：可追踪=主色调，仅占时=柔和色 */}
        <div
          className={cn("absolute top-0 right-0 w-7 h-7 z-10", trackable ? "bg-primary/70" : "bg-muted")}
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%)" }}
        />
```

注意：shadcn Card 的 CardContent 有 `p-6`，但角标定位在 Card 上（`relative overflow-hidden` 在 Card 上），所以 `absolute top-0 right-0` 相对于 Card 的边界。需要在 Card 和 CardContent 之间放置角标，或者确保 CardContent 也有 `relative`。

实际实现：将角标放在 CardContent 内部，CardContent 添加 `relative`：

```tsx
    <Card className={cn("relative overflow-hidden transition-opacity", isSuspended && "opacity-60", isArchived && "opacity-40")}>
      <CardContent className="relative flex flex-col gap-3">
        {/* 角标：可追踪=主色调，仅占时=柔和色 */}
        <div
          className="absolute -top-6 -right-6 w-7 h-7 z-10"
        >
          <div
            className={cn("w-full h-full", trackable ? "bg-primary/70" : "bg-muted")}
            style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%)" }}
          />
        </div>
```

这里 `-top-6 -right-6` 将角标偏移到 CardContent 的 padding 外侧，使其贴在 Card 的实际右上角（因为 Card 有 `overflow-hidden`，圆角处会被裁切）。

- [ ] **Step 2: 验证**

在浏览器中查看习惯列表页面，确认：
- 可追踪卡片右上角有主色调三角形角标
- 仅占时卡片右上角有灰色三角形角标
- 角标不遮挡标题文字
- 草稿/暂停/归档状态下角标仍然可见

- [ ] **Step 3: 提交**

```bash
cd frontend
git add src/domains/habits/components/habit-card.tsx
git commit -m "feat(habits): 添加卡片角标区分可追踪/仅占时"
```

---

### Task 3: 重构 habit-list.tsx + HabitListPage

这是核心改动。包含三部分：扩展 HabitItem 接口、重写 habit-list.tsx、适配 HabitListPage。

**Files:**
- Rewrite: `frontend/src/domains/habits/components/habit-list.tsx`
- Modify: `frontend/src/domains/habits/pages/HabitListPage.tsx`

- [ ] **Step 1: 重写 habit-list.tsx**

完整替换文件内容为：

```tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { HabitCard } from "./habit-card"
import { HabitForm, type HabitFormFields } from "./habit-form"
import { ChevronDown, ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface HabitItem {
  id: string
  title: string
  trackable: boolean
  defaultTime: string
  earliestTime: string
  latestStartTime: string
  defaultDuration: number
  minDuration: number
  streak: number
  status: string
  frequencyType?: string
  description?: string
  longestStreak?: number
  completionRate7d?: number
  startDate: string
  endDate?: string
  daysOfWeek?: number[]
}

const STATUS_GROUPS = [
  { key: "draft", label: "草稿", defaultOpen: true },
  { key: "active", label: "活跃", defaultOpen: true },
  { key: "suspended", label: "暂停", defaultOpen: false },
  { key: "archived", label: "归档", defaultOpen: false },
] as const

interface HabitListProps {
  habits: HabitItem[]
  onCreate: () => void
  onStatusChange: (id: string, action: string) => void
  onUpdateHabit: (id: string, fields: HabitFormFields) => Promise<{ success: boolean; error?: string }>
  onRefresh: () => Promise<void>
}

export function HabitList({ habits, onCreate, onStatusChange, onUpdateHabit, onRefresh }: HabitListProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const g of STATUS_GROUPS) {
      init[g.key] = !g.defaultOpen
    }
    return init
  })

  const [editingHabitId, setEditingHabitId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const editingHabit = editingHabitId ? habits.find((h) => h.id === editingHabitId) ?? null : null

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleEditSave = async (fields: HabitFormFields) => {
    if (!editingHabitId) return
    setIsSubmitting(true)
    setSubmitError(null)
    const result = await onUpdateHabit(editingHabitId, fields)
    if (result.success) {
      setEditingHabitId(null)
      await onRefresh()
    } else {
      setSubmitError(result.error ?? "更新失败")
    }
    setIsSubmitting(false)
  }

  const handleEditCancel = () => {
    setEditingHabitId(null)
    setSubmitError(null)
  }

  const editInitial: Partial<HabitFormFields> | undefined = editingHabit
    ? {
        title: editingHabit.title,
        description: editingHabit.description,
        defaultTime: editingHabit.defaultTime,
        earliestTime: editingHabit.earliestTime,
        latestStartTime: editingHabit.latestStartTime,
        defaultDuration: editingHabit.defaultDuration,
        minDuration: editingHabit.minDuration,
        trackable: editingHabit.trackable,
        frequencyType: (editingHabit.frequencyType as "daily" | "weekly" | "custom") ?? "daily",
        daysOfWeek: editingHabit.daysOfWeek,
        startDate: editingHabit.startDate,
        endDate: editingHabit.endDate,
      }
    : undefined

  return (
    <div className="flex gap-0 overflow-y-auto max-h-[calc(100vh-200px)]">
      {/* 左侧：卡片列表 */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out",
          editingHabitId ? "flex-1 min-w-0" : "w-full",
        )}
      >
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-muted-foreground">{habits.length} 个习惯</span>
          <Button size="sm" onClick={onCreate}>
            + 新建习惯
          </Button>
        </div>

        {/* 状态分组 */}
        <div className="flex flex-col gap-4">
          {STATUS_GROUPS.map((group) => {
            const groupHabits = habits
              .filter((h) => h.status === group.key)
              .sort((a, b) => a.defaultTime.localeCompare(b.defaultTime))
            const isCollapsed = collapsed[group.key]

            return (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex items-center gap-1.5 mb-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                  {group.label} ({groupHabits.length})
                </button>

                {!isCollapsed &&
                  (groupHabits.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 pl-6">暂无习惯</p>
                  ) : (
                    <div
                      className={cn(
                        "grid gap-3 pl-6 transition-all",
                        editingHabitId
                          ? "grid-cols-1 sm:grid-cols-2"
                          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
                      )}
                    >
                      {groupHabits.map((habit) => (
                        <HabitCard
                          key={habit.id}
                          title={habit.title}
                          trackable={habit.trackable}
                          defaultTime={habit.defaultTime}
                          earliestTime={habit.earliestTime}
                          latestStartTime={habit.latestStartTime}
                          defaultDuration={habit.defaultDuration}
                          minDuration={habit.minDuration}
                          streak={habit.streak}
                          description={habit.description}
                          longestStreak={habit.longestStreak}
                          completionRate7d={habit.completionRate7d}
                          status={habit.status}
                          frequencyType={habit.frequencyType}
                          onEdit={() => setEditingHabitId(habit.id)}
                          onStatusChange={(action) => onStatusChange(habit.id, action)}
                        />
                      ))}
                    </div>
                  ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* 右侧：编辑面板 */}
      {editingHabitId && (
        <div className="w-[480px] shrink-0 border-l pl-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4 sticky top-0 bg-background py-2">
            <h3 className="text-sm font-medium">编辑习惯</h3>
            <button
              type="button"
              onClick={handleEditCancel}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          {submitError && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
              {submitError}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setSubmitError(null)}
              >
                关闭
              </button>
            </div>
          )}

          <HabitForm
            key={editingHabitId}
            initial={editInitial}
            onSubmit={handleEditSave}
            onCancel={handleEditCancel}
            isLoading={isSubmitting}
          />
        </div>
      )}
    </div>
  )
}
```

关键设计说明：
- `HabitItem` 接口新增 `startDate`、`endDate`、`daysOfWeek` 字段（编辑表单需要）
- 移除 `FilterType`、`StatusFilter` 类型和筛选 UI
- 移除 `onEdit` prop，改为内部 `editingHabitId` 状态管理
- 新增 `onUpdateHabit` 和 `onRefresh` props
- 编辑时卡片网格列数从 4 列降为 2 列，避免过窄
- 编辑面板固定 480px 宽度，带 `border-l` 分隔

- [ ] **Step 2: 更新 HabitListPage — 扩展 HabitItem + habitToItem**

在 `HabitListPage.tsx` 中：

**2a.** 更新 `HabitItem` 接口，在现有字段后追加：

```typescript
interface HabitItem {
  id: string
  title: string
  trackable: boolean
  defaultTime: string
  earliestTime: string
  latestStartTime: string
  defaultDuration: number
  minDuration: number
  streak: number
  status: string
  frequencyType?: string
  description?: string
  longestStreak?: number
  completionRate7d?: number
  startDate: string
  endDate?: string
  daysOfWeek?: number[]
}
```

**2b.** 更新 `habitToItem` 函数，追加新字段映射：

```typescript
function habitToItem(h: Habit): HabitItem {
  return {
    id: h.id,
    title: h.title,
    trackable: h.trackable,
    defaultTime: h.defaultTime,
    earliestTime: h.earliestTime,
    latestStartTime: h.latestStartTime,
    defaultDuration: h.defaultDuration,
    minDuration: h.minDuration,
    streak: h.streak,
    status: h.status,
    frequencyType: h.frequency.type,
    description: h.description,
    longestStreak: h.longestStreak,
    completionRate7d: h.completionRate7d,
    startDate: h.startDate,
    endDate: h.endDate,
    daysOfWeek: h.frequency.daysOfWeek,
  }
}
```

- [ ] **Step 3: 更新 HabitListPage — 移除编辑抽屉相关代码**

**3a.** 移除 `openEditDrawer` 回调（约第 154-167 行）。

**3b.** 简化 `handleSubmit`，只保留 create 逻辑：

```typescript
  const handleSubmit = useCallback(
    async (fields: HabitFormFields) => {
      setIsSubmitting(true)
      setPageState("submitting")
      setSubmitError(null)
      setFieldErrors({})

      try {
        const input = formFieldsToCreateInput(fields)
        const result = await submitHabitIntent(input)

        if (!result.success) {
          setSubmitError(result.error ?? "创建习惯失败")
          setPageState("dirty")
          return
        }

        closeDrawer()
        await loadHabits()
      } catch (err) {
        const message = err instanceof Error ? err.message : "操作失败"
        setSubmitError(message)
        setPageState("dirty")
      } finally {
        setIsSubmitting(false)
      }
    },
    [closeDrawer, loadHabits],
  )
```

**3c.** 新增 `handleUpdateHabit` 回调：

```typescript
  const handleUpdateHabit = useCallback(
    async (id: string, fields: HabitFormFields): Promise<{ success: boolean; error?: string }> => {
      const input: UpdateHabitInput = {
        title: fields.title,
        description: fields.description,
        defaultTime: fields.defaultTime,
        earliestTime: fields.earliestTime,
        latestStartTime: fields.latestStartTime,
        defaultDuration: fields.defaultDuration,
        minDuration: fields.minDuration,
        trackable: fields.trackable,
        frequencyType: fields.frequencyType,
        daysOfWeek: fields.daysOfWeek,
        startDate: fields.startDate,
        endDate: fields.endDate,
      }
      const result = await updateHabit(id, input)
      return { success: result.success, error: result.error }
    },
    [],
  )
```

**3d.** 更新 `<HabitList>` 调用，替换 props：

```tsx
      <HabitList
        habits={habitItems}
        onCreate={openCreateDrawer}
        onStatusChange={handleStatusChange}
        onUpdateHabit={handleUpdateHabit}
        onRefresh={loadHabits}
      />
```

**3e.** 移除编辑抽屉（Sheet），只保留创建抽屉。将 Sheet 的 open 条件改为仅 create 模式：

```tsx
      <Sheet open={drawerMode === "create"} onOpenChange={(open) => { if (!open) handleCancel() }}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>新建习惯</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <HabitForm
              key="create"
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isLoading={isSubmitting}
              onDirtyChange={handleFormChange}
              submitTrigger={submitTrigger}
            />
          </div>
          {Object.keys(fieldErrors).length > 0 && (
            <div className="mt-4 space-y-1">
              {Object.entries(fieldErrors).map(([field, msg]) => (
                <p key={field} className="text-xs text-red-600">
                  {field}: {msg}
                </p>
              ))}
            </div>
          )}
        </Content>
      </Sheet>
```

**3f.** 移除以下不再需要的代码：
- `editingHabit` state（第 95 行）
- `editInitial` 计算（第 365-380 行）
- `closeDrawer` 中对 `editingHabit` 的清理（保留 `setDrawerMode(null)` 即可）
- `openCreateDrawer` 中对 `setEditingHabit(null)` 的调用

- [ ] **Step 4: 验证**

启动 dev server，在浏览器中逐一验证：

1. **状态分组**：习惯按 草稿→活跃→暂停→归档 四组显示
2. **计数**：每组标题后显示 `(N)` 个数
3. **折叠/展开**：点击标题栏切换，默认草稿+活跃展开，暂停+归档收起
4. **编辑面板**：点击卡片编辑按钮 → 右侧出现 480px 编辑面板，卡片区域压缩
5. **编辑保存**：修改字段 → 保存 → 面板关闭，数据刷新
6. **编辑取消**：点击 X 或取消 → 面板关闭
7. **新建抽屉**：点击"新建习惯" → 右侧抽屉弹出（原有行为不变）
8. **角标**：可追踪/仅占时卡片角标颜色区分正常
9. **状态操作**：激活/暂停/恢复/归档/删除按钮功能正常
10. **响应式**：编辑面板打开时卡片列数自动减少

- [ ] **Step 5: 提交**

```bash
cd frontend
git add src/domains/habits/components/habit-list.tsx src/domains/habits/pages/HabitListPage.tsx
git commit -m "feat(habits): 状态分组+可折叠面板+内嵌编辑表单"
```

---

## Self-Review

**Spec 覆盖检查：**

| 需求项 | 对应 Task |
|---|---|
| 1. 导航文案修改 | Task 1 (manifest.yaml) |
| 2. 状态分组+折叠 | Task 3 (habit-list.tsx) |
| 3. 内嵌编辑面板 | Task 3 (habit-list.tsx + HabitListPage) |
| 4. 卡片角标颜色 | Task 2 (habit-card.tsx) |

**占位符扫描：** 无 TBD/TODO，所有步骤包含完整代码。

**类型一致性：**
- `HabitItem` 接口在 habit-list.tsx 和 HabitListPage.tsx 中字段一致（含 startDate/endDate/daysOfWeek）
- `HabitFormFields` 类型从 habit-form.tsx 导入，与 editInitial 构造匹配
- `onUpdateHabit` 签名 `(id: string, fields: HabitFormFields) => Promise<{success, error?}>` 在 habit-list.tsx props 和 HabitListPage handleUpdateHabit 之间一致
