# Lifeware 数据库设计 2026_03_20

---

**本文档说明**

本文档定义 Lifeware 的数据库表结构与设计规范，是 USOM 详细设计文档在 PostgreSQL + Drizzle ORM 层面的落地实现。

关联文档：
- `LW_overall_总体设计_2026_03_18.md`（上级约束文件）
- `LW_USOM_详细设计_2026_03_20.md`（USOM 对象定义）
- `LW_overall_技术栈设计演进_2026_03_18.md`（技术栈约束）

**变更记录**：
- 2026_03_20：初始版本，定义 MVP 核心表结构

---

## 一、数据库设计原则

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

### 1.2 命名规范

| 类型 | 规范 | 示例 |
|---|---|---|
| 表名 | snake_case，复数形式 | `tasks`, `habit_logs`, `context_snapshots` |
| 字段名 | snake_case | `created_at`, `key_result_id` |
| 索引名 | `idx_{table}_{columns}` | `idx_tasks_status_due_date` |
| 唯一约束 | `uniq_{table}_{columns}` | `uniq_habit_logs_habit_id_date` |
| 外键约束 | `fk_{table}_{ref_table}` | `fk_tasks_key_results` |

### 1.3 通用字段规范

所有表包含以下审计字段：

```typescript
{
  id:            text      primary key default gen_random_uuid(),  -- USOM_ID
  schemaVersion: integer   not null default 1,                     -- USOM 版本字段
  createdAt:     timestamp not null default now(),
  updatedAt:     timestamp not null default now(),
  archivedAt:    timestamp null,  -- 软删除标记
}
```

### 1.4 时间与日期处理

| USOM 类型 | PostgreSQL 类型 | 存储格式 |
|---|---|---|
| `Timestamp` | `timestamptz` | UTC 时区，ISO 8601 |
| `DateOnly` | `date` | YYYY-MM-DD |
| `DurationMinutes` | `integer` | 分钟数 |

---

## 二、表结构设计

### 2.1 核心对象表（MVP 第一批）

#### 2.1.1 tasks（任务表）

```sql
CREATE TABLE tasks (
  id                text primary key default gen_random_uuid(),
  schema_version    integer not null default 1,

  -- USOM 字段
  status            text not null check (status in ('draft', 'active', 'scheduled', 'completed', 'archived')),
  title             text not null,
  description       text,
  priority          text not null check (priority in ('critical', 'high', 'medium', 'low')),
  energy_required   text not null check (energy_required in ('high', 'medium', 'low')),
  estimated_duration integer not null,
  actual_duration   integer,

  -- 关联字段
  key_result_id     text references key_results(id) on delete set null,
  timebox_id        text references timeboxes(id) on delete set null,

  -- 数组字段
  tags              text[] not null default '{}',

  -- 时间字段
  due_date          date,

  -- 审计字段
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz,
  archived_at       timestamptz
);

-- 索引
CREATE INDEX idx_tasks_status ON tasks(status) where archived_at is null;
CREATE INDEX idx_tasks_priority ON tasks(priority) where status in ('active', 'scheduled');
CREATE INDEX idx_tasks_due_date ON tasks(due_date) where due_date is not null and archived_at is null;
CREATE INDEX idx_tasks_key_result ON tasks(key_result_id) where key_result_id is not null;
CREATE INDEX idx_tasks_timebox ON tasks(timebox_id) where timebox_id is not null;
CREATE INDEX idx_tasks_tags ON tasks using gin(tags) where array_length(tags, 1) > 0;
```

#### 2.1.2 habits（习惯表）

```sql
CREATE TABLE habits (
  id                text primary key default gen_random_uuid(),
  schema_version    integer not null default 1,

  -- USOM 字段
  status            text not null check (status in ('draft', 'active', 'suspended', 'archived')),
  title             text not null,
  description       text,
  frequency_type    text not null check (frequency_type in ('daily', 'weekly', 'custom')),
  frequency_days_of_week integer[],  -- 0=Sunday ... 6=Saturday
  scheduled_time    text not null check (scheduled_time ~ '^\d{2}:\d{2}$'),
  duration          integer not null,

  -- 关联字段
  key_result_id     text references key_results(id) on delete set null,

  -- 统计字段（冗余，便于查询）
  streak            integer not null default 0,
  longest_streak    integer not null default 0,
  completion_rate_7d numeric(3, 2) not null default 0,  -- 0.00-1.00

  -- 数组字段
  tags              text[] not null default '{}',

  -- 时间字段
  start_date        date not null,
  end_date          date,

  -- 审计字段
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  suspended_at      timestamptz,
  archived_at       timestamptz
);

-- 索引
CREATE INDEX idx_habits_status ON habits(status) where archived_at is null;
CREATE INDEX idx_habits_key_result ON habits(key_result_id) where key_result_id is not null;
CREATE INDEX idx_habits_start_date ON habits(start_date);
CREATE UNIQUE INDEX uniq_habits_scheduled_time_date
  ON habits(id, scheduled_time)
  WHERE status = 'active' and archived_at is null;
```

#### 2.1.3 habit_logs（习惯打卡记录表）

```sql
CREATE TABLE habit_logs (
  id                text primary key default gen_random_uuid(),
  schema_version    integer not null default 1,

  -- USOM 字段
  habit_id          text not null references habits(id) on delete cascade,
  date              date not null,
  status            text not null check (status in ('completed', 'skipped', 'partial')),
  actual_duration   integer,

  -- 审计字段
  note              text,
  logged_at         timestamptz not null default now(),
  source            text not null check (source in ('manual', 'connector')) default 'manual'
);

-- 唯一约束：每个习惯每天只能有一条记录
CREATE UNIQUE INDEX uniq_habit_logs_habit_date ON habit_logs(habit_id, date);

-- 索引
CREATE INDEX idx_habit_logs_habit_id ON habit_logs(habit_id);
CREATE INDEX idx_habit_logs_date ON habit_logs(date);
CREATE INDEX idx_habit_logs_status ON habit_logs(status);
```

#### 2.1.4 timeboxes（时间盒表）

```sql
CREATE TABLE timeboxes (
  id                text primary key default gen_random_uuid(),
  schema_version    integer not null default 1,

  -- USOM 字段
  status            text not null check (status in ('planned', 'running', 'paused', 'ended', 'logged')),
  title             text not null,
  start_time        timestamptz not null,
  end_time          timestamptz not null,
  is_recurring      boolean not null default false,

  -- 数组字段（关联）
  task_ids          text[] not null default '{}',
  habit_ids         text[] not null default '{}',
  tags              text[] not null default '{}',

  -- 审计字段
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  started_at        timestamptz,
  paused_at         timestamptz,
  ended_at          timestamptz,
  logged_at         timestamptz
);

-- 索引
CREATE INDEX idx_timeboxes_status ON timeboxes(status);
CREATE INDEX idx_timeboxes_start_time ON timeboxes(start_time);
CREATE INDEX idx_timeboxes_end_time ON timeboxes(end_time);
CREATE INDEX idx_timeboxes_tasks ON timeboxes using gin(task_ids) where array_length(task_ids, 1) > 0;
CREATE INDEX idx_timeboxes_habits ON timeboxes using gin(habit_ids) where array_length(habit_ids, 1) > 0;

-- 约束：结束时间必须晚于开始时间
ALTER TABLE timeboxes ADD CONSTRAINT check_timeboxes_end_after_start
  CHECK (end_time > start_time);
```

---

### 2.2 OKR 对象表（MVP 第二批）

#### 2.2.1 objectives（目标表）

```sql
CREATE TABLE objectives (
  id                text primary key default gen_random_uuid(),
  schema_version    integer not null default 1,

  -- USOM 字段
  status            text not null check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  title             text not null,
  description       text,

  -- 周期字段
  period_type       text not null check (period_type in ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  period_start      date not null,
  period_end        date not null,

  -- 关联字段
  parent_id         text references objectives(id) on delete set null,

  -- 数组字段
  key_result_ids    text[] not null default '{}',
  tags              text[] not null default '{}',

  -- 审计字段
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz,
  archived_at       timestamptz
);

-- 索引
CREATE INDEX idx_objectives_status ON objectives(status) where archived_at is null;
CREATE INDEX idx_objectives_period ON objectives(period_start, period_end);
CREATE INDEX idx_objectives_parent ON objectives(parent_id) where parent_id is not null;

-- 约束：周期结束时间必须晚于开始时间
ALTER TABLE objectives ADD CONSTRAINT check_objectives_period_end_after_start
  CHECK (period_end > period_start);
```

#### 2.2.2 key_results（关键结果表）

```sql
CREATE TABLE key_results (
  id                text primary key default gen_random_uuid(),
  schema_version    integer not null default 1,

  -- USOM 字段
  status            text not null check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  objective_id      text not null references objectives(id) on delete cascade,
  title             text not null,
  description       text,

  -- 目标值字段
  target_value      numeric not null,
  current_value     numeric not null default 0,
  unit              text not null,
  progress_rate     numeric not null default 0,  -- current_value / target_value

  -- 时间字段
  due_date          date,

  -- 审计字段
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz,
  archived_at       timestamptz
);

-- 索引
CREATE INDEX idx_key_results_objective ON key_results(objective_id);
CREATE INDEX idx_key_results_status ON key_results(status);
CREATE INDEX idx_key_results_due_date ON key_results(due_date) where due_date is not null;

-- 约束：目标值必须大于 0
ALTER TABLE key_results ADD CONSTRAINT check_key_results_target_positive
  CHECK (target_value > 0);

-- 约束：当前值不能超过目标值
ALTER TABLE key_results ADD CONSTRAINT check_key_results_current_within_target
  CHECK (current_value >= 0 and current_value <= target_value);
```

---

### 2.3 复盘对象表（MVP 第三批）

#### 2.3.1 reviews（复盘表）

```sql
CREATE TABLE reviews (
  id                text primary key default gen_random_uuid(),
  schema_version    integer not null default 1,

  -- USOM 字段
  status            text not null check (status in ('draft', 'in_progress', 'completed', 'archived')),
  type              text not null check (type in ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  period_start      date not null,
  period_end        date not null,
  generated_by      text not null check (generated_by in ('ai', 'manual')),

  -- JSON 字段（sections 和 metrics）
  sections          jsonb not null default '[]',
  metrics           jsonb not null default '{}'::jsonb,

  -- 审计字段
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz,
  archived_at       timestamptz
);

-- 索引
CREATE INDEX idx_reviews_status ON reviews(status);
CREATE INDEX idx_reviews_period ON reviews(period_start, period_end);
CREATE INDEX idx_reviews_type ON reviews(type);

-- JSONB 索引（用于查询 metrics）
CREATE INDEX idx_reviews_metrics ON reviews using gin(metrics);
```

---

### 2.4 系统流通对象表（Nexus 核心）

#### 2.4.1 context_snapshots（上下文快照表）

**设计决策**：ContextSnapshot 由 State Machine 在每次状态变更后同步生成，作为只读历史记录保留。

```sql
CREATE TABLE context_snapshots (
  id                text primary key default gen_random_uuid(),
  generated_at      timestamptz not null default now(),
  generated_by      text not null default 'state_machine',

  -- 当前时间信息
  current_time      timestamptz not null,
  current_date      date not null,
  day_of_week       integer not null check (day_of_week >= 0 and day_of_week <= 6),
  time_of_day       text not null check (time_of_day in ('morning', 'afternoon', 'evening', 'night')),

  -- 活跃对象汇总（JSONB）
  active_objectives   jsonb not null default '[]',
  active_key_results  jsonb not null default '[]',
  active_tasks        jsonb not null default '[]',
  pending_habits      jsonb not null default '[]',
  current_timebox     jsonb,
  upcoming_timeboxes  jsonb not null default '[]',
  pending_intentions  jsonb not null default '[]'
);

-- 索引
CREATE INDEX idx_context_snapshots_generated_at ON context_snapshots(generated_at DESC);

-- JSONB 索引（便于查询特定状态的任务/习惯）
CREATE INDEX idx_context_snapshots_tasks ON context_snapshots using gin(active_tasks);
CREATE INDEX idx_context_snapshots_habits ON context_snapshots using gin(pending_habits);

-- 保留策略：只保留最近 30 天的快照（通过定时任务清理）
```

#### 2.4.2 system_events（系统事件表）

**设计决策**：Event Bus 持久化所有 SystemEvent，支持事件重放与回滚。

```sql
CREATE TABLE system_events (
  id                text primary key default gen_random_uuid(),
  type              text not null,
  occurred_at       timestamptz not null default now(),
  triggered_by      text not null check (triggered_by in ('state_machine', 'time_trigger')),
  snapshot_id       text references context_snapshots(id) on delete set null,

  -- 事件负载
  payload           jsonb not null,

  -- 处理状态
  processed         boolean not null default false,
  processed_at      timestamptz
);

-- 索引
CREATE INDEX idx_system_events_type ON system_events(type);
CREATE INDEX idx_system_events_occurred_at ON system_events(occurred_at DESC);
CREATE INDEX idx_system_events_processed ON system_events(processed) where not processed;
CREATE INDEX idx_system_events_payload ON system_events using gin(payload);

-- 唯一约束：防止事件重复
CREATE UNIQUE INDEX uniq_system_events_id_type_occurred_at
  ON system_events(id, type, occurred_at);
```

---

### 2.5 Memory Framework 表（阶段二实现，MVP 预留）

#### 2.5.1 memories（记忆表）

**设计决策**：五层记忆合表存储，通过 `layer` 字段区分。

```sql
CREATE TABLE memories (
  id                text primary key default gen_random_uuid(),
  schema_version    integer not null default 1,

  -- 分层标识
  layer             text not null check (layer in ('session', 'episode', 'procedural', 'semantic', 'core')),

  -- 记忆内容
  content           jsonb not null,
  summary           text,

  -- 关联
  source_event_id   text references system_events(id) on delete set null,
  parent_memory_id  text references memories(id) on delete set null,

  -- 生命周期
  expires_at        timestamptz,  -- L1/L2 层记忆有过期时间

  -- 审计字段
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz
);

-- 索引
CREATE INDEX idx_memories_layer ON memories(layer);
CREATE INDEX idx_memories_expires_at ON memories(expires_at) where expires_at is not null;
CREATE INDEX idx_memories_source_event ON memories(source_event_id);
CREATE INDEX idx_memories_content ON memories using gin(content);

-- 自动清理过期记忆（通过定时任务）
```

#### 2.5.2 derived_signals（衍生信号表）

```sql
CREATE TABLE derived_signals (
  id                text primary key default gen_random_uuid(),

  -- 信号类型
  signal_type       text not null,
  signal_key        text not null,

  -- 信号值（JSONB 支持复杂结构）
  value             jsonb not null,

  -- 元数据
  confidence        numeric not null,  -- 0-1
  source_layer      text references memories(layer),  -- 来源记忆层

  -- 时间窗口
  window_start      timestamptz not null,
  window_end        timestamptz not null,

  -- 审计字段
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 唯一约束：同一类型、同一key、同一时间窗口只有一条记录
CREATE UNIQUE INDEX uniq_derived_signals_type_key_window
  ON derived_signals(signal_type, signal_key, window_start, window_end);

-- 索引
CREATE INDEX idx_derived_signals_type_key ON derived_signals(signal_type, signal_key);
CREATE INDEX idx_derived_signals_window ON derived_signals(window_start, window_end);
CREATE INDEX idx_derived_signals_value ON derived_signals using gin(value);
```

---

### 2.6 Action Surface 表（MVP 第一批）

#### 2.6.1 action_surfaces（行动切面表）

**设计决策**：存储每次生成的 Action Surface 快照，便于审计与调试。

```sql
CREATE TABLE action_surfaces (
  id                text primary key default gen_random_uuid(),
  snapshot_id       text not null references context_snapshots(id) on delete cascade,
  generated_at      timestamptz not null default now(),

  -- 三类行动切面（JSONB）
  guide             jsonb not null default '[]',
  tiles             jsonb not null default '[]',
  cues              jsonb not null default '[]'
);

-- 索引
CREATE INDEX idx_action_surfaces_snapshot ON action_surfaces(snapshot_id);
CREATE INDEX idx_action_surfaces_generated_at ON action_surfaces(generated_at DESC);

-- JSONB 索引
CREATE INDEX idx_action_surfaces_guide ON action_surfaces using gin(guide);
CREATE INDEX idx_action_surfaces_tiles ON action_surfaces using gin(tiles);
```

---

### 2.7 Intention 表（MVP 第一批）

#### 2.7.1 intentions（意图表）

```sql
CREATE TABLE intentions (
  id                text primary key default gen_random_uuid(),
  schema_version    integer not null default 1,

  -- USOM 字段
  status            text not null check (status in ('captured', 'clarified', 'routed', 'dissolved')),
  raw_input         text not null,
  input_mode        text not null check (input_mode in ('natural_language', 'template_form', 'slash_command')),
  source_snapshot_id text references context_snapshots(id) on delete set null,

  -- 审计字段
  notes             text,
  captured_at       timestamptz not null default now(),
  dissolved_at      timestamptz
);

-- 索引
CREATE INDEX idx_intentions_status ON intentions(status);
CREATE INDEX idx_intentions_captured_at ON intentions(captured_at DESC);
CREATE INDEX idx_intentions_source_snapshot ON intentions(source_snapshot_id);
```

---

## 三、视图与物化视图

### 3.1 当前状态视图（供 Repository 查询）

```sql
-- 当前活跃任务视图
CREATE VIEW v_active_tasks AS
SELECT
  id, title, status, priority, energy_required,
  estimated_duration, due_date, key_result_id,
  tags, created_at, updated_at
FROM tasks
WHERE status IN ('active', 'scheduled')
  AND archived_at IS NULL
ORDER BY
  CASE priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  due_date ASC NULLS LAST;

-- 今日待打卡习惯视图
CREATE VIEW v_today_pending_habits AS
SELECT
  h.id, h.title, h.scheduled_time, h.streak,
  h.completion_rate_7d, h.key_result_id,
  COALESCE(hl.status, 'pending') as log_status
FROM habits h
LEFT JOIN habit_logs hl
  ON h.id = hl.habit_id AND hl.date = CURRENT_DATE
WHERE h.status = 'active'
  AND h.archived_at IS NULL
  AND h.start_date <= CURRENT_DATE
  AND (h.end_date IS NULL OR h.end_date >= CURRENT_DATE)
ORDER BY h.scheduled_time;

-- 进行中的时间盒视图
CREATE VIEW v_running_timebox AS
SELECT
  id, title, status, start_time, end_time,
  task_ids, habit_ids, tags
FROM timeboxes
WHERE status IN ('running', 'paused')
ORDER BY start_time;
```

### 3.2 物化视图（阶段二优化）

```sql
-- OKR 进度汇总（阶段二实现）
-- CREATE MATERIALIZED VIEW mv_okr_progress AS ...
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_okr_progress;

-- 习惯统计数据（阶段二实现）
-- CREATE MATERIALIZED VIEW mv_habit_stats AS ...
```

---

## 四、数据库函数与触发器

### 4.1 自动更新 updated_at

```sql
-- 通用函数：更新 updated_at 字段
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为所有表添加触发器
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_habits_updated_at
  BEFORE UPDATE ON habits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_timeboxes_updated_at
  BEFORE UPDATE ON timeboxes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ... 其他表同理
```

### 4.2 Habit 状态自动转换

```sql
-- 函数：根据 startDate 自动将 Draft 状态的 Habit 转为 Active
CREATE OR REPLACE FUNCTION activate_habits_on_start_date()
RETURNS void AS $$
BEGIN
  UPDATE habits
  SET status = 'active'
  WHERE status = 'draft'
    AND start_date <= CURRENT_DATE
    AND archived_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- 定时任务：每天 00:00 执行
-- 通过应用层调度，不使用 pg_cron（保持数据库无状态）
```

### 4.3 KeyResult 进度率自动计算

```sql
-- 函数：自动计算 progress_rate
CREATE OR REPLACE FUNCTION update_keyresult_progress()
RETURNS TRIGGER AS $$
BEGIN
  NEW.progress_rate = CASE
    WHEN NEW.target_value > 0 THEN
      ROUND((NEW.current_value / NEW.target_value)::numeric, 4)
    ELSE
      0
  END;

  -- 自动更新状态
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

## 五、数据迁移策略

### 5.1 Drizzle Kit 配置

```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/db/schema',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;
```

### 5.2 迁移命令

```bash
# 生成迁移文件
npm run db:generate

# 执行迁移
npm run db:migrate

# 回滚（手动）
npm run db:studio  # 使用 Drizzle Studio 手动回滚
```

### 5.3 迁移命名规范

```
drizzle/
├── 0001_initial_schema.sql          # 初始表结构
├── 0002_add_okr_tables.sql          # 新增 OKR 表
├── 0003_add_reviews_table.sql       # 新增复盘表
├── 0004_add_memory_tables.sql       # 新增记忆表
├── 0005_add_action_surfaces.sql     # 新增行动切面表
└── ...
```

---

## 六、MVP 实现范围

### 第一批（Day 1 必须完成）

| 表名 | 说明 |
|---|---|
| `tasks` | 任务表 |
| `habits` | 习惯表 |
| `habit_logs` | 习惯打卡记录表 |
| `timeboxes` | 时间盒表 |
| `intentions` | 意图表 |
| `context_snapshots` | 上下文快照表 |
| `system_events` | 系统事件表 |
| `action_surfaces` | 行动切面表 |

### 第二批（OKR 路径）

| 表名 | 说明 |
|---|---|
| `objectives` | 目标表 |
| `key_results` | 关键结果表 |

### 第三批（复盘路径）

| 表名 | 说明 |
|---|---|
| `reviews` | 复盘表 |

### 预留接口，不实现

| 表名 | 说明 |
|---|---|
| `memories` | 记忆表（阶段二） |
| `derived_signals` | 衍生信号表（阶段二） |
| `external_events` | 外部事件表（阶段二，Connector Layer） |
| `external_payloads` | 外部负载表（阶段二，Connector Layer） |

---

## 七、Repository 接口定义（参考）

### 7.1 任务 Repository

```typescript
// src/lib/repositories/task.repository.ts

interface TaskRepository {
  // 创建任务
  create(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;

  // 查询任务
  findById(id: USOM_ID): Promise<Task | null>;
  findActive(options?: { limit?: number }): Promise<Task[]>;
  findByKeyResult(keyResultId: USOM_ID): Promise<Task[]>;

  // 更新任务
  update(id: USOM_ID, updates: Partial<Task>): Promise<Task>;

  // 状态转换
  transitionStatus(id: USOM_ID, newStatus: TaskStatus): Promise<Task>;

  // 软删除
  archive(id: USOM_ID): Promise<void>;
}

// Task 是 USOM 对象类型，不是 DB 行对象
```

### 7.2 ContextSnapshot Repository

```typescript
// src/lib/repositories/context-snapshot.repository.ts

interface ContextSnapshotRepository {
  // 生成快照（由 State Machine 调用）
  generate(): Promise<ContextSnapshot>;

  // 查询最新快照
  getLatest(): Promise<ContextSnapshot | null>;

  // 查询历史快照
  getHistory(since: Timestamp, limit?: number): Promise<ContextSnapshot[]>;
}
```

---

## 八、性能优化策略

### 8.1 索引策略

| 场景 | 索引类型 | 示例 |
|---|---|---|
| 状态过滤 | B-tree 部分索引 | `WHERE status = 'active' AND archived_at IS NULL` |
| 数组查询 | GIN 索引 | `tags @> ARRAY['work']` |
| JSONB 查询 | GIN 索引 | `payload->>'habitId' = 'xxx'` |
| 时间范围查询 | B-tree 索引 | `start_time >= now() AND start_time <= now() + interval '2 hours'` |

### 8.2 分页策略

```typescript
// 游标分页（推荐）
interface PaginationOptions {
  cursor?: string;    // 最后一条记录的 ID
  limit?: number;     // 默认 20，最大 100
}

interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}
```

### 8.3 查询优化

| 建议 | 说明 |
|---|---|---|
| 避免 SELECT * | 只查询需要的字段 |
| 使用部分索引 | 针对常见查询条件创建 WHERE 过滤的索引 |
| JSONB 慎用 | 频繁查询的字段应提取为独立列 |
| 连接优化 | 避免超过 3 表的 JOIN，考虑多次查询 |

---

## 九、备份与恢复策略

### 9.1 备份策略

| 类型 | 频率 | 保留期 |
|---|---|---|
| 完整备份 | 每天 02:00 | 30 天 |
| 增量备份 | 每小时 | 7 天 |
| WAL 归档 | 持续 | 7 天 |

### 9.2 恢复策略

```bash
# 恢复到指定时间点
pg_restore --dbname lifeware --clean --if-exists backup.dump

# 时间点恢复（PITR）
# 配置 recovery.conf 指定恢复目标时间
```

---

## 十、本文档的使用方式

- 数据库表结构变更必须先更新本文档，再执行迁移
- Repository 层开发者以本文档为表结构参考，不直接查看 Drizzle schema
- Drizzle schema 文件应与本文档完全对齐；二者不一致时以**本文档为准**
- 本文档版本号以文件名日期为准

---

*文档版本：2026_03_20*
*关联上级文档：LW_overall_总体设计_2026_03_18.md*
