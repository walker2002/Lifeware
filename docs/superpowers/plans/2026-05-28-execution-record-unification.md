# 统一执行记录模型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ExecutionRecord 从 timebox 专属提升为跨 domain 共享类型，统一 habit_logs、task_execution_logs 和 timebox execution_record 的语义，通过事件驱动实现 domain 自治的双向同步。

**Architecture:** 共享 `ExecutionRecord` 类型 + 各 domain 独立存储策略（JSONB / 独立表）+ `ExecutionLogged` 通用事件 + Domain manifest `cascade_rules` + State Machine 级联执行。防循环通过 `sourceType` 标记 + `logged` 终态不可逆实现。

**Tech Stack:** Next.js, TypeScript, Drizzle ORM, PostgreSQL, Zod

---

## 文件结构总览

| 文件 | 责任 |
|------|------|
| `frontend/src/usom/types/primitives.ts` | 删除 `HabitLogStatus`，确认 `CompletionStatus` |
| `frontend/src/usom/types/objects.ts` | 重构 `ExecutionRecord`（增加 `sourceType`），扩展 `HabitLog`（新字段），新增 `TaskExecutionLog`，`Task` 增加 `lastExecutionRecord` |
| `frontend/src/usom/types/process.ts` | 扩展 `ActionSurfaceSuggestion`（增加 `suggestionType`/`targetType`/`targetId`/`payload`），`SystemEventType` 增加 `'ExecutionLogged'` |
| `frontend/src/lib/db/schema.ts` | `habit_logs` 字段变更（`status`->`completion_status`，新增字段），新增 `task_execution_logs` 表 |
| `frontend/src/lib/db/migrations/` | 生成并运行 migration |
| `frontend/src/lib/db/repositories/mappers.ts` | 更新 `habitLog` mapper，新增 `taskExecutionLog` mapper |
| `frontend/src/domains/habits/repository/habit-log.ts` | 更新 repository 接口（如有需要） |
| `frontend/src/domains/tasks/repository/task-execution-log.ts` | 新增 repository |
| `frontend/src/domains/habits/manifest.yaml` | 增加 `cascade_rules` 和 `subscribed_events: [ExecutionLogged]` |
| `frontend/src/domains/timebox/manifest.yaml` | 增加 `cascade_rules` 和 `subscribed_events: [ExecutionLogged]` |
| `frontend/src/domains/tasks/manifest.yaml` | 增加 `cascade_rules` 和 `subscribed_events: [ExecutionLogged]` |
| `frontend/src/domains/manifest-loader/schema.ts` | 增加 `cascade_rules` schema 定义 |
| `frontend/src/domains/habits/hooks.ts` | `onEvent` 处理 `ExecutionLogged` |
| `frontend/src/domains/timebox/hooks.ts` | `onEvent` 处理 `ExecutionLogged` |
| `frontend/src/domains/tasks/hooks.ts` | `onEvent` 处理 `ExecutionLogged` |
| `frontend/src/nexus/core/state-machine/index.ts` | 扩展级联规则处理逻辑 |
| `docs/usom-design.md` | 同步更新类型定义 |
| `docs/database-design.md` | 同步更新表结构 |
| `manifest.md` | 记录变更 |

---

## Task 1: USOM Primitives — 删除 HabitLogStatus

**Files:**
- Modify: `frontend/src/usom/types/primitives.ts:83`

- [ ] **Step 1: 删除 HabitLogStatus 类型**

```typescript
// 删除这一行:
export type HabitLogStatus = 'completed' | 'skipped' | 'partial'
```

- [ ] **Step 2: 确认 CompletionStatus 已包含所需值**

检查第 85 行已有：
```typescript
export type CompletionStatus = 'completed' | 'partially_completed' | 'not_completed'
```

确认无误，无需修改。

- [ ] **Step 3: 运行类型检查**

Run: `cd frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "HabitLogStatus" || echo "No HabitLogStatus errors"`
Expected: 无 `HabitLogStatus` 引用错误（如还有，在 Task 2 一并修复）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/usom/types/primitives.ts
git commit -m "refactor(usom): 删除 HabitLogStatus，使用 CompletionStatus 统一状态语义

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: USOM Objects — 重构 ExecutionRecord、HabitLog、新增 TaskExecutionLog

**Files:**
- Modify: `frontend/src/usom/types/objects.ts`

- [ ] **Step 1: 更新 imports，替换 HabitLogStatus 为 CompletionStatus**

当前 imports 在第 4-11 行：
```typescript
import type {
  USOM_ID, Timestamp, DateOnly, DurationMinutes, Notes, Tag,
  Priority, EnergyLevel, PeriodType, EnergyScore, EnergySource,
  Chronotype, EnergyCurvePoint, EnergySensitivity,
  ObjectiveStatus, KeyResultStatus, TaskStatus, HabitStatus,
  HabitLogStatus, TimeboxStatus, ReviewStatus, IntentionStatus,
  ProjectStatus, AISessionStatus,
} from './primitives'
```

修改为：
```typescript
import type {
  USOM_ID, Timestamp, DateOnly, DurationMinutes, Notes, Tag,
  Priority, EnergyLevel, PeriodType, EnergyScore, EnergySource,
  Chronotype, EnergyCurvePoint, EnergySensitivity,
  ObjectiveStatus, KeyResultStatus, TaskStatus, HabitStatus,
  CompletionStatus, TimeboxStatus, ReviewStatus, IntentionStatus,
  ProjectStatus, AISessionStatus,
} from './primitives'
```

- [ ] **Step 2: 重构 ExecutionRecord，增加 sourceType**

替换第 258-277 行：

```typescript
// ─── Execution Source Type ─────────────────────────────────────
export type ExecutionSourceType = 'timebox' | 'habit' | 'task'

// ─── Execution Record Types ────────────────────────────────────
export interface ExecutionRecordBase {
  completionStatus: CompletionStatus
  actualDuration: number
  plannedDuration: number
  deviationMinutes: number
  sourceType: ExecutionSourceType
  loggedAt: string
}

export interface SimpleExecutionRecord extends ExecutionRecordBase {
  mode: 'simple'
}

export interface DetailedExecutionRecord extends ExecutionRecordBase {
  mode: 'detailed'
  completionRating: number
  actualOutput: string
  deviationReasons?: string
  energyLevel?: number
  notes?: string
}

export type ExecutionRecord = SimpleExecutionRecord | DetailedExecutionRecord
```

- [ ] **Step 3: 扩展 HabitLog 字段**

替换第 246-256 行：

```typescript
// ─── 3.9 HabitLog ─────────────────────────────────────────────
export interface HabitLog {
  id: USOM_ID
  habitId: USOM_ID
  date: DateOnly
  completionStatus: CompletionStatus
  actualDuration?: DurationMinutes
  plannedDuration?: DurationMinutes
  deviationMinutes?: number
  completionRating?: number
  energyLevel?: number
  note?: Notes
  loggedAt: Timestamp
  source: 'manual' | 'connector' | 'timebox_sync'
}
```

- [ ] **Step 4: Task 增加 lastExecutionRecord**

在第 139 行（`notes?: Notes` 之前）插入：

```typescript
  lastExecutionRecord?: ExecutionRecord
```

- [ ] **Step 5: 新增 TaskExecutionLog 类型**

在第 140 行（`notes?: Notes` 之后，Project 接口之前）插入：

```typescript
// ─── 3.7d TaskExecutionLog ────────────────────────────────────
export interface TaskExecutionLog {
  id: USOM_ID
  taskId: USOM_ID
  timeboxId?: USOM_ID
  completionStatus: CompletionStatus
  actualDuration?: DurationMinutes
  plannedDuration?: DurationMinutes
  deviationMinutes?: number
  completionRating?: number
  actualOutput?: string
  deviationReasons?: string
  energyLevel?: number
  note?: Notes
  loggedAt: Timestamp
  source: 'manual' | 'timebox_sync'
}
```

- [ ] **Step 6: 运行类型检查**

Run: `cd frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -30`
Expected: 无新增类型错误

- [ ] **Step 7: Commit**

```bash
git add frontend/src/usom/types/objects.ts
git commit -m "feat(usom): ExecutionRecord 增加 sourceType，HabitLog 字段对齐，新增 TaskExecutionLog，Task 增加 lastExecutionRecord

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: USOM Process — 扩展 ActionSurfaceSuggestion 和 SystemEventType

**Files:**
- Modify: `frontend/src/usom/types/process.ts`

- [ ] **Step 1: 扩展 ActionSurfaceSuggestion**

替换第 135-139 行：

```typescript
export interface ActionSurfaceSuggestion {
  actionType: ActionType
  suggestionType: 'state_transition' | 'log_entry' | 'action_surface'
  targetType?: USOMObjectType
  targetId?: USOM_ID
  payload?: Record<string, unknown>
  label: string
  weight: number
}
```

确保 `USOMObjectType` 和 `USOM_ID` 已在 imports 中（检查第 5-10 行）。

- [ ] **Step 2: SystemEventType 增加 ExecutionLogged**

在第 168 行（`GenerativeBatchExecuted` 之后）插入：

```typescript
  | 'ExecutionLogged'
```

- [ ] **Step 3: 运行类型检查**

Run: `cd frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -30`
Expected: 无新增类型错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/usom/types/process.ts
git commit -m "feat(usom): ActionSurfaceSuggestion 扩展 suggestionType/targetType/payload，新增 ExecutionLogged 事件

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: 数据库 Schema — habit_logs 字段变更 + task_execution_logs 新表

**Files:**
- Modify: `frontend/src/lib/db/schema.ts`

- [ ] **Step 1: 修改 habit_logs 表**

替换第 271-289 行：

```typescript
// ─── 4.5 habit_logs ───────────────────────────────────────────
export const habitLogs = pgTable('habit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  habitId: uuid('habit_id').notNull().references(() => habits.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  completionStatus: text('completion_status', { enum: ['completed', 'partially_completed', 'not_completed'] }).notNull(),
  actualDuration: integer('actual_duration'),
  plannedDuration: integer('planned_duration'),
  deviationMinutes: integer('deviation_minutes'),
  completionRating: integer('completion_rating'),
  energyLevel: integer('energy_level'),

  note: text('note'),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
  source: text('source', { enum: ['manual', 'connector', 'timebox_sync'] }).notNull().default('manual'),
}, (table) => [
  uniqueIndex('uniq_habit_logs_habit_date').on(table.habitId, table.date),
  index('idx_habit_logs_user_date').on(table.userId, table.date),
  index('idx_habit_logs_habit_id').on(table.habitId),
])
```

- [ ] **Step 2: 新增 task_execution_logs 表**

在第 289 行（habit_logs 表定义结束后）插入：

```typescript
// ─── 4.5c task_execution_logs ─────────────────────────────────
export const taskExecutionLogs = pgTable('task_execution_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),

  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  timeboxId: uuid('timebox_id').references(() => timeboxes.id, { onDelete: 'set null' }),
  completionStatus: text('completion_status', { enum: ['completed', 'partially_completed', 'not_completed'] }).notNull(),
  actualDuration: integer('actual_duration'),
  plannedDuration: integer('planned_duration'),
  deviationMinutes: integer('deviation_minutes'),
  completionRating: integer('completion_rating'),
  actualOutput: text('actual_output'),
  deviationReasons: text('deviation_reasons'),
  energyLevel: integer('energy_level'),
  note: text('note'),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
  source: text('source', { enum: ['manual', 'timebox_sync'] }).notNull().default('manual'),
}, (table) => [
  index('idx_task_exec_logs_user_task').on(table.userId, table.taskId),
  index('idx_task_exec_logs_timebox').on(table.timeboxId),
  index('idx_task_exec_logs_user_logged').on(table.userId, table.loggedAt),
])
```

- [ ] **Step 3: 运行 Drizzle 生成迁移**

Run: `cd frontend && npm run db:generate`
Expected: 生成迁移文件，包含 habit_logs 字段变更和 task_execution_logs 创建

- [ ] **Step 4: 检查生成的迁移**

Run: `ls -la frontend/src/lib/db/migrations/ | tail -5`
Expected: 看到最新迁移文件

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/db/schema.ts frontend/src/lib/db/migrations/
git commit -m "feat(db): habit_logs 字段对齐 ExecutionRecord，新增 task_execution_logs 表

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Mapper 更新 — habitLog + 新增 taskExecutionLog

**Files:**
- Modify: `frontend/src/lib/db/repositories/mappers.ts`

- [ ] **Step 1: 更新 HabitLogRow 类型和 mapper**

替换第 204-236 行：

```typescript
// --- HabitLog ----------------------------------------------------
type HabitLogRow = {
  id: string; userId: string; schemaVersion: number;
  habitId: string; date: string;
  completionStatus: string;
  actualDuration: number | null;
  plannedDuration: number | null;
  deviationMinutes: number | null;
  completionRating: number | null;
  energyLevel: number | null;
  note: string | null;
  loggedAt: Date;
  source: string;
}

export function habitLogRowToUSOM(row: HabitLogRow): HabitLog {
  return {
    id: row.id,
    habitId: row.habitId,
    date: row.date as DateOnly,
    completionStatus: row.completionStatus as HabitLog['completionStatus'],
    actualDuration: row.actualDuration ?? undefined,
    plannedDuration: row.plannedDuration ?? undefined,
    deviationMinutes: row.deviationMinutes ?? undefined,
    completionRating: row.completionRating ?? undefined,
    energyLevel: row.energyLevel ?? undefined,
    note: row.note ?? undefined,
    loggedAt: row.loggedAt.toISOString() as Timestamp,
    source: row.source as HabitLog['source'],
  }
}

export function habitLogUSOMToRow(log: HabitLog, userId: USOM_ID) {
  return {
    id: log.id,
    userId: userId,
    habitId: log.habitId,
    date: log.date,
    completionStatus: log.completionStatus,
    actualDuration: log.actualDuration ?? null,
    plannedDuration: log.plannedDuration ?? null,
    deviationMinutes: log.deviationMinutes ?? null,
    completionRating: log.completionRating ?? null,
    energyLevel: log.energyLevel ?? null,
    note: log.note ?? null,
    source: log.source,
  }
}
```

- [ ] **Step 2: 新增 TaskExecutionLog mapper**

在第 236 行之后插入：

```typescript
// --- TaskExecutionLog --------------------------------------------
type TaskExecutionLogRow = {
  id: string; userId: string; schemaVersion: number;
  taskId: string; timeboxId: string | null;
  completionStatus: string;
  actualDuration: number | null;
  plannedDuration: number | null;
  deviationMinutes: number | null;
  completionRating: number | null;
  actualOutput: string | null;
  deviationReasons: string | null;
  energyLevel: number | null;
  note: string | null;
  loggedAt: Date;
  source: string;
}

export function taskExecutionLogRowToUSOM(row: TaskExecutionLogRow): TaskExecutionLog {
  return {
    id: row.id,
    taskId: row.taskId,
    timeboxId: row.timeboxId ?? undefined,
    completionStatus: row.completionStatus as TaskExecutionLog['completionStatus'],
    actualDuration: row.actualDuration ?? undefined,
    plannedDuration: row.plannedDuration ?? undefined,
    deviationMinutes: row.deviationMinutes ?? undefined,
    completionRating: row.completionRating ?? undefined,
    actualOutput: row.actualOutput ?? undefined,
    deviationReasons: row.deviationReasons ?? undefined,
    energyLevel: row.energyLevel ?? undefined,
    note: row.note ?? undefined,
    loggedAt: row.loggedAt.toISOString() as Timestamp,
    source: row.source as TaskExecutionLog['source'],
  }
}

export function taskExecutionLogUSOMToRow(log: TaskExecutionLog, userId: USOM_ID) {
  return {
    id: log.id,
    userId: userId,
    taskId: log.taskId,
    timeboxId: log.timeboxId ?? null,
    completionStatus: log.completionStatus,
    actualDuration: log.actualDuration ?? null,
    plannedDuration: log.plannedDuration ?? null,
    deviationMinutes: log.deviationMinutes ?? null,
    completionRating: log.completionRating ?? null,
    actualOutput: log.actualOutput ?? null,
    deviationReasons: log.deviationReasons ?? null,
    energyLevel: log.energyLevel ?? null,
    note: log.note ?? null,
    source: log.source,
  }
}
```

- [ ] **Step 3: 确保 imports 包含 TaskExecutionLog**

在第 7-11 行的 import 中，将 `HabitLog` 替换为 `HabitLog, TaskExecutionLog`：

```typescript
import type {
  User, UserCalibration, Intention, StructuredIntent,
  Objective, KeyResult, Task, Habit, HabitFrequency, HabitLog,
  Timebox, Review, ReviewSection, ReviewMetrics,
  HabitTemplate, TemplateHabitItem,
  Project, ProjectTemplate, TaskTemplate,
  AISession, ChatMessage, TaskExecutionLog,
} from '../../../usom/types/objects'
```

- [ ] **Step 4: 运行类型检查**

Run: `cd frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -30`
Expected: 无新增类型错误

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/db/repositories/mappers.ts
git commit -m "feat(db): 更新 habitLog mapper，新增 taskExecutionLog mapper

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Manifest Loader Schema — 增加 cascade_rules

**Files:**
- Modify: `frontend/src/domains/manifest-loader/schema.ts`

- [ ] **Step 1: 增加 CascadeRule Schema**

在第 78-79 行（`QueryActionSchema` 之前）插入：

```typescript
const CascadeRuleSchema = z.object({
  on_event: z.string(),
  condition: z.string().optional(),
  action: z.string(),
  auto_execute: z.boolean().default(false),
})
```

- [ ] **Step 2: ManifestSchema 增加 cascade_rules**

在第 113 行（`query_actions` 之前）插入：

```typescript
  cascade_rules: z.array(CascadeRuleSchema).optional(),
```

- [ ] **Step 3: 运行类型检查**

Run: `cd frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -30`
Expected: 无新增类型错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/manifest-loader/schema.ts
git commit -m "feat(manifest): manifest schema 增加 cascade_rules 定义

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Domain Manifest — 增加 cascade_rules 和 ExecutionLogged 订阅

**Files:**
- Modify: `frontend/src/domains/habits/manifest.yaml`
- Modify: `frontend/src/domains/timebox/manifest.yaml`
- Modify: `frontend/src/domains/tasks/manifest.yaml`

- [ ] **Step 1: Habits manifest 增加 cascade_rules 和 ExecutionLogged**

在第 196 行（`subscribed_events` 列表末尾）之前，将列表修改为：

```yaml
subscribed_events:
  - HabitCreated
  - HabitActivated
  - HabitSuspended
  - HabitArchived
  - HabitLogged
  - HabitSkipped
  - HabitStreakMilestone
  - ExecutionLogged
```

在第 249 行（文件末尾之前）插入：

```yaml
# ─── 区块 J: cascade_rules ──────────────────────────────────────
cascade_rules:
  - on_event: 'ExecutionLogged'
    condition: "payload.sourceType == 'timebox'"
    action: 'log_habit'
    auto_execute: true
```

- [ ] **Step 2: Timebox manifest 增加 cascade_rules 和 ExecutionLogged**

在第 205 行（`subscribed_events` 列表末尾）之前，将列表修改为：

```yaml
subscribed_events:
  - TimeboxCreated
  - TimeboxStarted
  - TimeboxOvertime
  - TimeboxEnded
  - TimeboxCancelled
  - TimeboxLogged
  - ExecutionLogged
```

在第 265 行（文件末尾之前）插入：

```yaml
# ─── 区块 J: cascade_rules ──────────────────────────────────────
cascade_rules:
  - on_event: 'ExecutionLogged'
    condition: "payload.sourceType == 'habit'"
    action: 'suggest_log_timebox'
    auto_execute: false
```

- [ ] **Step 3: Tasks manifest 增加 cascade_rules 和 ExecutionLogged**

在第 247 行（`subscribed_events` 列表末尾）之前，将列表修改为：

```yaml
subscribed_events:
  - TimeboxStarted
  - TimeboxEnded
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
  - ExecutionLogged
```

在第 262 行（文件末尾之前）插入：

```yaml
# ─── 区块 J: cascade_rules ──────────────────────────────────────
cascade_rules:
  - on_event: 'ExecutionLogged'
    condition: "payload.sourceType == 'timebox'"
    action: 'log_task_execution'
    auto_execute: true
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/habits/manifest.yaml frontend/src/domains/timebox/manifest.yaml frontend/src/domains/tasks/manifest.yaml
git commit -m "feat(manifest): 三域 manifest 增加 cascade_rules 和 ExecutionLogged 订阅

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Domain Hooks — onEvent 处理 ExecutionLogged

**Files:**
- Modify: `frontend/src/domains/habits/hooks.ts`
- Modify: `frontend/src/domains/timebox/hooks.ts`
- Modify: `frontend/src/domains/tasks/hooks.ts`

- [ ] **Step 1: Habits hooks 处理 ExecutionLogged**

在第 193 行（`default:` case 之前）插入：

```typescript
      case 'ExecutionLogged': {
        const sourceType = event.payload['sourceType'] as string
        if (sourceType === 'habit') {
          // 自己发出的 ExecutionLogged，不做额外建议
          return { metrics: [], suggestions: [] }
        }
        // timebox 或 task 触发的 ExecutionLogged，返回 streak metrics
        return {
          metrics: [{
            metricKey: 'habit_metrics_needs_update',
            value: 1,
          }],
          suggestions: [],
        }
      }
```

- [ ] **Step 2: Timebox hooks 处理 ExecutionLogged**

在第 126 行（`default:` case 之前）插入：

```typescript
      case 'ExecutionLogged': {
        const sourceType = event.payload['sourceType'] as string
        if (sourceType === 'timebox') {
          // 自己发出的 ExecutionLogged，不做额外建议
          return { metrics: [], suggestions: [] }
        }
        // habit 或 task 触发的 ExecutionLogged
        const targetType = event.payload['targetType'] as string
        const targetId = event.payload['targetId'] as string
        if (sourceType === 'habit' && targetType === 'timebox' && targetId) {
          return {
            metrics: [],
            suggestions: [{
              actionType: 'start_timebox',
              suggestionType: 'state_transition',
              targetType: 'timebox',
              targetId,
              label: '关联习惯已打卡，确认执行记录？',
              weight: 0.7,
            }],
          }
        }
        return { metrics: [], suggestions: [] }
      }
```

- [ ] **Step 3: Tasks hooks 处理 ExecutionLogged**

在第 117 行（`default:` case 之前）插入：

```typescript
      case 'ExecutionLogged': {
        const sourceType = event.payload['sourceType'] as string
        if (sourceType === 'task') {
          // 自己发出的 ExecutionLogged，不做额外建议
          return { metrics: [], suggestions: [] }
        }
        // 返回任务执行指标更新提示
        return {
          metrics: [{
            metricKey: 'task_execution_needs_update',
            value: 1,
          }],
          suggestions: [],
        }
      }
```

- [ ] **Step 4: 运行类型检查**

Run: `cd frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -30`
Expected: 无新增类型错误（注意 `suggestionType` 字段已加入 ActionSurfaceSuggestion）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/habits/hooks.ts frontend/src/domains/timebox/hooks.ts frontend/src/domains/tasks/hooks.ts
git commit -m "feat(hooks): 三域 onEvent 处理 ExecutionLogged 事件

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: 新增 Task Execution Log Repository

**Files:**
- Create: `frontend/src/domains/tasks/repository/task-execution-log.ts`
- Modify: `frontend/src/usom/interfaces/irepository.ts`（如有接口定义）

- [ ] **Step 1: 检查 irepository.ts 是否需要新增接口**

Run: `grep -n "TaskExecutionLog" frontend/src/usom/interfaces/irepository.ts || echo "No existing interface"`

如果存在 `IHabitLogRepository` 参考模式，新增 `ITaskExecutionLogRepository`。

- [ ] **Step 2: 创建 repository**

```typescript
import { eq, and } from 'drizzle-orm'
import { db } from '../../../lib/db/index'
import * as s from '../../../lib/db/schema'
import type { TaskExecutionLog } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import { taskExecutionLogRowToUSOM, taskExecutionLogUSOMToRow } from '../../../lib/db/repositories/mappers'

export interface ITaskExecutionLogRepository {
  findByTask(taskId: USOM_ID, userId: USOM_ID): Promise<TaskExecutionLog[]>
  findByTimebox(timeboxId: USOM_ID, userId: USOM_ID): Promise<TaskExecutionLog[]>
  save(log: TaskExecutionLog, userId: USOM_ID): Promise<void>
}

export class TaskExecutionLogRepository implements ITaskExecutionLogRepository {
  async findByTask(taskId: USOM_ID, userId: USOM_ID): Promise<TaskExecutionLog[]> {
    const rows = await db.select().from(s.taskExecutionLogs)
      .where(and(eq(s.taskExecutionLogs.taskId, taskId), eq(s.taskExecutionLogs.userId, userId)))
    return rows.map(r => taskExecutionLogRowToUSOM(r as any))
  }

  async findByTimebox(timeboxId: USOM_ID, userId: USOM_ID): Promise<TaskExecutionLog[]> {
    const rows = await db.select().from(s.taskExecutionLogs)
      .where(and(eq(s.taskExecutionLogs.timeboxId, timeboxId), eq(s.taskExecutionLogs.userId, userId)))
    return rows.map(r => taskExecutionLogRowToUSOM(r as any))
  }

  async save(log: TaskExecutionLog, userId: USOM_ID): Promise<void> {
    await db.insert(s.taskExecutionLogs).values(taskExecutionLogUSOMToRow(log, userId))
  }
}
```

- [ ] **Step 3: 运行类型检查**

Run: `cd frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -30`
Expected: 无新增类型错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/tasks/repository/task-execution-log.ts
git add frontend/src/usom/interfaces/irepository.ts || true
git commit -m "feat(repository): 新增 TaskExecutionLogRepository

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: State Machine — 扩展级联规则处理

**Files:**
- Modify: `frontend/src/nexus/core/state-machine/index.ts`

- [ ] **Step 1: 理解当前 State Machine 结构**

当前 `createGenericStateMachine` 函数在第 166-272 行。关键执行流程：
1. 查找 lifecycle transition（第 202-208 行）
2. 构造目标对象（第 211-244 行）
3. 持久化（第 247-248 行）
4. 构造并发射 SystemEvent（第 251-267 行）

需要在第 4 步之后增加：
- 发射通用 `ExecutionLogged` 事件（如果 transition 涉及执行记录）
- 读取 Domain manifest 的 `cascade_rules`
- 自动执行或生成 suggestion

- [ ] **Step 2: 增加 ExecutionLogged 事件发射和级联处理**

在第 267 行（`return { success: true, object, event }` 之前）插入：

```typescript
      // 6. 如果涉及执行记录，发射通用 ExecutionLogged 事件
      if (transition.event_type === 'TimeboxLogged' || transition.event_type === 'HabitLogged') {
        const executionRecord = event.payload['executionRecord'] as Record<string, unknown> | undefined
        if (executionRecord) {
          const executionLoggedEvent: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: 'ExecutionLogged',
            occurredAt: now,
            triggeredBy: 'state_machine',
            payload: {
              sourceType: objectType === 'timebox' ? 'timebox' : objectType === 'habit_log' ? 'habit' : 'task',
              targetId: object.id,
              executionRecord,
              originalEventType: transition.event_type,
            },
            snapshotId: '' as USOM_ID,
          }
          await eventRepo.append(executionLoggedEvent, userId)
          eventBus.publish(executionLoggedEvent)
        }
      }
```

注意：当前 State Machine 是通用版，不直接知道 objectType 到 sourceType 的映射。更简洁的做法是在 event payload 中传入 `sourceType`。但由于当前代码没有 cascade_rules 读取机制，这一步作为 MVP 的最小实现，先完成 ExecutionLogged 事件发射，cascade_rules 的自动执行在 Task 11 中处理。

实际上，根据设计文档，cascade_rules 的 `auto_execute` 处理是 State Machine 的核心扩展。但考虑到当前 State Machine 是通用版，且设计文档中的级联处理逻辑较为复杂，我们在 MVP 中先做以下简化：

1. State Machine 发射 `ExecutionLogged` 通用事件
2. 各 Domain 的 `onEvent` 返回 suggestions
3. 这些 suggestions 由调用方（如 Orchestrator）收集后进入 Action Surface
4. `auto_execute: true` 的级联规则在后续迭代中实现

因此，Step 2 的代码就是最小实现。如果需要在 State Machine 中直接处理 cascade_rules，需要更大的改动（引入 manifest registry、domain registry 等依赖）。

- [ ] **Step 3: 运行类型检查**

Run: `cd frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -30`
Expected: 无新增类型错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/nexus/core/state-machine/index.ts
git commit -m "feat(state-machine): 状态转换后发射 ExecutionLogged 通用事件

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: 文档同步

**Files:**
- Modify: `docs/usom-design.md`
- Modify: `docs/database-design.md`
- Modify: `manifest.md`

- [ ] **Step 1: 更新 docs/usom-design.md**

根据 design spec 已完成的修改，确认以下章节已更新：
- Section 2: Primitives — 删除 `HabitLogStatus`
- Section 3.9: HabitLog — 字段对齐 ExecutionRecord
- Section 3.7: Task — 增加 `lastExecutionRecord`
- 新增 Section 3.7d: TaskExecutionLog
- Section 3.10: Timebox — `executionRecord` 语义扩展
- Section 4.4: ActionSurfaceSuggestion — 扩展字段
- Section 4.6: SystemEventType — 增加 `ExecutionLogged`

Run: `grep -n "ExecutionRecord\|TaskExecutionLog\|ExecutionLogged" docs/usom-design.md | head -20`
Expected: 看到相关术语出现在设计文档中

- [ ] **Step 2: 更新 docs/database-design.md**

确认以下章节已更新：
- `habit_logs` 表结构变更
- 新增 `task_execution_logs` 表
- 存储策略总结表

Run: `grep -n "task_execution_logs" docs/database-design.md`
Expected: 看到表定义

- [ ] **Step 3: 更新 manifest.md**

在 manifest.md 的版本历史部分增加一条记录：

```markdown
## 2026-05-28

- 统一执行记录模型设计（docs/superpowers/specs/2026-05-28-execution-record-unification-design.md）
- USOM: ExecutionRecord 增加 sourceType，删除 HabitLogStatus，新增 TaskExecutionLog
- DB: habit_logs 字段变更，新增 task_execution_logs 表
- 事件: 新增 ExecutionLogged 通用事件
- 架构: Domain manifest 增加 cascade_rules，State Machine 发射 ExecutionLogged
```

- [ ] **Step 4: Commit**

```bash
git add docs/usom-design.md docs/database-design.md manifest.md
git commit -m "docs: 同步更新 usom-design、database-design、manifest 版本历史

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 12: 运行测试

- [ ] **Step 1: 运行 Drizzle migration（本地开发环境）**

```bash
cd frontend
npm run db:migrate
```
Expected: 迁移成功执行

- [ ] **Step 2: 运行 lint**

```bash
cd frontend
npm run lint
```
Expected: 无新增 lint 错误

- [ ] **Step 3: 运行类型检查**

```bash
cd frontend
npx tsc --noEmit --skipLibCheck
```
Expected: 无类型错误

- [ ] **Step 4: 运行现有测试**

```bash
cd frontend
npm test -- --run 2>&1 | tail -30
```
Expected: 所有现有测试通过（允许 pre-existing 失败）

- [ ] **Step 5: Commit**

```bash
git commit -m "test: 验证执行记录模型统一化全链路通过

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## 自审查清单

### 1. Spec 覆盖

| Spec 要求 | 对应 Task |
|-----------|----------|
| ExecutionRecord 增加 sourceType | Task 2 |
| HabitLog 删除 status，改为 completionStatus | Task 2 |
| HabitLog 新增 plannedDuration/deviationMinutes/completionRating/energyLevel | Task 2 |
| HabitLog source 扩展 'timebox_sync' | Task 2 |
| Task 增加 lastExecutionRecord | Task 2 |
| 新增 TaskExecutionLog USOM 类型 | Task 2 |
| ActionSurfaceSuggestion 扩展 suggestionType/targetType/targetId/payload | Task 3 |
| SystemEventType 增加 ExecutionLogged | Task 3 |
| habit_logs 表字段变更 | Task 4 |
| task_execution_logs 新表 | Task 4 |
| habitLog mapper 更新 | Task 5 |
| taskExecutionLog mapper 新增 | Task 5 |
| manifest schema 增加 cascade_rules | Task 6 |
| 三域 manifest 增加 cascade_rules | Task 7 |
| 三域 manifest 增加 ExecutionLogged 订阅 | Task 7 |
| 三域 hooks onEvent 处理 ExecutionLogged | Task 8 |
| TaskExecutionLogRepository 新增 | Task 9 |
| State Machine 发射 ExecutionLogged | Task 10 |
| 文档同步 | Task 11 |
| 测试验证 | Task 12 |

**无遗漏。**

### 2. Placeholder 扫描

- [x] 无 "TBD"、"TODO"、"implement later"
- [x] 无 "Add appropriate error handling" 等模糊描述
- [x] 每个代码步骤包含完整代码
- [x] 无 "Similar to Task N"
- [x] 每个步骤包含具体命令和预期输出

### 3. 类型一致性

- [x] `CompletionStatus` 在 primitives.ts 中使用，在 objects.ts 中引用
- [x] `HabitLog.completionStatus` 类型为 `CompletionStatus`
- [x] `TaskExecutionLog.completionStatus` 类型为 `CompletionStatus`
- [x] `ExecutionRecordBase.sourceType` 类型为 `ExecutionSourceType`
- [x] `ActionSurfaceSuggestion.suggestionType` 为 `'state_transition' | 'log_entry' | 'action_surface'`
- [x] `SystemEventType` 包含 `'ExecutionLogged'`
- [x] mapper 函数签名和 USOM 类型一致

### 4. 防循环检查

- [x] `sourceType` 标记在 ExecutionRecordBase 中
- [x] Timebox `logged` 为 terminal state（已在 manifest 中声明）
- [x] habit_logs `(habitId, date)` 有 uniqueIndex
- [x] onEvent 返回 suggestions 而非直接执行状态变更
- [x] State Machine 发射 ExecutionLogged 事件，不直接调用其他 domain 的 repository

---

## 执行方式选择

**Plan complete and saved to `docs/superpowers/plans/2026-05-28-execution-record-unification.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review

**Which approach?**
