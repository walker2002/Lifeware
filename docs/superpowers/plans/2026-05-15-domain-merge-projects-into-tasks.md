# Domain 合并：projects → tasks 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `domains/projects/` 的 DomainPlugin 代码移入 `domains/tasks/`，删除 projects 域，保持现有功能不变。

**Architecture:** 纯文件迁移——projects 域的插件逻辑完整移入 tasks 域，`domainId` 从 `'projects'` 改为 `'tasks'`，manifest.yaml 补充 project 相关事件。不涉及 DB、Repository、类型、UI 等层的任何改动。

**Tech Stack:** TypeScript, Vitest

---

### Task 1: 创建 tasks/index.ts (DomainPlugin)

**Files:**
- Create: `frontend/src/domains/tasks/index.ts`

- [ ] **Step 1: 写入 tasks/index.ts**

将原 `projects/index.ts` 的插件代码移入，仅改两处：`domainId` 和导出名。

```typescript
import type {
  DomainPlugin,
  DomainManifest,
  USOMSnapshot,
  SystemEvent,
  DerivedSignals,
  ActionCandidate,
  ActionSurfaceSuggestion,
  MetricUpdate,
} from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID, ActionCategory } from '@/usom/types/primitives'

const TASK_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'archived'],
  active: ['in_progress', 'on_hold', 'archived'],
  in_progress: ['on_hold', 'completed', 'archived'],
  on_hold: ['active', 'archived'],
  completed: ['archived'],
  archived: [],
}

const PROJECT_TRANSITIONS: Record<string, string[]> = {
  planning: ['active', 'archived'],
  active: ['paused', 'completed', 'archived'],
  paused: ['active', 'archived'],
  completed: ['archived'],
  archived: [],
}

const tasksManifest: DomainManifest = {
  domainId: 'tasks',
  version: '1.0.0',
  requiredFields: ['name'],
  subscribedEvents: [
    'ProjectCreated',
    'ProjectActivated',
    'ProjectPaused',
    'ProjectResumed',
    'ProjectCompleted',
    'ProjectArchived',
    'TaskCreated',
    'TaskActivated',
    'TaskCompleted',
    'TaskArchived',
  ],
}

const SUBSCRIBED_EVENTS = new Set(tasksManifest.subscribedEvents)

function onValidate(
  intent: StructuredIntent,
  _snapshot: USOMSnapshot,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const { fields, action } = intent

  if (action === 'createProject' || action === 'updateProject') {
    const name = fields['name']
    if (action === 'createProject' && (!name || (typeof name === 'string' && name.trim() === ''))) {
      errors.push('项目名称必填')
    }
    if (typeof name === 'string' && name.length > 200) {
      errors.push('项目名称不能超过 200 字符')
    }
  }

  if (action === 'createTask' || action === 'updateTask') {
    const title = fields['title']
    if (action === 'createTask' && (!title || (typeof title === 'string' && title.trim() === ''))) {
      errors.push('任务标题必填')
    }
    const estimatedDuration = fields['estimatedDuration']
    if (estimatedDuration !== undefined && (typeof estimatedDuration !== 'number' || estimatedDuration <= 0)) {
      errors.push('预估时长必须大于 0')
    }
  }

  // 状态转换验证
  const targetStatus = fields['targetStatus'] as string | undefined
  const currentStatus = fields['currentStatus'] as string | undefined
  const targetType = fields['targetType'] as string | undefined

  if (targetStatus && currentStatus && targetType) {
    const transitions = targetType === 'project' ? PROJECT_TRANSITIONS : TASK_TRANSITIONS
    const allowed = transitions[currentStatus] ?? []
    if (!allowed.includes(targetStatus)) {
      errors.push(`${currentStatus} 状态不能转换为 ${targetStatus}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

function onEvent(
  event: SystemEvent,
  _snapshot: USOMSnapshot,
): { metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] } {
  if (!SUBSCRIBED_EVENTS.has(event.type)) {
    return { metrics: [], suggestions: [] }
  }

  const name = (event.payload['name'] || event.payload['title'] as string) || '未命名'

  switch (event.type) {
    case 'ProjectCreated':
      return {
        metrics: [{ metricKey: 'project_created', value: 1 }],
        suggestions: [{
          actionType: 'complete_task',
          label: `新项目已创建: ${name}，开始添加任务`,
          weight: 60,
        }],
      }

    case 'ProjectActivated':
      return {
        metrics: [],
        suggestions: [{ actionType: 'complete_task', label: `项目已激活: ${name}`, weight: 70 }],
      }

    case 'ProjectCompleted':
      return {
        metrics: [{ metricKey: 'project_completed', value: 1 }],
        suggestions: [{ actionType: 'review_okr', label: `项目已完成: ${name}`, weight: 80 }],
      }

    default:
      return { metrics: [], suggestions: [] }
  }
}

function onActionSurfaceRequest(
  snapshot: USOMSnapshot,
  _signals: Readonly<DerivedSignals>,
): { actions: ActionCandidate[]; category: ActionCategory; weight: number } {
  const actions: ActionCandidate[] = []
  const tasks = snapshot.activeTasks ?? []

  // 高优先级任务未启动
  for (const task of tasks) {
    if (task.priority === 'critical' || task.priority === 'high') {
      actions.push({
        id: `task-priority-${task.id}` as unknown as USOM_ID,
        sourceObjectId: task.id as unknown as USOM_ID,
        sourceObjectType: 'task',
        label: `高优先级任务待处理: ${task.title}`,
        actionType: 'complete_task',
        category: 'cue',
        weight: task.priority === 'critical' ? 90 : 70,
      })
    }
  }

  const maxWeight = actions.length > 0 ? Math.max(...actions.map(a => a.weight)) : 0
  return { actions, category: 'cue', weight: maxWeight }
}

export const tasksPlugin: DomainPlugin = {
  manifest: tasksManifest,
  onValidate,
  onEvent,
  onActionSurfaceRequest,
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/index.ts
git commit -m "feat: 创建 tasks DomainPlugin（迁移自 projects 域）

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 迁移测试文件

**Files:**
- Create: `frontend/src/domains/tasks/__tests__/index.test.ts`
- Delete: `frontend/src/domains/projects/__tests__/index.test.ts`

- [ ] **Step 1: 创建 tasks 测试文件**

从 `projects/__tests__/index.test.ts` 复制，仅改 import 路径。

```typescript
import { describe, it, expect } from 'vitest'
import { tasksPlugin } from '../index'
import type { StructuredIntent } from '@/usom/types/objects'

function makeIntent(overrides: Partial<StructuredIntent> = {}): StructuredIntent {
  return {
    id: 'int-1',
    intentionId: 'intent-1',
    targetDomain: 'tasks',
    action: 'createProject',
    fields: {},
    confidence: 1,
    resolvedBy: 'template_form',
    createdAt: '2026-05-12T00:00:00Z',
    ...overrides,
  }
}

function makeSnapshot(overrides = {}) {
  return {
    currentTime: '2026-05-12T08:00:00Z',
    currentDate: '2026-05-12',
    dayOfWeek: 2,
    timeOfDay: 'morning',
    energyState: {
      inferredLevel: 7,
      calibratedLevel: null,
      activeLevel: 7,
      source: 'system',
    },
    activeObjectives: [],
    activeKeyResults: [],
    activeTasks: [],
    pendingHabits: [],
    currentTimebox: null,
    upcomingTimeboxes: [],
    pendingIntentions: [],
    ...overrides,
  }
}

describe('tasksPlugin.onValidate', () => {
  const { onValidate } = tasksPlugin

  it('创建项目时名称必填', () => {
    const intent = makeIntent({ action: 'createProject', fields: {} })
    const snapshot = makeSnapshot()
    const result = onValidate(intent, snapshot as any)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('项目名称必填')
  })

  it('创建项目时名称不为空则通过', () => {
    const intent = makeIntent({ action: 'createProject', fields: { name: '测试项目' } })
    const result = onValidate(intent, makeSnapshot() as any)
    expect(result.valid).toBe(true)
  })

  it('创建任务时标题必填', () => {
    const intent = makeIntent({ action: 'createTask', fields: {} })
    const result = onValidate(intent, makeSnapshot() as any)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('任务标题必填')
  })

  it('创建任务时预估时长必须大于 0', () => {
    const intent = makeIntent({ action: 'createTask', fields: { title: '测试', estimatedDuration: 0 } })
    const result = onValidate(intent, makeSnapshot() as any)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('预估时长必须大于 0')
  })

  it('项目状态 active → paused 是合法转换', () => {
    const intent = makeIntent({
      action: 'updateProject',
      fields: {
        currentStatus: 'active',
        targetStatus: 'paused',
        targetType: 'project',
      },
    })
    const result = onValidate(intent, makeSnapshot() as any)
    expect(result.valid).toBe(true)
  })

  it('completed 状态的项目不能重新激活', () => {
    const intent = makeIntent({
      action: 'updateProject',
      fields: {
        currentStatus: 'completed',
        targetStatus: 'active',
        targetType: 'project',
      },
    })
    const result = onValidate(intent, makeSnapshot() as any)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('completed')
  })

  it('任务状态 active → in_progress 是合法转换', () => {
    const intent = makeIntent({
      action: 'updateTask',
      fields: {
        currentStatus: 'active',
        targetStatus: 'in_progress',
        targetType: 'task',
      },
    })
    const result = onValidate(intent, makeSnapshot() as any)
    expect(result.valid).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/domains/tasks/__tests__/index.test.ts
```

Expected: 7 tests PASS

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/tasks/__tests__/index.test.ts
git commit -m "test: 迁移 projects 域测试到 tasks 域

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 删除 projects domain 目录

**Files:**
- Delete: `frontend/src/domains/projects/__tests__/index.test.ts`
- Delete: `frontend/src/domains/projects/index.ts`
- Delete: `frontend/src/domains/projects/` (entire directory tree)

- [ ] **Step 1: 删除 projects 目录**

```bash
rm -rf frontend/src/domains/projects
```

- [ ] **Step 2: 确认无残留引用**

```bash
rg "from.*domains/projects" frontend/src --type ts --type tsx
```

Expected: no output

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/projects/
git commit -m "refactor: 删除 projects domain，已合并到 tasks 域

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 更新 manifest.yaml

**Files:**
- Modify: `frontend/src/domains/tasks/manifest.yaml`

- [ ] **Step 1: 更新 manifest.yaml**

补充 project 相关的事件订阅。

```yaml
# Domain Manifest - Tasks
# Defines the Tasks domain capabilities and boundaries

id: tasks-domain
name: Tasks & Projects
version: 1.1.0

# Supported intents that this domain can handle
supportedIntents:
  - CreateTask
  - UpdateTask
  - CompleteTask
  - ArchiveTask
  - ScheduleTask
  - CreateProject
  - UpdateProject
  - ArchiveProject

# Required fields for each intent (validation by Intent Engine)
requiredFields:
  CreateTask:
    - title
    - optional: [description, priority, estimatedTime, dueDate]
  UpdateTask:
    - taskId
    - optional: [title, description, priority, estimatedTime, dueDate, status]
  CompleteTask:
    - taskId
    - optional: [actualTime, completionNote]
  ScheduleTask:
    - taskId
    - startTime
    - endTime
  CreateProject:
    - name
    - optional: [description, priority, startDate, endDate, color]
  UpdateProject:
    - projectId
    - optional: [name, description, priority, startDate, endDate, color, status]

# Events this domain subscribes to (handles via onEvent)
subscribedEvents:
  - TimeBoxStarted
  - TimeBoxEnded
  - HabitCompleted
  - ProjectCreated
  - ProjectActivated
  - ProjectPaused
  - ProjectResumed
  - ProjectCompleted
  - ProjectArchived
  - TaskCreated
  - TaskActivated
  - TaskCompleted
  - TaskArchived

# Action surface templates for Action Surface Engine
actionSurfaceTemplates:
  - intent: CreateTask
    type: guide
    template: "创建新任务"
    weight: 80
  - intent: UpdateTask
    type: tile
    template: "编辑任务"
    weight: 60
  - intent: CompleteTask
    type: tile
    template: "完成任务"
    weight: 100
  - intent: CreateProject
    type: guide
    template: "创建新项目"
    weight: 70

# Outbound connectors (optional, MVP not implemented)
outboundConnectors:
  - id: feishu_bot
    trigger: TaskCompleted
    optional: true

# Inbound sources (optional, MVP not implemented)
inboundSources:
  primary: lifeware_internal
  connectors:
    - github_webhook
    - slack_bot
  fallback: manual_input
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/domains/tasks/manifest.yaml
git commit -m "docs: 更新 tasks manifest，补充 project 事件和意图

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 最终验证

- [ ] **Step 1: 运行完整测试套件**

```bash
cd frontend && npx vitest run
```

Expected: 所有测试 PASS（包括 tasks 域测试）

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 无新增类型错误

- [ ] **Step 3: 检查 git status 确认清理干净**

```bash
git status
```

Expected: working tree clean
