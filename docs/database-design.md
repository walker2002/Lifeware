# Lifeware 数据库设计 2026_03_21

---

**本文档说明**

本文档是 Lifeware 数据库层的详细设计文件，从 USOM 对象模型映射到物理表结构。

**核心约束（来自上游文档，本文档全程遵守）**：
- Drizzle ORM 是唯一 ORM，禁止 raw SQL，禁止数据库专有语法
- Schema 是全系统唯一数据结构来源（Web / Mobile / Backend 共用）
- Repository 接口隔离：Nexus 组件不直接调用 Drizzle，不感知底层数据库
- USOM 对象与 DB 对象分离：Repository 层负责映射转换

关联文档：
- `LW_USOM_详细设计_2026_03_21.md`（上游类型定义）
- `LW_overall_总体设计_2026_03_18.md`（架构约束）
- `LW_overall_技术栈设计演进_2026_03_18.md`（技术约束）

**变更记录**：
- 2026_03_21：新增能量账户设计（energy_logs 表、user_calibration 能量字段、context_snapshots.energy_state）、整合评审意见（多租户、JSONB 规范、关联表）
- 2026_03_20：初始版本

---

## 一、设计原则

### 1.1 Repository 模式约束（核心约束）

**架构原则**：USOM/DB 分离，Repository 层负责映射转换。

```
Nexus 组件 → Repository Interface → USOM 对象 ← Repository Layer ← DB 行对象
```

| 约束 | 说明 |
|---|---|
| R-01 | Nexus 组件不得直接调用 Drizzle；所有数据访问必须经过 Repository 接口 |
| R-02 | Repository 接口的输入输出必须是 USOM 对象或 USOM_ID；不得暴露 DB 行对象 |
| R-03 | Repository 层负责 DB 行对象与 USOM 对象之间的双向映射转换 |
| R-04 | UI 组件只接收 USOM 对象；不得访问 DB 行对象或 Drizzle schema |

### 1.2 多租户隔离（MVP 预留，架构先行）

**设计决策**：虽然 MVP 阶段为单用户应用，但数据库架构必须从一开始就支持多租户。

| 约束 | 说明 |
|---|---|
| T-01 | 所有业务表均包含 `user_id` 外键，指向 `users` 表 |
| T-02 | 所有查询必须带 `user_id` 条件过滤，Repository 层负责注入 |
| T-03 | Nexus 组件不感知 `user_id`，由 Repository 层透明处理 |
| T-04 | `system_events`、`context_snapshots` 等系统表同样需要 `user_id` |

### 1.3 JSONB 使用规范（重要约束）

**设计决策**：只有"非查询关键字段"使用 JSONB。所有涉及 WHERE 子句过滤的字段必须作为独立列并建立索引。

| 允许 JSONB 的场景 | 说明 |
|---|---|
| 事件负载（`payload`） | 结构可变，不需要按内部字段过滤 |
| 配置/元数据（`metadata`） | 不参与业务查询 |
| 内嵌文档（`ReviewSection[]`） | 内容不需要独立查询 |
| 可选复杂对象（`RecurrenceRule`） | MVP 不实现，预留字段 |

| 禁止 JSONB 的场景 | 说明 |
|---|---|
| 状态字段（`status`） | 必须独立列 + 索引 |
| 时间字段（`due_date`, `start_time`） | 必须独立列 + 索引 |
| 外键引用（`*_id`） | 必须独立列 + FK 约束 |
| 枚举字段（`priority`, `energy_level`） | 必须独立列 + enum 类型 |
| 简单数组（`tags`） | 使用 `text[]` 或关联表，MVP 阶段可用 JSONB 但不建 GIN 索引 |

> **理由**：维持 Drizzle 的类型安全，避免 JSONB 索引的维护开销，确保查询性能可预测。

### 1.4 命名规范

| 类型 | 规范 | 示例 |
|---|---|---|
| 表名 | snake_case，复数形式 | `tasks`, `habit_logs`, `context_snapshots` |
| 字段名 | snake_case | `created_at`, `key_result_id` |
| 索引名 | `idx_{table}_{columns}` | `idx_tasks_user_status` |
| 唯一约束 | `uniq_{table}_{columns}` | `uniq_habit_logs_habit_date` |
| 外键约束 | `fk_{table}_{ref_table}` | `fk_tasks_key_results` |

### 1.5 通用字段规范

所有业务表包含以下审计字段：

```typescript
{
  id:            uuid      primary key default gen_random_uuid(),
  userId:        uuid      not null references users(id),  // 多租户
  schemaVersion: integer   not null default 1,
  createdAt:     timestamptz not null default now(),
  updatedAt:     timestamptz not null default now(),
  archivedAt:    timestamptz null,  // 软删除标记
}
```

### 1.6 时间与日期处理

| USOM 类型 | PostgreSQL 类型 | 存储格式 |
|---|---|---|
| `Timestamp` | `timestamptz` | UTC 时区，ISO 8601 |
| `DateOnly` | `date` | YYYY-MM-DD |
| `DurationMinutes` | `integer` | 分钟数 |

---

## 二、表结构总览

```
用户与配置
├── users                  ← 用户主表（非 USOM 对象，系统必需）
└── user_calibration       ← 个人校准参数（Memory Framework / Rule Engine 使用）

核心业务表（Core Objects）
├── objectives             ← OKR 目标
├── key_results            ← OKR 关键结果
├── tasks                  ← 任务
├── habits                 ← 习惯
├── habit_logs             ← 习惯打卡记录（独立表）
├── timeboxes              ← 时间盒
└── reviews                ← 复盘

关联表（Junction Tables）
├── timebox_tasks          ← Timebox ↔ Task（多对多）
└── timebox_habits         ← Timebox ↔ Habit（多对多）

意图与审计
├── intentions             ← 意图（原始输入）
├── structured_intents     ← 结构化意图归档（审计用）
└── state_proposals        ← 状态变更提案归档（审计用，MVP 可选）

系统支撑表
├── context_snapshots      ← 上下文快照（持久化，支持历史查询）
├── system_events          ← 事件存储（Memory Framework 原始数据源，append-only）
├── action_surfaces        ← 行动切面快照（审计用）
└── derived_signals        ← Memory Framework 计算缓存（每用户一行）

阶段二预留
├── memories               ← 记忆表
└── external_events        ← 外部事件表（Connector Layer）
```

---

## 三、用户与配置表

### 3.1 users

非 USOM 对象，系统必需。MVP 阶段极简，后续按需扩展。

```sql
CREATE TABLE users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

### 3.2 user_calibration

对应 Memory Framework 的个人校准参数，由 Rule Engine 读取（精力冲突检测、WIP 上限判断），由 State Machine 读取（计算 `timeOfDay`）。

**每用户一行**，初始值来自方法论默认值，运行时由 Memory Framework 通过 Review 周期校准提案更新。

```sql
CREATE TABLE user_calibration (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references users(id) on delete cascade,

  -- 精力时段边界（对应 USOM timeOfDay 计算）
  -- 默认值：morningStart 隐含为 05:00，由代码处理
  afternoon_start    integer not null default 12,   -- 下午开始小时数
  evening_start      integer not null default 18,   -- 晚上开始小时数
  night_start        integer not null default 22,   -- 夜间开始小时数

  -- 精力高峰参数（来自 DerivedSignals 校准后回写）
  peak_energy_start  integer not null default 9,
  peak_energy_end    integer not null default 12,
  energy_confidence  real not null default 0,

  -- 能量校准参数（能量优先调度核心）
  chronotype         text not null default 'intermediate' check (chronotype in ('morning_lark', 'night_owl', 'intermediate')),
  energy_sensitivity text not null default 'medium' check (energy_sensitivity in ('high', 'medium', 'low')),
  baseline_curve     jsonb not null default '[]',  -- EnergyCurvePoint[]，24小时基准能量曲线

  -- 执行容量参数
  comfortable_wip_limit       integer not null default 5,
  sustainable_deep_work_hours real not null default 4,

  -- 习惯执行参数（Memory Framework 学习后写入）
  -- JSONB 允许：这些是配置数据，不参与 WHERE 过滤
  habit_risk_days           jsonb not null default '[]',      -- number[]
  habit_preferred_time_slots jsonb not null default '[]',     -- string[]

  -- 规则覆盖历史（触发校准提案的数据来源）
  rule_override_history jsonb not null default '{}',

  updated_at    timestamptz not null default now(),
  schema_version integer not null default 1
);

CREATE INDEX idx_user_calibration_user ON user_calibration(user_id);
```

> **baseline_curve 示例**：
> ```json
> [
>   {"hour": 6, "baseline": 4},
>   {"hour": 9, "baseline": 8},
>   {"hour": 14, "baseline": 5},
>   {"hour": 21, "baseline": 3}
> ]
> ```
> Repository 层根据当前 hour 查找最近的曲线点，计算 inferredLevel。

---

### 3.3 energy_logs（能量校准日志表）

**对象意图**：记录用户每次手动校准能量的日志，供 Memory Framework 学习用户能量模式。

```sql
CREATE TABLE energy_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,

  -- 查询关键字段（独立列）
  level      integer not null check (level >= 1 and level <= 10),  -- 用户报告的能量值 1-10
  source     text not null check (source in ('user', 'system')),

  -- JSONB 允许：上下文元数据，不参与 WHERE 过滤
  context    jsonb not null default '{}',  -- e.g. {"timeOfDay": "morning", "afterTask": "xxx"}

  logged_at  timestamptz not null default now(),
  schema_version integer not null default 1
);

-- 索引
CREATE INDEX idx_energy_logs_user_logged ON energy_logs(user_id, logged_at desc);

-- 保留策略：保留最近 90 天的日志（通过定时任务清理）
```

> **写入场景**：
> 1. 用户主动报告当前能量状态（source = 'user'）
> 2. 系统根据时段推断记录（source = 'system'，用于冷启动阶段）
>
> **消费方**：Memory Framework 读取历史日志，学习用户能量模式，更新 UserCalibration.baselineCurve。

---

## 四、核心业务表

### 4.1 objectives（目标表）

对应 USOM `Objective`。

```sql
CREATE TABLE objectives (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  schema_version integer not null default 1,

  -- 查询关键字段（独立列）
  status      text not null check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  title       text not null,
  description text,

  -- 周期字段（查询关键）
  period_type  text not null check (period_type in ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  period_start date not null,
  period_end   date not null,

  -- 层级支持（自引用）
  parent_id   uuid references objectives(id) on delete set null,

  -- JSONB 允许：tags 不参与 WHERE 过滤（MVP 阶段）
  tags        jsonb not null default '[]',

  -- 审计字段
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  archived_at  timestamptz
);

-- 索引
CREATE INDEX idx_objectives_user_status ON objectives(user_id, status) where archived_at is null;
CREATE INDEX idx_objectives_period ON objectives(user_id, period_start, period_end);
CREATE INDEX idx_objectives_parent ON objectives(parent_id) where parent_id is not null;

-- 约束
ALTER TABLE objectives ADD CONSTRAINT check_objectives_period_end_after_start
  CHECK (period_end > period_start);
```

> **注意**：USOM 中 `keyResultIds` 是 `Objective` 的字段，但在 DB 层通过 `key_results.objective_id` 外键反向关联，不在 `objectives` 表中存储数组。Repository 层负责聚合。

---

### 4.2 key_results（关键结果表）

对应 USOM `KeyResult`。

```sql
CREATE TABLE key_results (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  schema_version integer not null default 1,

  -- 查询关键字段（独立列）
  status       text not null check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  objective_id uuid not null references objectives(id) on delete cascade,
  title        text not null,
  description  text,

  -- 目标值字段
  target_value  numeric not null,
  current_value numeric not null default 0,
  unit          text not null,
  progress_rate numeric not null default 0,  -- 冗余字段，便于排序

  -- 时间字段（查询关键）
  due_date     date,

  -- 审计字段
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  archived_at  timestamptz
);

-- 索引
CREATE INDEX idx_key_results_user_status ON key_results(user_id, status);
CREATE INDEX idx_key_results_objective ON key_results(objective_id);
CREATE INDEX idx_key_results_due_date ON key_results(user_id, due_date) where due_date is not null;

-- 约束
ALTER TABLE key_results ADD CONSTRAINT check_key_results_target_positive
  CHECK (target_value > 0);
ALTER TABLE key_results ADD CONSTRAINT check_key_results_current_within_target
  CHECK (current_value >= 0 and current_value <= target_value);
```

---

### 4.3 tasks（任务表）

对应 USOM `Task`。

```sql
CREATE TABLE tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  schema_version    integer not null default 1,

  -- 查询关键字段（独立列）
  status            text not null check (status in ('draft', 'active', 'scheduled', 'completed', 'archived')),
  title             text not null,
  description       text,
  priority          text not null check (priority in ('critical', 'high', 'medium', 'low')),
  energy_required   text not null check (energy_required in ('high', 'medium', 'low')),
  estimated_duration integer not null,
  actual_duration   integer,

  -- 关联字段（查询关键）
  key_result_id     uuid references key_results(id) on delete set null,
  -- timebox_id 使用软引用，通过 timebox_tasks 关联表维护多对多关系
  -- 此字段仅表示"当前激活的 Timebox"，是派生的便利字段
  timebox_id        uuid,  -- 软引用，不设 FK constraint

  -- 时间字段（查询关键）
  due_date          date,

  -- JSONB 允许：tags 不参与 WHERE 过滤；recurrence MVP 不实现
  tags              jsonb not null default '[]',
  recurrence        jsonb,  -- RecurrenceRule，预留字段

  -- 审计字段
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz,
  archived_at       timestamptz
);

-- 索引
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status) where archived_at is null;
CREATE INDEX idx_tasks_priority ON tasks(user_id, priority) where status in ('active', 'scheduled');
CREATE INDEX idx_tasks_due_date ON tasks(user_id, due_date) where due_date is not null and archived_at is null;
CREATE INDEX idx_tasks_key_result ON tasks(key_result_id) where key_result_id is not null;
CREATE INDEX idx_tasks_timebox ON tasks(timebox_id) where timebox_id is not null;
```

> **设计说明**：`tasks.timebox_id` 使用软引用（不设 FK constraint）。原因：`timeboxes` 和 `tasks` 之间是多对多关系（通过 `timebox_tasks` 关联表），`tasks.timebox_id` 只表示"当前激活的 Timebox"，是一个派生的便利字段。

---

### 4.4 habits（习惯表）

对应 USOM `Habit`。

```sql
CREATE TABLE habits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  schema_version integer not null default 1,

  -- 查询关键字段（独立列）
  status       text not null check (status in ('draft', 'active', 'suspended', 'archived')),
  title        text not null,
  description  text,
  frequency_type text not null check (frequency_type in ('daily', 'weekly', 'custom')),
  scheduled_time text not null check (scheduled_time ~ '^\d{2}:\d{2}$'),
  duration     integer not null,

  -- 关联字段（查询关键）
  key_result_id uuid references key_results(id) on delete set null,

  -- 统计字段（冗余，便于查询）
  streak           integer not null default 0,
  longest_streak   integer not null default 0,
  completion_rate_7d real not null default 0,

  -- 时间字段（查询关键）
  start_date    date not null,
  end_date      date,

  -- JSONB 允许：days_of_week 不参与 WHERE 过滤；tags 同上
  days_of_week  jsonb,  -- number[] | null
  tags          jsonb not null default '[]',

  -- 审计字段
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  suspended_at  timestamptz,
  archived_at   timestamptz
);

-- 索引
CREATE INDEX idx_habits_user_status ON habits(user_id, status) where archived_at is null;
CREATE INDEX idx_habits_start_date ON habits(user_id, start_date);
CREATE INDEX idx_habits_key_result ON habits(key_result_id) where key_result_id is not null;
```

---

### 4.5 habit_logs（习惯打卡记录表）

对应 USOM `HabitLog`。独立表，不嵌套在 `habits` 内。

```sql
CREATE TABLE habit_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  schema_version integer not null default 1,

  -- 查询关键字段（独立列）
  habit_id       uuid not null references habits(id) on delete cascade,
  date           date not null,
  status         text not null check (status in ('completed', 'skipped', 'partial')),
  actual_duration integer,

  -- 审计字段
  note           text,
  logged_at      timestamptz not null default now(),
  source         text not null check (source in ('manual', 'connector')) default 'manual'
);

-- 唯一约束：同一习惯同一天只能有一条打卡记录
CREATE UNIQUE INDEX uniq_habit_logs_habit_date ON habit_logs(habit_id, date);

-- 索引
CREATE INDEX idx_habit_logs_user_date ON habit_logs(user_id, date);
CREATE INDEX idx_habit_logs_habit_id ON habit_logs(habit_id);
```

---

### 4.6 timeboxes（时间盒表）

对应 USOM `Timebox`。

```sql
CREATE TABLE timeboxes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  schema_version integer not null default 1,

  -- 查询关键字段（独立列）
  status        text not null check (status in ('planned', 'running', 'paused', 'ended', 'logged')),
  title         text not null,
  start_time    timestamptz not null,
  end_time      timestamptz not null,
  is_recurring  boolean not null default false,

  -- JSONB 允许：recurrence_rule MVP 不实现；tags 不参与 WHERE 过滤
  recurrence_rule jsonb,
  tags            jsonb not null default '[]',

  -- 审计字段
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  started_at    timestamptz,
  paused_at     timestamptz,
  ended_at      timestamptz,
  logged_at     timestamptz
);

-- 索引
CREATE INDEX idx_timeboxes_user_status ON timeboxes(user_id, status);
CREATE INDEX idx_timeboxes_user_start ON timeboxes(user_id, start_time);
CREATE INDEX idx_timeboxes_user_end ON timeboxes(user_id, end_time);

-- 约束
ALTER TABLE timeboxes ADD CONSTRAINT check_timeboxes_end_after_start
  CHECK (end_time > start_time);
```

> **注意**：`taskIds` 和 `habitIds` 不在本表存储，通过 `timebox_tasks` 和 `timebox_habits` 关联表维护（见第五章）。USOM 中的数组字段在 Repository 层聚合后注入到 USOM 对象。

---

### 4.7 reviews（复盘表）

对应 USOM `Review`。

```sql
CREATE TABLE reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  schema_version integer not null default 1,

  -- 查询关键字段（独立列）
  status      text not null check (status in ('draft', 'in_progress', 'completed', 'archived')),
  type        text not null check (type in ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  period_start date not null,
  period_end   date not null,
  generated_by text not null check (generated_by in ('ai', 'manual')),

  -- JSONB 允许：sections 和 metrics 内容不需要独立查询
  sections    jsonb not null default '[]',
  metrics     jsonb not null default '{}',

  -- 审计字段
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  archived_at  timestamptz
);

-- 索引
CREATE INDEX idx_reviews_user_status ON reviews(user_id, status);
CREATE INDEX idx_reviews_user_period ON reviews(user_id, period_start, period_end);
CREATE INDEX idx_reviews_user_type ON reviews(user_id, type);
```

---

## 五、关联表（Junction Tables）

### 5.1 timebox_tasks

Timebox ↔ Task 多对多关系。

```sql
CREATE TABLE timebox_tasks (
  timebox_id uuid not null references timeboxes(id) on delete cascade,
  task_id    uuid not null references tasks(id) on delete cascade,
  primary key (timebox_id, task_id)
);

-- 索引（支持反向查询）
CREATE INDEX idx_timebox_tasks_task ON timebox_tasks(task_id);
```

### 5.2 timebox_habits

Timebox ↔ Habit 多对多关系。

```sql
CREATE TABLE timebox_habits (
  timebox_id uuid not null references timeboxes(id) on delete cascade,
  habit_id   uuid not null references habits(id) on delete cascade,
  primary key (timebox_id, habit_id)
);

-- 索引（支持反向查询）
CREATE INDEX idx_timebox_habits_habit ON timebox_habits(habit_id);
```

---

## 六、意图与审计表

### 6.1 intentions（意图表）

对应 USOM `Intention`。

```sql
CREATE TABLE intentions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  schema_version   integer not null default 1,

  -- 查询关键字段（独立列）
  status           text not null check (status in ('captured', 'clarified', 'routed', 'dissolved')),
  raw_input        text not null,
  input_mode       text not null check (input_mode in ('natural_language', 'template_form', 'slash_command')),
  source_snapshot_id uuid,  -- 软引用，指向 context_snapshots

  -- 审计字段
  notes            text,
  captured_at      timestamptz not null default now(),
  dissolved_at     timestamptz
);

-- 索引
CREATE INDEX idx_intentions_user_status ON intentions(user_id, status);
CREATE INDEX idx_intentions_captured_at ON intentions(user_id, captured_at desc);
```

---

### 6.2 structured_intents（结构化意图归档）

对应 USOM `StructuredIntent`。审计用，记录 Intent Engine 的解析结果。

```sql
CREATE TABLE structured_intents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  schema_version integer not null default 1,

  intention_id  uuid not null references intentions(id) on delete cascade,
  target_domain text not null,
  action        text not null,

  -- JSONB 允许：fields 结构可变，不参与 WHERE 过滤
  fields        jsonb not null default '{}',

  confidence    real not null,
  resolved_by   text not null check (resolved_by in ('ai', 'template_form')),
  created_at    timestamptz not null default now()
);

-- 索引
CREATE INDEX idx_structured_intents_user ON structured_intents(user_id);
CREATE INDEX idx_structured_intents_intention ON structured_intents(intention_id);
```

---

### 6.3 state_proposals（状态变更提案归档，MVP 可选）

对应 USOM `StateProposal`。决策链路审计，MVP 阶段可选实现。

```sql
CREATE TABLE state_proposals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  schema_version   integer not null default 1,

  intent_id        uuid not null references structured_intents(id) on delete cascade,
  target_object_type text not null,
  target_object_id   uuid,  -- null 表示新建
  action             text not null,

  -- JSONB 允许：payload 结构可变
  payload           jsonb not null default '{}',

  approved_at       timestamptz not null,
  approved_by       text not null default 'rule_engine'
);

-- 索引
CREATE INDEX idx_state_proposals_user ON state_proposals(user_id);
CREATE INDEX idx_state_proposals_intent ON state_proposals(intent_id);
```

---

## 七、系统支撑表

### 7.1 context_snapshots（上下文快照表）

**设计决策**：ContextSnapshot 由 State Machine 在每次状态变更后同步生成并持久化，支持历史查询与审计。

```sql
CREATE TABLE context_snapshots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  generated_at timestamptz not null default now(),
  generated_by text not null default 'state_machine',

  -- 当前时间信息（独立列，便于查询）
  current_time  timestamptz not null,
  current_date  date not null,
  day_of_week   integer not null check (day_of_week >= 0 and day_of_week <= 6),
  time_of_day   text not null check (time_of_day in ('morning', 'afternoon', 'evening', 'night')),

  -- 能量状态（能量优先调度的核心数据）
  energy_state  jsonb not null default '{}',  -- EnergyState 对象

  -- 活跃对象汇总（JSONB：快照数据，不参与 WHERE 过滤）
  active_objectives  jsonb not null default '[]',
  active_key_results jsonb not null default '[]',
  active_tasks       jsonb not null default '[]',
  pending_habits     jsonb not null default '[]',
  current_timebox    jsonb,
  upcoming_timeboxes jsonb not null default '[]',
  pending_intentions jsonb not null default '[]'
);

-- 索引
CREATE INDEX idx_context_snapshots_user_generated ON context_snapshots(user_id, generated_at desc);
CREATE INDEX idx_context_snapshots_user_date ON context_snapshots(user_id, current_date);

-- 保留策略：只保留最近 30 天的快照（通过定时任务清理）
```

---

### 7.2 system_events（系统事件表）

**设计决策**：Event Bus 持久化所有 SystemEvent，**append-only**，支持事件重放。是 Memory Framework 的原始数据来源。

```sql
CREATE TABLE system_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  schema_version integer not null default 1,

  -- 查询关键字段（独立列）
  type         text not null,
  occurred_at  timestamptz not null default now(),
  triggered_by text not null check (triggered_by in ('state_machine', 'time_trigger')),
  snapshot_id  uuid references context_snapshots(id) on delete set null,

  -- JSONB 允许：payload 结构可变
  payload      jsonb not null default '{}',

  -- 处理状态
  processed    boolean not null default false,
  processed_at timestamptz
);

-- 索引
CREATE INDEX idx_system_events_user_occurred ON system_events(user_id, occurred_at desc);
CREATE INDEX idx_system_events_user_type ON system_events(user_id, type);
CREATE INDEX idx_system_events_unprocessed ON system_events(user_id, processed) where not processed;

-- 唯一约束：防止事件重复
CREATE UNIQUE INDEX uniq_system_events_user_type_occurred
  ON system_events(user_id, type, occurred_at, id);
```

> **约束**：Repository 层只暴露 `insert` 方法，不暴露 `update` / `delete`。任何试图修改历史事件的操作均视为架构违规。

---

### 7.3 action_surfaces（行动切面快照表）

**设计决策**：存储每次生成的 Action Surface 快照，便于审计与调试。

```sql
CREATE TABLE action_surfaces (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  snapshot_id  uuid not null references context_snapshots(id) on delete cascade,
  generated_at timestamptz not null default now(),

  -- 三类行动切面（JSONB：快照数据，不参与 WHERE 过滤）
  guide        jsonb not null default '[]',
  tiles        jsonb not null default '[]',
  cues         jsonb not null default '[]'
);

-- 索引
CREATE INDEX idx_action_surfaces_user ON action_surfaces(user_id);
CREATE INDEX idx_action_surfaces_snapshot ON action_surfaces(snapshot_id);
CREATE INDEX idx_action_surfaces_generated ON action_surfaces(user_id, generated_at desc);
```

---

### 7.4 derived_signals（衍生信号表）

对应 USOM `DerivedSignals`。**每用户一行**，由 Memory Framework 定期计算后覆盖写入。

```sql
CREATE TABLE derived_signals (
  id     uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,

  -- JSONB 允许：信号数据，通过专门的字段暴露给 Rule Engine
  energy_pattern      jsonb,  -- { peakHours, lowHours, confidence } | null

  -- 独立列（查询关键）：常用信号直接暴露
  active_task_count      integer not null default 0,
  avg_completion_rate_7d real not null default 0,
  avg_completion_rate_30d real not null default 0,

  -- JSONB 允许：习惯信号按 habitId 索引，不需要全局 WHERE
  habit_streaks          jsonb not null default '{}',
  habit_completion_rates jsonb not null default '{}',

  -- 独立列（查询关键）
  timebox_adherence_7d   real not null default 0,
  is_overcommitted       boolean not null default false,

  -- 元数据
  computed_at     timestamptz not null default now(),
  data_window_days integer not null default 30,
  schema_version  integer not null default 1
);

-- 索引
CREATE INDEX idx_derived_signals_user ON derived_signals(user_id);
```

> **写入约束（来自总体设计）**：只有 Memory Framework 可以写入本表。Bridge Layer 只读。Repository 层只对 Memory Framework 的 Service 暴露 `upsert` 方法。

---

## 八、阶段二预留表

### 8.1 memories（记忆表）

五层记忆合表存储，通过 `layer` 字段区分。

```sql
CREATE TABLE memories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  schema_version integer not null default 1,

  -- 查询关键字段（独立列）
  layer       text not null check (layer in ('session', 'episode', 'procedural', 'semantic', 'core')),
  expires_at  timestamptz,  -- L1/L2 层记忆有过期时间

  -- JSONB 允许：记忆内容结构可变
  content     jsonb not null,
  summary     text,

  -- 关联
  source_event_id  uuid references system_events(id) on delete set null,
  parent_memory_id uuid references memories(id) on delete set null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

-- 索引
CREATE INDEX idx_memories_user_layer ON memories(user_id, layer);
CREATE INDEX idx_memories_expires ON memories(user_id, expires_at) where expires_at is not null;
```

---

### 8.2 external_events（外部事件表）

Connector Layer 预留，MVP 不实现。

```sql
-- MVP 阶段不建表，接口预留
-- CREATE TABLE external_events (...)
```

---

## 九、数据库函数与触发器

### 9.1 自动更新 updated_at

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为所有需要的表添加触发器
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_user_calibration_updated_at
  BEFORE UPDATE ON user_calibration
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_objectives_updated_at
  BEFORE UPDATE ON objectives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_key_results_updated_at
  BEFORE UPDATE ON key_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_habits_updated_at
  BEFORE UPDATE ON habits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_timeboxes_updated_at
  BEFORE UPDATE ON timeboxes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_intentions_updated_at
  BEFORE UPDATE ON intentions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_memories_updated_at
  BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 9.2 KeyResult 进度率自动计算

```sql
CREATE OR REPLACE FUNCTION update_keyresult_progress()
RETURNS TRIGGER AS $$
BEGIN
  NEW.progress_rate = CASE
    WHEN NEW.target_value > 0 THEN
      ROUND((NEW.current_value / NEW.target_value)::numeric, 4)
    ELSE
      0
  END;

  IF NEW.progress_rate >= 1.0 AND NEW.status != 'completed' THEN
    NEW.status = 'completed';
    NEW.completed_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_key_results_update_progress
  BEFORE INSERT OR UPDATE OF current_value, target_value ON key_results
  FOR EACH ROW EXECUTE FUNCTION update_keyresult_progress();
```

---

## 十、视图（供 Repository 查询）

```sql
-- 当前活跃任务视图
CREATE VIEW v_active_tasks AS
SELECT
  id, user_id, title, status, priority, energy_required,
  estimated_duration, due_date, key_result_id, timebox_id,
  tags, created_at, updated_at
FROM tasks
WHERE status IN ('active', 'scheduled')
  AND archived_at IS NULL;

-- 今日待打卡习惯视图
CREATE VIEW v_today_pending_habits AS
SELECT
  h.id, h.user_id, h.title, h.scheduled_time, h.streak,
  h.completion_rate_7d, h.key_result_id,
  COALESCE(hl.status, 'pending') as log_status
FROM habits h
LEFT JOIN habit_logs hl
  ON h.id = hl.habit_id AND hl.date = CURRENT_DATE
WHERE h.status = 'active'
  AND h.archived_at IS NULL
  AND h.start_date <= CURRENT_DATE
  AND (h.end_date IS NULL OR h.end_date >= CURRENT_DATE);

-- 进行中的时间盒视图
CREATE VIEW v_running_timeboxes AS
SELECT
  id, user_id, title, status, start_time, end_time, tags
FROM timeboxes
WHERE status IN ('running', 'paused');
```

---

## 十一、Repository 接口约定

Repository 是 DB 层与 Nexus 层之间的唯一桥梁，Nexus 组件只依赖 Repository 接口，不感知 Drizzle 实现。

### 11.1 接口设计规范

```typescript
// ── 示例：TaskRepository 接口 ────────────────────────────────
interface TaskRepository {
  // 基础 CRUD（返回 USOM 对象，不是 DB 行）
  findById(id: string, userId: string): Promise<Task | null>
  findByStatus(status: TaskStatus, userId: string): Promise<Task[]>
  findByTimebox(timeboxId: string, userId: string): Promise<Task[]>
  save(task: Task, userId: string): Promise<void>
  archive(id: string, userId: string): Promise<void>
}

// ── 示例：HabitLogRepository 接口 ───────────────────────────
interface HabitLogRepository {
  findByHabitAndDate(habitId: string, date: string, userId: string): Promise<HabitLog | null>
  findByUserAndDate(date: string, userId: string): Promise<HabitLog[]>
  save(log: HabitLog, userId: string): Promise<void>
  // 注意：HabitLog 是事实记录，不暴露 delete / update 方法
}

// ── 示例：SystemEventRepository（append-only）───────────────
interface SystemEventRepository {
  append(event: SystemEvent, userId: string): Promise<void>
  findByUserInRange(userId: string, startAt: string, endAt: string): Promise<SystemEvent[]>
  // 注意：不暴露 update / delete 方法
}

// ── 示例：DerivedSignalsRepository ──────────────────────────
interface DerivedSignalsRepository {
  findByUser(userId: string): Promise<DerivedSignals | null>
  upsert(signals: DerivedSignals, userId: string): Promise<void>
  // 注意：只对 Memory Framework Service 暴露 upsert
}
```

### 11.2 USOM 对象与 DB 行的映射说明

| USOM 字段 | DB 存储方式 | 映射说明 |
|---|---|---|
| `Objective.keyResultIds` | 不存储 | 由 `key_results.objective_id` 反查，Repository 聚合后注入 |
| `Timebox.taskIds` | `timebox_tasks` 关联表 | Repository 联查后聚合为数组 |
| `Timebox.habitIds` | `timebox_habits` 关联表 | 同上 |
| `Habit.frequency` | 拆为 `frequency_type` + `days_of_week` | Repository 组装为 `HabitFrequency` 对象 |
| `Review.sections` | JSONB | 直接 JSON 序列化/反序列化 |
| `Review.metrics` | JSONB | 同上 |
| `Task.tags` / `Habit.tags` | JSONB | `string[]` 序列化 |

---

## 十二、MVP 实现范围与优先级

### 第一批（Day 1 必须完成）

| 表名 | 说明 |
|---|---|
| `users` | 用户主表 |
| `user_calibration` | 个人校准参数 |
| `tasks` | 任务表 |
| `habits` | 习惯表 |
| `habit_logs` | 习惯打卡记录表 |
| `timeboxes` | 时间盒表 |
| `timebox_tasks` | Timebox-Task 关联表 |
| `timebox_habits` | Timebox-Habit 关联表 |
| `intentions` | 意图表 |
| `structured_intents` | 结构化意图归档 |
| `system_events` | 系统事件表 |
| `context_snapshots` | 上下文快照表 |
| `action_surfaces` | 行动切面快照表 |
| `derived_signals` | 衍生信号表 |

### 第二批（OKR 路径）

| 表名 | 说明 |
|---|---|
| `objectives` | 目标表 |
| `key_results` | 关键结果表 |

### 第三批（复盘路径）

| 表名 | 说明 |
|---|---|
| `reviews` | 复盘表 |

### 可选 / 推迟

| 表名 | 说明 |
|---|---|
| `state_proposals` | 审计用，不影响核心流程 |
| `memories` | 阶段二 |
| `external_events` | 阶段二，Connector Layer |

---

## 十三、设计决策记录（已确认）

| 决策点 | 结论 | 理由 |
|---|---|---|
| 多租户设计 | **所有业务表含 user_id** | MVP 单用户，但架构先行支持多租户 |
| JSONB 使用范围 | **仅非查询关键字段** | 维持 Drizzle 类型安全，确保查询性能 |
| `tasks.timebox_id` FK | **不设 FK constraint** | 软引用，避免级联复杂度，通过关联表维护规范关系 |
| `ContextSnapshot` 持久化 | **持久化** | 支持历史查询、审计、事件溯源 |
| `KeyResult.progressRate` | **存库（冗余字段）** | 避免排序时实时计算，写时维护 |
| `habit_logs` 唯一约束 | **(habit_id, date) UNIQUE** | 同一习惯同一天只能有一条记录 |
| `system_events` 删除 | **禁止（append-only）** | Memory Framework 数据基础 |
| `derived_signals` 写入权限 | **仅 Memory Framework** | Repository 只对 Memory Framework 暴露 upsert |
| Timebox-Task 关系 | **关联表（多对多）** | 支持双向查询，可分别索引 |

---

## 十四、本文档的使用方式

- 本文档是 Drizzle Schema 文件（`schema.ts`）的唯一设计依据
- 每次新增或修改 USOM 对象字段，必须先同步更新 USOM 文档，再更新本文档，最后修改 Schema 代码
- Repository 接口的方法签名以本文档第十一章为准
- 三者优先级：**USOM 文档 > 本文档 > Schema 代码**

---

*文档版本：2026_03_21*
*关联上游文档：LW_USOM_详细设计_2026_03_20.md*
