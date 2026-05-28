# 统一执行记录模型设计

## 背景与问题

当前系统存在两套独立的执行记录机制：

| 实体 | 执行记录方式 | 问题 |
|------|------------|------|
| Timebox | `ExecutionRecord` JSONB 嵌入 `timeboxes` 表 | 时间盒执行后，内部关联的 task/habit 无法单独追踪 |
| Habit | `HabitLog` 独立表 `habit_logs` | 与 timebox 执行记录语义不一致，无法双向同步 |
| Task | 无独立执行记录，仅 `actualDuration` + `completedAt` | 缺失执行历史，跨 timebox 分段执行无法记录 |

在 Domain 独立的原则下，当一个时间盒被执行确认时，不应由 timebox domain 直接操作 habit/task 的数据。但 timebox 和 habit 在日常场景中是一一对应的，存在双向同步的合理业务需求。

## 设计目标

1. **统一语义**：`ExecutionRecord` 从 timebox 专属提升为跨 domain 共享类型
2. **Domain 自治**：各 domain 根据自身数据特征选择存储策略（JSONB / 独立表）
3. **事件驱动同步**：通过 `onEvent` 钩子 + State Machine 的 suggestion 机制实现跨 domain 协作
4. **防循环**：利用 State Machine 的 lifecycle 不可逆约束 + source 标记防止无限循环

---

## USOM 类型变更

### 1. ExecutionRecord（共享类型）

位置：`frontend/src/usom/types/objects.ts`（位置不变，语义扩展）

```typescript
// 执行记录来源类型
export type ExecutionSourceType = 'timebox' | 'habit' | 'task'

// 基础字段（共享）
export interface ExecutionRecordBase {
  completionStatus: 'completed' | 'partially_completed' | 'not_completed'
  actualDuration: number          // 分钟
  plannedDuration: number          // 分钟
  deviationMinutes: number         // 实际 - 计划
  sourceType: ExecutionSourceType  // 来源 Domain 标识
  loggedAt: string                 // ISO 时间戳
}

// 简单模式
export interface SimpleExecutionRecord extends ExecutionRecordBase {
  mode: 'simple'
}

// 详细模式 — 增加评分、产出、原因等
export interface DetailedExecutionRecord extends ExecutionRecordBase {
  mode: 'detailed'
  completionRating: number         // 1-5
  actualOutput: string             // 实际产出描述
  deviationReasons?: string        // 偏差原因
  energyLevel?: number             // 1-10
  notes?: string
}

export type ExecutionRecord = SimpleExecutionRecord | DetailedExecutionRecord
```

### 2. HabitLog（字段对齐 ExecutionRecord）

```typescript
export interface HabitLog {
  id: USOM_ID
  habitId: USOM_ID
  date: DateOnly
  // 复用 ExecutionRecord 的 completionStatus
  completionStatus: 'completed' | 'partially_completed' | 'not_completed'
  actualDuration?: DurationMinutes
  plannedDuration?: DurationMinutes    // 新增（从 Habit.defaultDuration 取）
  deviationMinutes?: number            // 新增
  // 详细模式字段（可选展开）
  completionRating?: number            // 新增
  energyLevel?: number                 // 新增
  note?: Notes                         // 保留
  loggedAt: Timestamp
  source: 'manual' | 'connector' | 'timebox_sync'  // 新增 'timebox_sync'
}
```

**删除** `HabitLogStatus` 类型，其值映射：
- `'completed'` → `'completed'`
- `'skipped'` → `'not_completed'`
- `'partial'` → `'partially_completed'`

### 3. Task（新增执行记录字段）

```typescript
export interface Task {
  // ... 现有字段不变 ...
  actualDuration?: DurationMinutes      // 已有，累计执行时间
  completedAt?: Timestamp              // 已有
  lastExecutionRecord?: ExecutionRecord // 新增：最近一次执行记录
}
```

Task 的多次执行历史通过独立表 `task_execution_logs` 存储（见数据库变更）。`actualDuration` 可以聚合 `task_execution_logs` 计算得出。

---

## 数据库 Schema 变更

### 1. `habit_logs` 表

```sql
-- 重命名 status → completion_status
ALTER TABLE habit_logs RENAME COLUMN status TO completion_status;
-- 值域变化：'completed' | 'skipped' | 'partial' → 'completed' | 'partially_completed' | 'not_completed'
-- 数据迁移：'skipped' → 'not_completed', 'partial' → 'partially_completed'

-- 新增字段
ALTER TABLE habit_logs
  ADD COLUMN planned_duration INTEGER,
  ADD COLUMN deviation_minutes INTEGER,
  ADD COLUMN completion_rating INTEGER,
  ADD COLUMN energy_level INTEGER;

-- source 枚举扩展
-- 'manual' | 'connector' → 'manual' | 'connector' | 'timebox_sync'
-- Drizzle schema 中 enum 改为：
-- source: text('source', { enum: ['manual', 'connector', 'timebox_sync'] })
```

### 2. `timeboxes` 表

无变更。`execution_record` JSONB 保持现状。

### 3. `task_execution_logs` 新表

```sql
CREATE TABLE task_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  schema_version INTEGER NOT NULL DEFAULT 1,

  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  timebox_id UUID REFERENCES timeboxes(id) ON DELETE SET NULL,
  completion_status TEXT NOT NULL,
  actual_duration INTEGER,
  planned_duration INTEGER,
  deviation_minutes INTEGER,
  completion_rating INTEGER,
  actual_output TEXT,
  deviation_reasons TEXT,
  energy_level INTEGER,
  note TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'manual',

  -- 索引
  INDEX idx_task_exec_logs_user_task (user_id, task_id),
  INDEX idx_task_exec_logs_timebox (timebox_id),
  INDEX idx_task_exec_logs_user_logged (user_id, logged_at)
);
```

### 存储策略总结

| Domain | 存储形式 | 关系 | 理由 |
|--------|---------|------|------|
| Timebox | `execution_record` JSONB | 1:1 | timebox 只会被 logged 一次（不可逆） |
| Habit | `habit_logs` 表 | 1:N | 每天打卡一条，需按日期索引 |
| Task | `task_execution_logs` 表 | 1:N | 一个任务可跨多个 timebox 分段执行 |

---

## 事件驱动同步流程

### 场景 A：时间盒确认 → 习惯自动打卡

```
用户执行 "确认时间盒执行"
  ↓
State Machine: timebox status → 'logged', 写入 execution_record (JSONB)
  ├─ 读取 Domain manifest `cascade_rules` 声明
  ├─ 检查是否有 `on_event: TimeboxLogged` 的级联规则
  ├─ Habits Domain manifest 声明：
  │   cascade_rules:
  │     - on_event: TimeboxLogged
  │       action: log_habit
  │       auto_execute: true
  ├─ State Machine 自动执行级联：
  │   ├─ 遍历 payload.habitIds，检查当天是否已有 habit_log → 已有则跳过
  │   └─ 调用 HabitLogRepository.save(logEntry)
  └─ 发射 SystemEvent { type: 'ExecutionLogged', payload: { sourceType: 'timebox', ... } }
  ↓
Habits Domain.onEvent (ExecutionLogged)
  ├─ 只返回 metrics 和 suggestions（不触发状态变更）
  └─ 返回 { metrics: [streak+1], suggestions: [] }
  ↓
Memory Framework 接收 ExecutionLogged 事件
  └─ 更新 DerivedSignals（streak、completionRate 等）
```

### 场景 B：习惯独立打卡 → 时间盒建议结束/确认

```
用户在习惯 Domain 执行打卡（manual）
  ↓
State Machine → 写入 habit_logs (source: 'manual')
  ↓ 发射 SystemEvent { type: 'ExecutionLogged', payload: { sourceType: 'habit', ... } }
  ↓
Timebox Domain.onEvent (ExecutionLogged)
  ├─ sourceType === 'habit' → 检查今日是否有包含该 habit 的 timebox
  ├─ 无 → 返回 { suggestions: [] }
  ├─ 有且 timebox status 为 'running'/'overtime'
  │  └─ 检查同一 timebox 内所有 habit 是否都已完成
  │     └─ 是 → 返回 { suggestions: [
  │           { suggestionType: 'state_transition', actionType: 'end_timebox',
  │             targetType: 'timebox', targetId: <timeboxId>,
  │             label: '所有习惯已完成，结束时间盒？', weight: 0.8 }
  │         ]}
  │     └─ 否 → 返回 { suggestions: [
  │           { suggestionType: 'action_surface', actionType: 'check_timebox_status',
  │             label: '习惯已打卡，时间盒还在进行中', weight: 0.5 }
  │         ]}
  └─ 有且 status 为 'ended'
     └─ 返回 { suggestions: [
           { suggestionType: 'state_transition', actionType: 'log_timebox',
             targetType: 'timebox', targetId: <timeboxId>,
             label: '关联习惯已打卡，确认执行记录？', weight: 0.7 }
         ]}
```

### 防循环机制

| 时刻 | 防护 |
|------|------|
| Timebox → ExecutionLogged (sourceType='timebox') | State Machine 读取 `cascade_rules`，检查当天是否已有 habit_log → 已有则跳过 |
| Habit manual 打卡 → ExecutionLogged (sourceType='habit') | Timebox Domain.onEvent 检查 sourceType，不生成 log_timebox suggestion |
| ExecutionLogged 重复发射 | State Machine 验证级联规则的去重条件（如 `(habitId, date)` 唯一约束） |
| 级联规则的 auto_execute | manifest 中 `auto_execute: false` 时， suggestion 进入 Action Surface，用户确认后走完整链路 |

---

## State Machine 扩展

### 1. 级联规则（Cascade Rules）

级联行为不是"用户意图"，而是"业务规则"声明。类似于数据库的 `ON DELETE CASCADE`，级联规则声明在 Domain manifest 中：

```yaml
# domains/habits/manifest.yaml
cascade_rules:
  - on_event: 'ExecutionLogged'
    condition: "payload.sourceType == 'timebox'"
    action: 'log_habit'
    auto_execute: true   # State Machine 直接执行，无需用户确认
```

State Machine 在执行原始 StateProposal 后：
1. 读取所有 Domain manifest 的 `cascade_rules`
2. 匹配当前事件类型和条件
3. `auto_execute: true` → 直接执行级联操作
4. `auto_execute: false` → 生成 suggestion 进入 Action Surface

### 2. Suggestion 类型

`onEvent` 返回的 suggestions 需要区分三类动作：

| 类型 | 动作 | 处理路径 |
|------|------|---------|
| `state_transition` | `log_timebox`, `end_timebox` | State Machine 查 manifest.lifecycle 验证 → 执行状态转换 |
| `log_entry` | `log_habit`, `log_task_execution` | State Machine 直接调用 domain repository 写入（不查 lifecycle） |
| `action_surface` | `check_timebox_status` | 进入 Action Surface Engine，由用户决定是否执行 |

### 3. ActionSurfaceSuggestion 类型扩展

```typescript
export interface ActionSurfaceSuggestion {
  actionType: ActionType
  suggestionType: 'state_transition' | 'log_entry' | 'action_surface'  // 新增
  targetType: USOMObjectType
  targetId?: USOM_ID
  payload?: Record<string, unknown>
  label: string
  weight: number
}
```

### 4. onEvent 边界约束

根据宪章 VI，`onEvent` 的职责边界：

- **✅ 可以返回**：metrics（指标更新）、suggestions（行动建议）
- **❌ 禁止执行**：状态变更、写入数据库、调用 AI
- **Projection 更新**（如 streak +1）：由 State Machine 通过后续 StateProposal 处理
- **DerivedSignal 更新**：由 Memory Framework 的 Deviation Aggregator 处理

State Machine 处理逻辑：

```typescript
// 阶段 1：执行原始 StateProposal
await executeStateTransition(stateProposal)

// 阶段 2：发射通用 ExecutionLogged 事件
emitSystemEvent({
  type: 'ExecutionLogged',
  payload: { sourceType, targetId, executionRecord }
})

// 阶段 3：处理级联规则
const cascadeRules = manifestRegistry.getCascadeRules(event.type)
for (const rule of cascadeRules) {
  if (rule.conditionMatches(event.payload)) {
    if (rule.auto_execute) {
      // 直接执行（视为原始 intent 的副作用）
      await domainRegistry.getRepository(rule.targetDomain).insert(rule.payload)
    } else {
      // 生成 suggestion 等待用户确认
      suggestions.push({
        suggestionType: rule.actionType === 'state_transition' ? 'state_transition' : 'log_entry',
        ...
      })
    }
  }
}

// 阶段 4：处理 onEvent 返回的 suggestions
for (const suggestion of suggestions) {
  if (suggestion.suggestionType === 'state_transition') {
    const lifecycle = manifestRegistry.getLifecycle(suggestion.targetType)
    if (!isTransitionValid(lifecycle, currentState, targetState)) continue
    await executeStateTransition(suggestion)
  } else if (suggestion.suggestionType === 'log_entry') {
    await domainRegistry.getRepository(suggestion.targetType).insert(suggestion.payload)
  }
  emitSystemEvent({ type: 'ExecutionLogged', ... })
}
```

---

## 依赖与约束

### 依赖

1. Timebox Domain manifest 的 `lifecycle` 必须将 `logged` 标记为不可逆状态
2. Habits Domain manifest 需要新增 `cascade_rules` 声明
3. HabitLogRepository 需要实现 `findByHabitAndDate`（已有）和 `save` 方法
4. TaskExecutionLogRepository 需要新增

### 约束（宪章兼容）

- **Domain 独立性（VI）**：每个 domain 只通过 `onEvent` 钩子接收事件并返回 suggestion，不直接写入其他 domain 的数据
- **Single-Writer Invariant（III）**：State Machine 是唯一执行 suggestion 的组件；级联规则的 `auto_execute` 是 State Machine 读取 manifest 后执行的，不违反此约束
- **Repository Isolation（V）**：所有数据写入通过 repository 接口，不直接调用 Drizzle
- **Intent-Driven（I）**：级联行为视为原始 intent 的副作用，不需要重新经过 Intent Engine；`auto_execute: false` 的 suggestion 进入 Action Surface，用户确认后形成新的 intent

---

## 影响范围

### 需要修改的文件

| 文件 | 变更内容 |
|------|---------|
| `frontend/src/usom/types/objects.ts` | 删除 `HabitLogStatus`，扩展 `HabitLog` 字段，添加 `Task.lastExecutionRecord`，`ExecutionRecord` 增加 `sourceType` |
| `frontend/src/usom/types/primitives.ts` | 确认 `CompletionStatus` 已包含所需值 |
| `frontend/src/usom/types/process.ts` | 扩展 `ActionSurfaceSuggestion` 类型，新增 `ExecutionLogged` 事件类型 |
| `frontend/src/lib/db/schema.ts` | `habit_logs` 字段变更，`task_execution_logs` 新表 |
| `frontend/src/lib/db/migrations/` | 新增 migration |
| `frontend/src/lib/db/repositories/mappers.ts` | 更新 habit_log ↔ HabitLog 映射，新增 task_execution_log 映射 |
| `frontend/src/domains/habits/repository/habit-log.ts` | 更新 repository 接口 |
| `frontend/src/domains/habits/manifest.yaml` | 新增 `cascade_rules` 声明 |
| `frontend/src/domains/habits/hooks.ts` | `onEvent` 中处理 `ExecutionLogged` 事件 |
| `frontend/src/domains/timebox/manifest.yaml` | 新增 `cascade_rules` 声明 |
| `frontend/src/domains/timebox/hooks.ts` | `onEvent` 中处理 `ExecutionLogged` 事件 |
| `frontend/src/domains/tasks/manifest.yaml` | 新增 `cascade_rules` 声明 |
| `frontend/src/domains/tasks/hooks.ts` | `onEvent` 中处理 `ExecutionLogged` 事件 |
| `frontend/src/domains/tasks/repository/` | 新增 task_execution_log repository |
| `frontend/src/nexus/core/state-machine/` | 扩展级联规则处理逻辑 |
| `docs/usom-design.md` | 更新 HabitLog、Task、ExecutionRecord、SystemEventType、ActionSurfaceSuggestion |
| `docs/database-design.md` | 更新 habit_logs 和新增 task_execution_logs |
| `manifest.md` | 记录变更 |

---

## 验收标准

1. [ ] Timebox 确认执行后，State Machine 读取 `cascade_rules` 自动创建 `habit_logs` 记录（source='timebox_sync'）
2. [ ] Habit manual 打卡后，Timebox Domain.onEvent 返回的 suggestion 正确生成
3. [ ] Task 在 timebox 中执行后，`task_execution_logs` 正确写入
4. [ ] 双向同步不产生循环
5. [ ] `ExecutionLogged` 事件正确发射，所有 domain 平等接收
6. [ ] State Machine 级联规则读取自 manifest，不硬编码
7. [ ] 所有现有测试通过
8. [ ] 新增 repository 单元测试通过
