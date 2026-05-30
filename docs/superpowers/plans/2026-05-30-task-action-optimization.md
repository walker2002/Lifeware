# 任务管理 Action 优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 tasks domain 实现 CNUI surface（创建、编辑、归档任务），补全 handler 注册和 GrowthMenu 集成，使任务相关 action 在 GrowthMenu 和 AI 助手中正常响应。

**Architecture:** 遵循 habits domain 已验证的模式 — 3 个 CNUI surface 组件 + 1 个统一 handler。Surface 通过 `CnuiSurfaceRegistry` 注册，handler 通过 `CNUI_HANDLERS` 合并到 server action。manifest 新增 `cnui_surfaces` 块和 `response_type` 字段。

**Tech Stack:** React 19, TypeScript, CnuiSurfaceHandler 接口, Drizzle ORM, Next.js server actions

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `frontend/src/domains/tasks/cnui/handlers.ts` | CNUI handler — open/submit 逻辑 |
| Create | `frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx` | 创建任务 CNUI surface |
| Create | `frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx` | 编辑任务 CNUI surface（含选择器） |
| Create | `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx` | 完成/归档确认面板 |
| Modify | `frontend/src/domains/tasks/manifest.yaml` | 新增 cnui_surfaces + response_type |
| Modify | `frontend/src/domains/tasks/index.ts` | 注册 CNUI surfaces |
| Modify | `frontend/src/app/actions/intent.ts` | 合并 tasks CNUI handlers |
| Modify | `frontend/src/nexus/ai-runtime/cnui/register-client-surfaces.ts` | 客户端注册 tasks surfaces |
| Modify | `frontend/src/domains/registry.ts` | 补全 tasks handler 加载 |
| Modify | `frontend/src/app/page.tsx` | VIEW_PAGE_COMPONENTS 新增 tasks 映射 |

---

### Task 1: 更新 manifest.yaml — 新增 cnui_surfaces 和 response_type

**Files:**
- Modify: `frontend/src/domains/tasks/manifest.yaml`

- [ ] **Step 1: 为每个 intent_trigger 添加 response_type 和 cnui_surface 字段**

在 `intent_triggers` 的每个条目中添加 `response_type` 和 `cnui_surface`（仅 cnui 类型需要）：

```yaml
intent_triggers:
  - action: createTask
    shortcut: /createTask
    description: 创建一个新任务
    response_type: cnui
    cnui_surface: task-creation-card
    examples:
      - 创建一个任务
      - 添加一个新任务叫"完成报告"
    keywords: [任务, task, 创建, 添加]
  - action: updateTask
    shortcut: /updateTask
    description: 更新任务信息
    response_type: cnui
    cnui_surface: task-edit-card
    examples:
      - 修改任务标题
      - 更新任务优先级
    keywords: [修改, 更新, edit, update]
  - action: completeTask
    shortcut: /completeTask
    description: 完成一个任务
    response_type: cnui
    cnui_surface: task-action-panel
    examples:
      - 完成这个任务
      - 标记任务已完成
    keywords: [完成, complete, done]
  - action: archiveTask
    shortcut: /archiveTask
    description: 归档一个任务
    response_type: cnui
    cnui_surface: task-action-panel
    examples:
      - 归档这个任务
    keywords: [归档, archive]
  - action: createProject
    shortcut: /createProject
    description: 创建一个新项目
    response_type: page
    examples:
      - 创建一个新项目
      - 新建项目叫"产品重构"
    keywords: [项目, project, 创建, 新建]
  - action: updateProject
    shortcut: /updateProject
    description: 更新项目信息
    response_type: page
    examples:
      - 修改项目名称
      - 更新项目状态
    keywords: [修改, 更新, edit, update]
  - action: archiveProject
    shortcut: /archiveProject
    description: 归档一个项目
    response_type: page
    examples:
      - 归档这个项目
    keywords: [归档, archive]
  - action: view_list
    shortcut: /projects
    description: 查看项目与任务列表
    response_type: page
    examples:
      - 查看所有项目
      - 显示任务列表
    keywords: [项目列表, 任务列表, 查看]
    view_route: /projects
  - action: view_detail
    shortcut: /projectDetail
    description: 查看项目或任务详情
    response_type: page
    examples:
      - 查看项目详情
      - 打开任务详情
    keywords: [详情, detail]
    view_route: /projects/[id]
```

- [ ] **Step 2: 在 manifest 末尾（cascade_rules 之前）新增 cnui_surfaces 块**

```yaml
# ─── 区块 H: cnui_surfaces ───────────────────────────────────────
cnui_surfaces:
  task-creation-card:
    handler: domains/tasks/cnui/handlers
  task-edit-card:
    handler: domains/tasks/cnui/handlers
  task-action-panel:
    handler: domains/tasks/cnui/handlers
```

- [ ] **Step 3: 验证 YAML 格式正确**

Run: `cd /home/walker/lifeware/frontend && node -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('src/domains/tasks/manifest.yaml', 'utf8')); console.log('YAML OK')"` 或简单检查文件可读。

Expected: 无报错

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/tasks/manifest.yaml
git commit -m "feat(tasks): manifest 新增 cnui_surfaces 和 response_type 声明"
```

---

### Task 2: 创建 CNUI handler — cnui/handlers.ts

**Files:**
- Create: `frontend/src/domains/tasks/cnui/handlers.ts`

- [ ] **Step 1: 创建 handler 文件**

创建 `frontend/src/domains/tasks/cnui/handlers.ts`：

```typescript
import type { CnuiSurfaceHandler, CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'
import { TaskRepository } from '@/domains/tasks/repository/task'
import { SystemEventRepository } from '@/lib/db/repositories/system-event.repository'
import { taskTransitions, findTransition } from '@/domains/tasks/transitions'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { SystemEvent, SystemEventType } from '@/usom/types/process'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

const LIFECYCLE_STATUS_MAP: Record<string, string> = {
  completeTask: 'active',
  archiveTask: 'completed',
}

const LIFECYCLE_SM_ACTION: Record<string, string> = {
  completeTask: 'complete',
  archiveTask: 'archive',
}

async function getTasksByStatus(status: string): Promise<Record<string, unknown>[]> {
  try {
    const repo = new TaskRepository()
    const tasks = await repo.findByStatus(status as any, MVP_USER_ID as USOM_ID)
    return tasks.map(t => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      estimatedDuration: t.estimatedDuration,
      status: t.status,
    }))
  } catch (e) {
    console.error(`[taskCnuiHandler] 查询 tasks (status=${status}) 失败:`, e)
    return []
  }
}

async function getActiveTasks(): Promise<Record<string, unknown>[]> {
  try {
    const repo = new TaskRepository()
    const tasks = await repo.findActive(MVP_USER_ID as USOM_ID)
    return tasks.map(t => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      estimatedDuration: t.estimatedDuration,
      status: t.status,
    }))
  } catch (e) {
    console.error('[taskCnuiHandler] 查询 active tasks 失败:', e)
    return []
  }
}

export const taskCnuiHandler: CnuiSurfaceHandler = {
  async open(action): Promise<CnuiSurfaceOpenResult> {
    if (action === 'createTask') {
      return { content: '请填写任务信息', dataSnapshot: {} }
    }

    if (action === 'updateTask') {
      const tasks = await getActiveTasks()
      return { content: '请选择要修改的任务', dataSnapshot: { tasks } }
    }

    if (action in LIFECYCLE_STATUS_MAP) {
      const status = LIFECYCLE_STATUS_MAP[action]
      const items = await getTasksByStatus(status)
      const smAction = LIFECYCLE_SM_ACTION[action]
      const labels: Record<string, string> = { complete: '完成', archive: '归档' }
      return {
        content: `请选择要${labels[smAction] ?? smAction}的任务`,
        dataSnapshot: { action: smAction, items },
      }
    }

    return { content: '请填写信息', dataSnapshot: {} }
  },

  async submit(action, fields): Promise<CnuiSurfaceSubmitResult> {
    if (action === 'createTask') {
      const title = fields['title'] as string
      if (!title || title.trim() === '') {
        return { success: false, error: '任务标题不能为空' }
      }

      try {
        const taskRepo = new TaskRepository()
        const eventRepo = new SystemEventRepository()
        const now = new Date().toISOString() as Timestamp

        const task = await taskRepo.save({
          id: crypto.randomUUID() as USOM_ID,
          title: title.trim(),
          description: (fields['description'] as string) || undefined,
          status: 'draft',
          priority: (fields['priority'] as any) || 'medium',
          energyRequired: (fields['energyRequired'] as any) || 'medium',
          estimatedDuration: (fields['estimatedDuration'] as number) || 30,
          tags: [],
          createdAt: now,
          updatedAt: now,
        }, MVP_USER_ID as USOM_ID)

        const transition = findTransition(taskTransitions, null, 'create')
        if (transition) {
          const event: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: transition.eventType as SystemEventType,
            occurredAt: now,
            triggeredBy: 'handler',
            payload: { taskId: task?.id ?? '', toStatus: transition.to },
            snapshotId: '' as USOM_ID,
          }
          await eventRepo.append(event, MVP_USER_ID as USOM_ID)
        }

        return { success: true, data: { task } }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '创建任务失败'
        return { success: false, error: msg }
      }
    }

    if (action === 'updateTask') {
      const taskId = fields['taskId'] as string
      if (!taskId) {
        return { success: false, error: '未选择任务' }
      }

      try {
        const taskRepo = new TaskRepository()
        const existing = await taskRepo.findById(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
        if (!existing) {
          return { success: false, error: '任务不存在' }
        }

        const updates: Record<string, unknown> = {
          ...existing,
          updatedAt: new Date().toISOString(),
        }
        if (fields['title']) updates.title = fields['title']
        if (fields['description']) updates.description = fields['description']
        if (fields['priority']) updates.priority = fields['priority']
        if (fields['estimatedDuration']) updates.estimatedDuration = fields['estimatedDuration']

        await taskRepo.save(updates as any, MVP_USER_ID as USOM_ID)
        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '更新任务失败'
        return { success: false, error: msg }
      }
    }

    if (action in LIFECYCLE_SM_ACTION) {
      const selectedIds = fields['selectedIds'] as string[]
      if (!selectedIds || selectedIds.length === 0) {
        return { success: false, error: '未选择任何任务' }
      }

      const smAction = (fields['action'] as string ?? LIFECYCLE_SM_ACTION[action]) as 'complete' | 'archive'

      try {
        const taskRepo = new TaskRepository()
        const eventRepo = new SystemEventRepository()
        const now = new Date().toISOString() as Timestamp
        let lastError: string | undefined

        for (const taskId of selectedIds) {
          const existing = await taskRepo.findById(taskId as USOM_ID, MVP_USER_ID as USOM_ID)
          if (!existing) {
            lastError = `任务不存在: ${taskId}`
            continue
          }

          const transition = findTransition(taskTransitions, existing.status as any, smAction)
          if (!transition) {
            lastError = `非法状态转换: action="${smAction}", fromState="${existing.status}"`
            continue
          }

          await taskRepo.updateStatus(taskId as USOM_ID, transition.to, MVP_USER_ID as USOM_ID)

          const event: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: transition.eventType as SystemEventType,
            occurredAt: now,
            triggeredBy: 'handler',
            payload: { taskId, fromStatus: existing.status, toStatus: transition.to },
            snapshotId: '' as USOM_ID,
          }
          await eventRepo.append(event, MVP_USER_ID as USOM_ID)
        }

        if (lastError) return { success: false, error: lastError }
        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '状态更新失败'
        return { success: false, error: msg }
      }
    }

    return { success: false, error: `Unknown CN-UI action: tasks/${action}` }
  },
}

/** 所有 tasks domain 的 CNUI surface handler 映射 */
export const surfaceHandlers: Record<string, CnuiSurfaceHandler> = {
  'task-creation-card': taskCnuiHandler,
  'task-edit-card': taskCnuiHandler,
  'task-action-panel': taskCnuiHandler,
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: 无新增编译错误（可能有现有的与 tasks 无关的错误）

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domains/tasks/cnui/handlers.ts
git commit -m "feat(tasks): 创建 CNUI handler — 创建/编辑/归档任务"
```

---

### Task 3: 创建 TaskCreationCard surface

**Files:**
- Create: `frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx`

- [ ] **Step 1: 创建 TaskCreationCard 组件**

创建 `frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx`：

```tsx
'use client'

import { useState } from 'react'
import { CnuiFormAdapter } from '@/components/cnui/cnui-form-adapter'

interface TaskCreationCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
  isLoading?: boolean
  isDone?: boolean
}

export function TaskCreationCard({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: TaskCreationCardProps) {
  const [serverErrors, setServerErrors] = useState<string[]>([])

  return (
    <div className="w-full max-w-md">
      <div className="mb-3 text-sm font-medium text-ink">任务创建</div>
      <CnuiFormAdapter
        domainId="tasks"
        action="createTask"
        dataModel={dataModel}
        onDataChange={onDataChange}
        onConfirm={onConfirm}
        onCancel={onCancel}
        isLoading={isLoading}
        isDone={isDone}
        serverErrors={serverErrors}
      />
    </div>
  )
}
```

注意：此组件依赖 `FormRegistry` 中已注册 `tasks/createTask` 的表单映射。需要确认 FormRegistry 中已有 tasks 的注册。如果还没有，需要在 Task 7 中补充。

- [ ] **Step 2: Commit**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx
git commit -m "feat(tasks): 创建 TaskCreationCard CNUI surface 组件"
```

---

### Task 4: 创建 TaskEditCard surface

**Files:**
- Create: `frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx`

- [ ] **Step 1: 创建 TaskEditCard 组件**

创建 `frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx`：

```tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface TaskItem {
  id: string
  title: string
  priority: string
  estimatedDuration: number
  status: string
}

interface TaskEditCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
  isLoading?: boolean
  isDone?: boolean
}

const PRIORITY_LABELS: Record<string, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
}

export function TaskEditCard({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: TaskEditCardProps) {
  const tasks = (dataModel.tasks as TaskItem[]) ?? []
  const selectedTaskId = dataModel.taskId as string | undefined
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriority, setEditPriority] = useState('medium')
  const [editDuration, setEditDuration] = useState('60')

  // 已选中任务 → 编辑模式
  if (selectedTaskId) {
    return (
      <div className="w-full max-w-md">
        <div className="mb-3 text-sm font-medium text-ink">编辑任务</div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">标题</label>
            <input
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">描述</label>
            <textarea
              className="w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              rows={2}
              value={editDescription}
              onChange={e => setEditDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">优先级</label>
              <select
                value={editPriority}
                onChange={e => setEditPriority(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">预估时长（分钟）</label>
              <input
                type="number"
                min={5}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={editDuration}
                onChange={e => setEditDuration(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onDataChange({ tasks: dataModel.tasks })}
              className="rounded-md border px-3 py-1.5 text-xs"
            >
              返回选择
            </button>
            <button
              type="button"
              onClick={() => onConfirm({
                taskId: selectedTaskId,
                title: editTitle,
                description: editDescription,
                priority: editPriority,
                estimatedDuration: Number(editDuration),
              })}
              disabled={isLoading}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {isLoading ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 未选中 → 列表选择模式
  return (
    <div className="w-full max-w-lg">
      <div className="mb-3 text-sm font-medium text-ink">请选择要修改的任务</div>

      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">没有可编辑的任务</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map(task => (
            <button
              key={task.id}
              type="button"
              onClick={() => {
                setEditTitle(task.title)
                setEditDescription('')
                setEditPriority(task.priority)
                setEditDuration(String(task.estimatedDuration ?? 60))
                onDataChange({ taskId: task.id, ...task })
              }}
              className="flex items-center gap-3 rounded-md border p-3 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/50"
            >
              <div className="flex-1">
                <div className="text-sm font-medium">{task.title}</div>
                <div className="text-xs text-muted-foreground">
                  {PRIORITY_LABELS[task.priority] ?? task.priority}
                  {task.estimatedDuration ? ` · ${task.estimatedDuration}分钟` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded-md border px-3 py-1.5 text-xs">
          取消
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskEditCard.tsx
git commit -m "feat(tasks): 创建 TaskEditCard CNUI surface（含任务选择器）"
```

---

### Task 5: 创建 TaskActionPanel surface

**Files:**
- Create: `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx`

- [ ] **Step 1: 创建 TaskActionPanel 组件**

创建 `frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx`：

```tsx
'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface TaskItem {
  id: string
  title: string
  priority: string
  estimatedDuration: number
  status: string
}

interface TaskActionPanelProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
  isLoading?: boolean
}

const ACTION_LABELS: Record<string, { title: string; button: string }> = {
  complete: { title: '完成任务', button: '完成所选' },
  archive: { title: '归档任务', button: '归档所选' },
}

const PRIORITY_LABELS: Record<string, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
}

export function TaskActionPanel({ dataModel, onConfirm, onCancel, isLoading }: TaskActionPanelProps) {
  const action = (dataModel.action as string) ?? 'complete'
  const items = (dataModel.items as TaskItem[]) ?? []
  const labels = ACTION_LABELS[action] ?? ACTION_LABELS.complete

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelectedIds(new Set())
  }, [action])

  const allSelected = items.length > 0 && selectedIds.size === items.length

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(t => t.id)))
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleExecute() {
    onConfirm({ action, selectedIds: Array.from(selectedIds) })
  }

  return (
    <div className="w-full max-w-lg">
      <div className="mb-3 text-sm font-medium text-ink">{labels.title}</div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">没有符合条件的任务</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between border-b pb-2 text-xs text-muted-foreground">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="size-4 rounded"
              />
              全选
            </label>
            <span>已选 {selectedIds.size} / {items.length}</span>
          </div>

          {items.map(task => {
            const isSelected = selectedIds.has(task.id)
            return (
              <label
                key={task.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
                  isSelected && 'border-blue-400 bg-blue-50/50',
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOne(task.id)}
                  className="size-4 rounded accent-blue-500"
                />
                <div className="flex-1">
                  <div className={cn('text-sm font-medium', isSelected && 'text-gray-400 line-through')}>
                    {task.title}
                  </div>
                  <div className={cn('text-xs text-muted-foreground', isSelected && 'text-gray-400')}>
                    {PRIORITY_LABELS[task.priority] ?? task.priority}
                    {task.estimatedDuration ? ` · ${task.estimatedDuration}分钟` : ''}
                  </div>
                </div>
              </label>
            )
          })}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border px-3 py-1.5 text-xs"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={selectedIds.size === 0 || isLoading}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {labels.button} ({selectedIds.size})
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/domains/tasks/cnui/surfaces/TaskActionPanel.tsx
git commit -m "feat(tasks): 创建 TaskActionPanel CNUI surface（完成/归档确认面板）"
```

---

### Task 6: 注册 CNUI surfaces — 更新 domain index.ts

**Files:**
- Modify: `frontend/src/domains/tasks/index.ts`

- [ ] **Step 1: 在 index.ts 中添加 CNUI surface 导入和注册**

在现有 `index.ts` 中添加 surface 导入和 `cnuiRegistry.register()` 调用。完整文件内容：

```typescript
// Tasks Domain Plugin — 入口文件
// 遵循 Constitution Principle VI: 纯粹被动组件

import type { DomainPlugin } from '@/usom/types/process'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { createDomainPlugin } from '@/domains/plugin-factory'
import { createTasksHooks } from './hooks'

// ── CNUI Surface 组件导入 ─────────────────────────────────────────
import { TaskCreationCard } from './cnui/surfaces/TaskCreationCard'
import { TaskEditCard } from './cnui/surfaces/TaskEditCard'
import { TaskActionPanel } from './cnui/surfaces/TaskActionPanel'

// ── CNUI Surface 注册 ────────────────────────────────────────
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'

const handlerModulePath = './domains/tasks/cnui/handlers'

cnuiRegistry.register('tasks', 'task-creation-card', {
  component: TaskCreationCard,
  handlerModulePath,
})
cnuiRegistry.register('tasks', 'task-edit-card', {
  component: TaskEditCard,
  handlerModulePath,
})
cnuiRegistry.register('tasks', 'task-action-panel', {
  component: TaskActionPanel,
  handlerModulePath,
})

const result = loadDomainManifest('tasks')

if (!result.success) {
  for (const error of result.errors) {
    console.warn(`[manifest-loader] ${error.domainId}: ${error.message}`)
  }
}

const hooks = result.success
  ? createTasksHooks(result.manifest)
  : null as any

export const tasksPlugin: DomainPlugin = result.success
  ? createDomainPlugin(result.manifest, hooks)
  : null!

export { createTasksHooks } from './hooks'
export { taskTransitions, projectTransitions, findTransition } from './transitions'
export { ActiveTasksProvider } from './providers'
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/domains/tasks/index.ts
git commit -m "feat(tasks): 注册 CNUI surfaces 到 CnuiSurfaceRegistry"
```

---

### Task 7: 合并 tasks handler 到 server action + 客户端注册

**Files:**
- Modify: `frontend/src/app/actions/intent.ts`
- Modify: `frontend/src/nexus/ai-runtime/cnui/register-client-surfaces.ts`

- [ ] **Step 1: 在 intent.ts 中导入 tasks surface handlers**

在 `frontend/src/app/actions/intent.ts` 的 handler import 区域（约第 32-34 行），添加 tasks handler：

找到：
```typescript
import { surfaceHandlers as habitHandlers } from '@/domains/habits/cnui/handlers';
import { surfaceHandlers as timeboxHandlers } from '@/domains/timebox/cnui/handlers';
```

在其后添加：
```typescript
import { surfaceHandlers as taskHandlers } from '@/domains/tasks/cnui/handlers';
```

找到：
```typescript
const CNUI_HANDLERS: Record<string, CnuiSurfaceHandler> = {
  ...habitHandlers,
  ...timeboxHandlers,
}
```

改为：
```typescript
const CNUI_HANDLERS: Record<string, CnuiSurfaceHandler> = {
  ...habitHandlers,
  ...timeboxHandlers,
  ...taskHandlers,
}
```

- [ ] **Step 2: 在 register-client-surfaces.ts 中注册 tasks surfaces**

在 `frontend/src/nexus/ai-runtime/cnui/register-client-surfaces.ts` 中添加：

找到（文件末尾附近）：
```typescript
cnuiRegistry.register('timebox', 'timebox-list', { component: TimeboxList })
```

在其后添加：
```typescript
// Tasks surfaces
import { TaskCreationCard } from '@/domains/tasks/cnui/surfaces/TaskCreationCard'
import { TaskEditCard } from '@/domains/tasks/cnui/surfaces/TaskEditCard'
import { TaskActionPanel } from '@/domains/tasks/cnui/surfaces/TaskActionPanel'

cnuiRegistry.register('tasks', 'task-creation-card', { component: TaskCreationCard })
cnuiRegistry.register('tasks', 'task-edit-card', { component: TaskEditCard })
cnuiRegistry.register('tasks', 'task-action-panel', { component: TaskActionPanel })
```

- [ ] **Step 3: 验证编译**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: 无新增编译错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/actions/intent.ts frontend/src/nexus/ai-runtime/cnui/register-client-surfaces.ts
git commit -m "feat(tasks): 合并 tasks CNUI handlers 到 server action 和客户端注册"
```

---

### Task 8: 补全 registry.ts 中 tasks handler 加载

**Files:**
- Modify: `frontend/src/domains/registry.ts`

- [ ] **Step 1: 在 loadHandlers 中添加 tasks case**

找到 `loadHandlers` 函数中的 switch-case（约第 142-155 行）：

```typescript
async function loadHandlers(domainId: string): Promise<HandlerMap> {
  switch (domainId) {
    case 'timebox': {
      const mod = await import('./timebox/handlers')
      return mod.timeboxHandlers ?? {}
    }
    case 'habits': {
      const mod = await import('./habits/handlers')
      return mod.habitHandlers ?? {}
    }
    default:
      return {}
  }
}
```

添加 tasks case：

```typescript
async function loadHandlers(domainId: string): Promise<HandlerMap> {
  switch (domainId) {
    case 'timebox': {
      const mod = await import('./timebox/handlers')
      return mod.timeboxHandlers ?? {}
    }
    case 'habits': {
      const mod = await import('./habits/handlers')
      return mod.habitHandlers ?? {}
    }
    case 'tasks': {
      const mod = await import('./tasks/handlers/create')
      return { createTask: new mod.CreateTaskHandler() as unknown as DomainHandler }
    }
    default:
      return {}
  }
}
```

注意：由于当前 `CreateTaskHandler` 构造函数需要 `ITaskRepository` 参数，且当前接口还在迁移中，这个 case 暂时使用空构造。如果编译报错，可能需要调整 `CreateTaskHandler` 的构造函数使其接受可选参数，或者暂不注册（tasks domain 的 handler 主要通过 CNUI 路径工作，不通过 `loadHandlers` 路径）。

如果编译有困难，可以暂时跳过此步，因为 tasks domain 的 CNUI action 通过 `CNUI_HANDLERS` 工作，不走 `loadHandlers` 路径。

- [ ] **Step 2: Commit**

```bash
git add frontend/src/domains/registry.ts
git commit -m "feat(tasks): 补全 registry.ts 中 tasks handler 加载"
```

---

### Task 9: 更新 page.tsx — VIEW_PAGE_COMPONENTS 新增 tasks 映射

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: 导入 tasks 页面组件并在 VIEW_PAGE_COMPONENTS 中添加映射**

在 `frontend/src/app/page.tsx` 中，找到 imports 区域（约第 27-29 行）的 habits 页面导入：

```typescript
import { HabitListPage } from "@/domains/habits/pages/HabitListPage";
import { HabitTemplatePage } from "@/domains/habits/pages/HabitTemplatePage";
import { HabitStatisticsPage } from "@/domains/habits/pages/HabitStatisticsPage";
```

在其后添加：
```typescript
import { ProjectsView } from "@/domains/tasks/components/projects-view";
```

找到 `VIEW_PAGE_COMPONENTS` 常量（约第 57-61 行）：

```typescript
const VIEW_PAGE_COMPONENTS: Record<string, Record<string, React.ComponentType<any>>> = {
  habits: {
    view_list: HabitListPage,
    view_templates: HabitTemplatePage,
    createHabit: HabitListPage,
    view_statistics: HabitStatisticsPage,
  },
};
```

改为：
```typescript
const VIEW_PAGE_COMPONENTS: Record<string, Record<string, React.ComponentType<any>>> = {
  habits: {
    view_list: HabitListPage,
    view_templates: HabitTemplatePage,
    createHabit: HabitListPage,
    view_statistics: HabitStatisticsPage,
  },
  tasks: {
    view_list: ProjectsView,
    view_detail: ProjectsView,
    createProject: ProjectsView,
    createTask: ProjectsView,
  },
};
```

注意：`ProjectsView` 组件路径需确认。如果不存在独立导出，可能需要从 `app/projects/` 路由中提取，或使用 `projects-view.tsx` 中的组件。请检查 `frontend/src/domains/tasks/components/projects-view.tsx` 的导出名称。

- [ ] **Step 2: 验证编译**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: 无新增编译错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat(tasks): VIEW_PAGE_COMPONENTS 新增 tasks domain 页面映射"
```

---

### Task 10: 端到端验证

**Files:** 无新增

- [ ] **Step 1: 启动开发服务器验证无崩溃**

Run: `cd /home/walker/lifeware/frontend && npm run dev`

Expected: 服务器正常启动，无编译错误

- [ ] **Step 2: 验证 GrowthMenu 中 tasks action 显示正确**

在浏览器中打开应用，检查左侧 GrowthMenu 中 tasks domain 的 action：
- "创建一个新任务" 应显示 cnui 图标（MessageSquare）
- "查看项目与任务列表" 应显示 page 图标（LayoutGrid）

- [ ] **Step 3: 验证创建任务 CNUI surface**

点击 "创建一个新任务"，应切换到对话视图并弹出任务创建表单。

- [ ] **Step 4: 验证查看列表页面导航**

点击 "查看项目与任务列表"，应导航到 /projects 页面（在主内容区渲染 ProjectsView）。

- [ ] **Step 5: 修复任何运行时问题**

根据验证结果修复发现的问题，单独 commit。
