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
- `LW_overall_总体设计_2026_05_02.md`（架构约束）
- `LW_overall_技术栈设计演进_2026_03_18.md`（技术约束）

**变更记录**：
- **2026_07_06 (refactor)**：[023.12] 三域生命周期语义重构 — `timeboxes.status` 枚举收窄 6→3 态（`planned | logged | cancelled`，删 `running | overtime | ended`）；`timeboxes` 表删除 3 个时间戳列 `started_at`/`ended_at`/`overtime_at`（drop CASCADE，TRUNCATE timeboxes 因数据可弃）。`cycles.status` 枚举收窄 5→4 态（`draft | approved | finished | reviewed`，删 `not_started | in_progress` 合并为 `approved`，`ended` 改名 `finished`）；`cycles.started_at` rename `approved_at`，`cycles.ended_at` rename `finished_at`（USOM 与 schema 同步，AM6）。`appointments.status` 枚举收窄 5→3 态（`scheduled | cancelled | completed`，删 `in_progress | expired` 改读时派生）；`appointments` 表删除 2 个时间戳列 `in_progress_at`/`expired_at`。三域各加 2 条 revert transition：timebox `logged|cancelled→planned`、appointment `cancelled|completed→scheduled`、cycle `reviewed→finished`（单步）。manifest `subscribed_events` 加 `TimeboxReverted`/`AppointmentReverted`/`CycleReverted`。`timeboxFieldMeta` 标记 deprecated（旧 3 个字段元数据不再被引用，保留以兼容历史数据）。**反向 [026] D2 reversal**：appointment 持久化模式从「lazy reconcile 写库」回到「读时派生」（理据见 design doc §与 [026] D2 reversal 的关系）。迁移 0034 落地（journal idx=34，down.sql 兜底）：`TRUNCATE timeboxes CASCADE` + `ALTER TABLE timeboxes DROP COLUMN IF EXISTS started_at/ended_at/overtime_at`；`ALTER TABLE cycles RENAME COLUMN started_at TO approved_at` + `RENAME COLUMN ended_at TO finished_at` + `TRUNCATE cycles CASCADE`；`TRUNCATE appointments CASCADE` + `DROP COLUMN IF EXISTS in_progress_at/expired_at`。CASCADE 影响：cycles TRUNCATE 级联清 `objectives`/`key_results`/`contributions`（数据可弃）；timeboxes TRUNCATE 级联清 `task_timeboxes`/`timebox_habits`（CASCADE 约束）。TRUNCATE CASCADE 链：timeboxes → task_timeboxes/timebox_habits/task_execution_logs.timebox_id SET NULL；cycles → objectives → key_results → contributions；appointments 无 FK 反向依赖。`memory_episodes.metadata` jsonb 软引用 timeboxId 留孤儿（无 FK，无读路径反向解析，[023.08] F4 决策）。USOM 文档同步（§3.5a/§3.9/§3.13 状态机收敛）。
- **2026_07_03 (refactor)**：[026] T20 — `user_settings.timezone` 段后新增「部署 TZ 约束」段（reconcile 调度依赖宿主 TZ，跨 TZ 部署需保持 dev/prod 一致或扩展 UTC 归一化，codex #5 落地）
- **2026_07_02 (refactor)**：[022.01] Phase 3 — 移除 Objective/KR 独立状态 — `objectives` 表删除 `status text` 列 + `status` CHECK 约束 + `idx_objectives_user_status` 索引；`key_results` 表删除 `status text` 列 + `status` CHECK 约束 + `idx_key_results_user_status` 索引。状态权威迁移至 `cycles.status`（§4.0）。迁移：idx=30（待 Task 6 落地）。`findAll` 过滤逻辑变更：`ne(status, 'archived')` → `discarded_at IS NULL AND archived_at IS NULL`。`paused` 语义永久丢失（迁移有损可接受）
- **2026_06_30 (refactor)**：[023] A3.2 UI 层接入 — `tasks.activity_archetype_id` / `habits.activity_archetype_id` 列说明补「UI 层已接入（CNUI 表单 + 详情只读）；FK ON DELETE SET NULL → 详情行整块不渲染（M3）」
- **2026_06_26 (refactor)**：OKR Domain 重组 [022] Tier-2 文档先行 — 新增 §4.0 `cycles` 表（OKR 周期一级对象，cycle_type/status/period_start/period_end/三时间戳，健康度读时聚合不落库）；`objectives` 表删除 `period_type`/`period_start`/`period_end` 三列 + `check_objectives_period_end_after_start` 约束 + `idx_objectives_period` 索引，新增 `cycle_id uuid NOT NULL REFERENCES cycles(id) ON DELETE RESTRICT` + `idx_objectives_cycle` 索引；周期信息上移至 cycles 表，Objective 经 cycle_id 归属；§11.2 映射表补 `Objective.cycleId` 与 `Objective.period`（派生）说明
- **2026_06_26 (refactor)**：[022] Phase 2 — 新增 §4.3 contributions 表（KR 贡献记录 junction）；§4.5 habits 表移除 `key_result_id` 列与 `idx_habits_key_result` 索引
- **2026_06_03 (refactor)**：Task Domain 重构 — `projects` → `threads` 表（`project_id` → `thread_id`，移除 `planning` 状态）；删除 `project_templates`/`task_templates` 表（MVP 不实现模板）；`tasks` 表新增双轴标签列（AI 维护：`clarity`/`complexity`/`decomposition`，用户管理：`capture_mode`/`energy_profile`/`scheduling_constraint`/`tracking`）+ `ai_tags` 扩展数据列；新增 8 个相关索引
- **2026_05_30 (enhancement)**：新增 `user_activities` 用户行为埋点表（统一分析入口，append-only，不走 Nexus 管道）；表结构总览新增"用户行为分析"分类
- **2026_05_28 (refactor)**：执行记录模型统一化 —— `habit_logs` 字段对齐 ExecutionRecord（`status` → `completion_status`，新增 `planned_duration`/`deviation_minutes`/`completion_rating`/`energy_level`，source 扩展 `'timebox_sync'`）；新增 `task_execution_logs` 表
- 2026_05_25 (sync)：同步代码变更 — 移除 tasks/projects/project_templates/task_templates 时间字段；更新 ai_sessions 表（新增 domain_id/action/session_mode，扩展状态枚举为 6 值）；新增 memory_episodes 表；system_events.triggered_by 新增 context_engine/handler；reviews.type 新增 semi_annual
- 2026_05_11 (enhancement)：objectives 新增 objective_number/priority 列、period_type 枚举新增 semi_annual
- 2026_05_11：objectives 表新增 okr_type/discarded_at 列、key_results 表新增 discarded_at 列、状态枚举新增 discarded
- 2026_05_09：habits 表时间模型升级（三字段时间窗口 + 双时长 + trackable）、新增 habit_templates 和 template_habits 表、timeboxes 状态枚举更新（paused→overtime, 新增 cancelled）、system_events.triggered_by 新增 template_apply
- 2026_06_30：DROP `habit_templates` + `template_habits`（[023] A3.3，已被 timebox-templates 取代）
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
├── user_calibration       ← 个人校准参数（Memory Framework / Rule Engine 使用）
└── energy_logs            ← 能量校准日志（日志记录，非 USOM 对象）

核心业务表（Core Objects）
├── cycles                 ← OKR 周期
├── objectives             ← OKR 目标
├── key_results            ← OKR 关键结果
├── contributions          ← OKR 贡献记录（junction）
├── threads                ← 主线（任务组织容器）
├── tasks                  ← 任务
├── habits                 ← 习惯
├── habit_logs             ← 习惯打卡记录（独立表）
├── timeboxes              ← 时间盒
├── appointments           ← 约定（[026]，[023.05] PR2 rename 自 itineraries，Cycle 模式 5 态存储 + 4 transition 时间戳）
├── task_execution_logs    ← 任务执行记录（新增 2026-05-28）
├── reviews                ← 复盘
└── activity_archetypes    ← 活动原型（[023] A1：7 L1 + 30 L2，配置类不走 SM）

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
├── derived_signals        ← Memory Framework 计算缓存（每用户一行）
└── user_audit_log         ← 用户操作审计日志（[023] A2 引入 0024 迁移；timebox_templates 等配置类 CUD 写入）

用户行为分析
└── user_activities        ← 用户行为埋点（统一分析入口，append-only）

时间盒模板配置
└── timebox_templates      ← 时间盒模板（[023] A2，7 段生存时间 + pull 订阅源，配置类不走 Nexus）

AI 与记忆
├── ai_sessions            ← AI 会话
├── user_settings          ← 用户设置（LLM 配置、UI 偏好）
└── memory_episodes        ← 记忆片段（Session 归档摘要）

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

### 4.0 cycles（OKR 周期表，一级对象）

对应 USOM `Cycle`。OKR 的周期归属对象，`objectives.cycle_id` 引用本表。周期本身独立于 Objective 存在，支持复用与跨周期对比。

> **[023.12] 2026-07-06 状态枚举收敛**：`status` enum 从 5 值 `draft | not_started | in_progress | ended | reviewed` 收敛为 4 值 `draft | approved | finished | reviewed`（`not_started` / `in_progress` 合并为 `approved`，`ended` 改名 `finished`）。时间戳字段重命名：`started_at → approved_at`、`ended_at → finished_at`（`reviewed_at` 不变）。Migration 0034 RENAME + 状态值随 TRUNCATE 清旧值后由 `schema.ts` `enum: [...]` 在 app 层约束（status 列是 TEXT，无 PG enum type）。
>
> **[023.12] TRUNCATE 说明**：cycles 表生产库无正式数据 → 0034 直接 `TRUNCATE cycles CASCADE` 清旧值（含 `not_started` / `in_progress` / `ended` 旧 status 行），`objectives` / `key_results` 表行一并清空（FK CASCADE 链）。

```sql
-- §4.0 cycles（OKR 周期表，一级对象）
-- v2 变更（2026-07-06, [023.12]）：status 5→4 态（删 not_started/in_progress，ended→finished）；
--   started_at/ended_at rename 为 approved_at/finished_at（语义诚实）。
CREATE TABLE cycles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version int NOT NULL DEFAULT 1,
  cycle_type    text NOT NULL,  -- enum: annual | quarterly | monthly | semi_annual | custom
  name          text NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  status        text NOT NULL,  -- [023.12] enum: draft | approved | finished | reviewed（原 5 值收敛 4 值）
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  approved_at   timestamptz,    -- [023.12] 原 started_at 重命名（status 进入 approved 的时刻）
  finished_at   timestamptz,    -- [023.12] 原 ended_at 重命名（status 进入 finished 的时刻）
  reviewed_at   timestamptz,    -- 不变
  CONSTRAINT check_cycles_period_end_after_start CHECK (period_end > period_start)
);
CREATE INDEX idx_cycles_user_status ON cycles(user_id, status);
CREATE INDEX idx_cycles_period ON cycles(user_id, period_start, period_end);
-- 注：总体健康度读时聚合、不落库（无 health_score 列）
```

> **设计说明**：`objectives` 不再自带 `period_type`/`period_start`/`period_end`，周期信息统一由 `cycles` 表承载，Objective 通过 `cycle_id` 外键归属。总体健康度（health_score）不落库，由 Repository 层读时聚合 KR 进度得出。

---

### 4.1 objectives（目标表）

对应 USOM `Objective`（v2 — since 2026-07-02: removed status column）。

> **v2 变更（2026-07-02，[022.01] Phase 3）**：移除 `status text` 列与 `status` CHECK 约束，同步移除 `idx_objectives_user_status` 索引。状态权威已迁移至 `cycles.status`（§4.0）。迁移：idx=30（待 Task 6 落地）。
>
> **`findAll` 过滤逻辑变更**：原 `ne(status, 'archived')` → `discarded_at IS NULL AND archived_at IS NULL`（discard 同步被排除，对齐 USOM 软删除语义）。

```sql
CREATE TABLE objectives (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  schema_version integer not null default 1,

  -- 查询关键字段（独立列）
  -- [022.01] Phase 3：移除 status 列（迁移 idx=30）
  okr_type    text not null default 'committed' check (okr_type in ('visionary', 'committed')),
  title       text not null,
  description text,

  -- 周期归属（查询关键）：周期信息由 cycles 表承载，Objective 通过 cycle_id 外键归属
  cycle_id    uuid NOT NULL REFERENCES cycles(id) ON DELETE RESTRICT,

  -- 编号与优先级
  objective_number TEXT,  -- 目标编号，格式如 26Q1-O1，创建时自动生成
  priority         TEXT NOT NULL DEFAULT 'P1' CHECK (priority IN ('P0', 'P1', 'P2')),  -- 重要程度

  -- 层级支持（自引用）
  parent_id   uuid references objectives(id) on delete set null,

  -- JSONB 允许：tags 不参与 WHERE 过滤（MVP 阶段）
  tags        jsonb not null default '[]',

  -- 审计字段
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  discarded_at timestamptz,
  archived_at  timestamptz
);

-- 索引
-- [022.01] Phase 3：移除 idx_objectives_user_status（迁移 idx=30）
CREATE INDEX idx_objectives_cycle ON objectives(user_id, cycle_id);
CREATE INDEX idx_objectives_parent ON objectives(parent_id) where parent_id is not null;
```

> **注意**：USOM 中 `keyResultIds` 是 `Objective` 的字段，但在 DB 层通过 `key_results.objective_id` 外键反向关联，不在 `objectives` 表中存储数组。Repository 层负责聚合。

---

### 4.2 key_results（关键结果表）

对应 USOM `KeyResult`（v2 — since 2026-07-02: removed status column）。

> **v2 变更（2026-07-02，[022.01] Phase 3）**：移除 `status text` 列与 `status` CHECK 约束，同步移除 `idx_key_results_user_status` 索引。完成语义由 `progress_rate` 承载（`progress_rate >= 1.0` → `completed_at` 自动设置）。迁移：idx=30（待 Task 6 落地）。
>
> **`findAll` 过滤逻辑变更**：原 `ne(status, 'archived')` → `discarded_at IS NULL AND archived_at IS NULL`（discard 同步被排除，对齐 USOM 软删除语义）。

```sql
CREATE TABLE key_results (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  schema_version integer not null default 1,

  -- 查询关键字段（独立列）
  -- [022.01] Phase 3：移除 status 列（迁移 idx=30）
  objective_id uuid not null references objectives(id) on delete cascade,
  title        text not null,
  description  text,

  -- 目标值字段
  target_value  numeric not null,
  current_value numeric not null default 0,
  unit          text not null,
  progress_rate numeric not null default 0,  -- 冗余字段，便于排序

  -- 信心度（[024] G2）
  confidence    integer not null default 50,  -- 达成信心度（0-100 百分比），默认 50

  -- 时间字段（查询关键）
  due_date     date,

  -- 审计字段
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  discarded_at timestamptz,
  archived_at  timestamptz
);

-- 索引
-- [022.01] Phase 3：移除 idx_key_results_user_status（迁移 idx=30）
CREATE INDEX idx_key_results_objective ON key_results(objective_id);
CREATE INDEX idx_key_results_due_date ON key_results(user_id, due_date) where due_date is not null;

-- 约束
ALTER TABLE key_results ADD CONSTRAINT check_key_results_target_positive
  CHECK (target_value > 0);
ALTER TABLE key_results ADD CONSTRAINT check_key_results_current_within_target
  CHECK (current_value >= 0 and current_value <= target_value);
ALTER TABLE key_results ADD CONSTRAINT check_key_results_confidence_range
  CHECK (confidence BETWEEN 0 AND 100);
```

| confidence | integer | NOT NULL | DEFAULT 50 | KR 达成信心度（0-100 百分比），选填，默认 50（CHECK 约束 confidence BETWEEN 0 AND 100） |

---

### 4.3 contributions（KR 贡献记录）

OKR 域私有 junction 表。一条记录 = 一个外部对象对 KR 的一次贡献链接。

```sql
CREATE TABLE contributions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version   integer NOT NULL DEFAULT 1,
  key_result_id    uuid NOT NULL REFERENCES key_results(id) ON DELETE CASCADE,
  contributor_type text NOT NULL CHECK (contributor_type IN ('task', 'habit', 'manual')),
  contributor_id   uuid NOT NULL,
  delta            numeric(10,2),
  weight           numeric(3,2) DEFAULT 1.0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(key_result_id, contributor_type, contributor_id)
);

CREATE INDEX idx_contributions_kr ON contributions(user_id, key_result_id);
CREATE INDEX idx_contributions_source ON contributions(contributor_type, contributor_id);
```

---

### 4.4 tasks（任务表）

对应 USOM `Task`。

```sql
CREATE TABLE tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  schema_version    integer not null default 1,

  -- 查询关键字段（独立列）
  status            text not null check (status in ('todo', 'planned', 'in_progress', 'completed', 'archived', 'deleted')),
  title             text not null,
  description       text,
  priority          text not null check (priority in ('critical', 'high', 'medium', 'low')),
  energy_required   text not null check (energy_required in ('high', 'medium', 'low')),
  estimated_duration integer,
  actual_duration   integer,

  -- 关联字段（查询关键）
  parent_id         uuid references tasks(id) on delete set null,  -- 父任务
  thread_id         uuid references threads(id) on delete set null,  -- 归属主线

  -- 时间字段（查询关键）
  due_date          date,

  -- 日期范围
  start_date date,  -- 周期性任务开始日期
  end_date   date,  -- 周期性任务结束日期

  -- JSONB 允许：tags 不参与 WHERE 过滤；recurrence MVP 不实现
  tags              jsonb not null default '[]',
  recurrence        jsonb,  -- RecurrenceRule，预留字段

  -- 审计字段
  notes             text,
  acceptance_criteria text,    -- 验收标准（占位）
  expected_output     text,    -- 预期产出物描述（占位）
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz,
  archived_at       timestamptz,

  -- ── AI 维护标签（认知轴）──
  clarity           text not null default 'fuzzy' check (clarity in ('fuzzy', 'scoped', 'actionable')),
  complexity        jsonb not null default '[]',  -- ComplexityTag[]
  decomposition     text check (decomposition in ('atomic', 'splittable', 'splitting_in_progress', 'decomposed')),

  -- ── 用户管理标签（执行轴）──
  capture_mode      text not null default 'ad_hoc' check (capture_mode in ('scheduled', 'ad_hoc', 'retrospective')),
  -- [023] A3.1：energy_profile 5 值 enum 已废弃，由 activity_archetype_id 取代
  --   迁移：0025（M1 加列+D4 backfill） + 0026（M2 删列）
  --   旧值映射：见下文「[023] A3.1 D4 映射表（永久记录）」
  activity_archetype_id uuid references activity_archetypes(id) on delete set null,  -- [023] A3.1：Activity Archetype FK（取代 energy_profile）；A3.2 UI 层已接入（CNUI 表单 + 详情只读）；FK ON DELETE SET NULL → 详情行整块不渲染（M3）
  scheduling_constraint text check (scheduling_constraint in ('hard_deadline', 'soft_target', 'opportunistic', 'recurring')),
  tracking          text not null default 'check_in' check (tracking in ('none', 'check_in', 'log', 'review')),

  -- ── AI 辅助扩展数据 ──
  ai_tags           jsonb not null default '{}',

  -- 约束
  constraint check_tasks_dates check (end_date is null or end_date >= start_date)
);

-- 索引
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX idx_tasks_user_clarity ON tasks(user_id, clarity);
CREATE INDEX idx_tasks_user_thread ON tasks(user_id, thread_id);
CREATE INDEX idx_tasks_user_parent ON tasks(user_id, parent_id);
CREATE INDEX idx_tasks_user_priority ON tasks(user_id, priority);
CREATE INDEX idx_tasks_user_archetype ON tasks(user_id, activity_archetype_id);  -- [023] A3.1：取代 idx_tasks_user_energy
CREATE INDEX idx_tasks_user_constraint ON tasks(user_id, scheduling_constraint);
CREATE INDEX idx_tasks_user_tracking ON tasks(user_id, tracking);
CREATE INDEX idx_tasks_due_date ON tasks(user_id, due_date);
```

---

### 4.4a threads（主线表）

对应 USOM `Thread`（替代原 `projects`）。

```sql
CREATE TABLE threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  schema_version integer not null default 1,

  -- 查询关键字段（独立列）
  name        text not null,
  description text,
  status      text not null check (status in ('active', 'paused', 'completed', 'archived')),

  -- 时间字段（查询关键）
  start_date  date,
  end_date    date,

  -- 其他
  priority    text check (priority in ('critical', 'high', 'medium', 'low')),
  color       text,

  -- JSONB 允许：tags 不参与 WHERE 过滤
  tags        jsonb not null default '[]',

  -- 审计字段
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz,
  archived_at   timestamptz
);

-- 索引
CREATE INDEX idx_threads_user_status ON threads(user_id, status);
CREATE INDEX idx_threads_user_start ON threads(user_id, start_date);
```

> **注意**：`project_templates` 和 `task_templates` 表已在 Task Domain 重构中移除（MVP 不实现模板功能）。

---

### 4.5 habits（习惯表）

对应 USOM `Habit`。

> **时间模型升级（2026-05-09）**：原 `scheduled_time` + `duration` 双字段升级为三字段时间窗口（`default_time` + `earliest_time` + `latest_start_time`）+ 双时长（`default_duration` + `min_duration`）+ 可追踪标记（`trackable`），支持弹性排程。

```sql
CREATE TABLE habits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  schema_version integer not null default 2,

  -- 查询关键字段（独立列）
  status       text not null check (status in ('draft', 'active', 'suspended', 'archived', 'deleted')),
  title        text not null,
  description  text,
  frequency_type text not null check (frequency_type in ('daily', 'weekly', 'custom')),

  -- 时间窗口（三字段弹性排程）
  default_time     text not null check (default_time ~ '^\d{2}:\d{2}$'),       -- 默认执行时间 HH:MM
  earliest_time    text not null check (earliest_time ~ '^\d{2}:\d{2}$'),      -- 最早可开始时间 HH:MM
  latest_start_time  text not null check (latest_start_time ~ '^\d{2}:\d{2}$'),   -- 最迟开始时间 HH:MM

  -- 时长（双时长模型）
  default_duration integer not null,  -- 默认执行时长（分钟）
  min_duration     integer not null,  -- 最短有效时长（分钟）

  -- 可追踪标记
  trackable    boolean not null default true,  -- true=可追踪打卡, false=仅占时（不计入 streak）

  -- ── Activity Archetype 归属 ──
  activity_archetype_id uuid references activity_archetypes(id) on delete set null,  -- [023] A3.1：Activity Archetype FK（任务类型归类）；A3.2 UI 层已接入（CNUI 表单 HabitForm + habit-card 小标签）；FK ON DELETE SET NULL

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
CREATE INDEX idx_habits_user_archetype ON habits(user_id, activity_archetype_id);  -- [023] A3.1
-- 注：idx_habits_key_result 已在 Phase 2 移除（迁移至 contributions junction）
```

---

### 4.5.1 [023] A3.1 迁移记录 + D4 永久映射表

**迁移**：

| 迁移 | 文件 | 性质 | 说明 |
|------|------|------|------|
| 0025 | `frontend/src/lib/db/migrations/0025_a3_m1_tasks_habits_archetype_id.sql` | M1 | tasks/habits 加 `activity_archetype_id` 列 + 索引 + D4 backfill（`energy_profile → activity_archetype_id`） |
| 0026 | `frontend/src/lib/db/migrations/0026_a3_m2_drop_tasks_energy_profile.sql` | M2 | tasks 删 `energy_profile` 列 + `idx_tasks_user_energy` 索引 |

> 设计背景：[023] A3 设计将任务的「能量画像 5 值 enum」升级为「Activity Archetype 分类引用」（语义更丰富：mental/physical/creative/social 四维 energy cost + L1/L2 层级）。[D11 B→C 迁移] 走两阶段：M1 加列 + backfill，M2 删旧列（保证可回滚）。

### [023] A3.1 D4 映射表（永久记录）

> M1 (0025) backfill 的 `tasks.energy_profile → activity_archetype_id` 映射。`light` 与 `admin` 合并到「日常事务」是不可逆决策（archetype seed 无独立「轻度工作」）。M2 (0026) 删 `energy_profile` 列后，本表为唯一回查入口。

| energy_profile | → archetype（l1=工作, l2Name） | 依据 |
|----------------|-------------------------------|------|
| `deep`     | 深度专注   | mental=9, 深度工作 |
| `creative` | 方案设计   | creative=9 |
| `admin`    | 日常事务   | mental=4, 行政琐事 |
| `light`    | 日常事务   | mental=4, 轻度低能耗 |
| `reactive` | 响应式工作 | 响应式 |

> 参考：[023] A3 design doc §3 D4 + §4.1 M1 backfill CASE。Seed L2 名逐字核对已通过 A3.1.1 Step 1.5 (R7)。

---

### 4.6 habit_logs（习惯打卡记录表）

对应 USOM `HabitLog`。独立表，不嵌套在 `habits` 内。

> **2026-05-28 变更**：
> - `status` → `completion_status`，值域统一为 `('completed', 'partially_completed', 'not_completed')`
> - 新增 `planned_duration`、`deviation_minutes`、`completion_rating`、`energy_level`
> - `source` 扩展 `'timebox_sync'`，标识由时间盒确认触发的级联打卡

```sql
CREATE TABLE habit_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  schema_version integer not null default 2,  -- schema_version 升级（2026-05-28）

  -- 查询关键字段（独立列）
  habit_id       uuid not null references habits(id) on delete cascade,
  date           date not null,
  completion_status text not null check (completion_status in ('completed', 'partially_completed', 'not_completed')),
  actual_duration  integer,
  planned_duration integer,        -- 新增（2026-05-28）
  deviation_minutes integer,       -- 新增（2026-05-28）

  -- 详细模式字段（可选）
  completion_rating integer,       -- 新增：完成评分 1-5（2026-05-28）
  energy_level     integer,        -- 新增：能量水平 1-10（2026-05-28）

  -- 审计字段
  note           text,
  logged_at      timestamptz not null default now(),
  source         text not null check (source in ('manual', 'connector', 'timebox_sync')) default 'manual'
);

-- 唯一约束：同一习惯同一天只能有一条打卡记录
CREATE UNIQUE INDEX uniq_habit_logs_habit_date ON habit_logs(habit_id, date);

-- 索引
CREATE INDEX idx_habit_logs_user_date ON habit_logs(user_id, date);
CREATE INDEX idx_habit_logs_habit_id ON habit_logs(habit_id);
```

---

### 4.7 timeboxes（时间盒表）

对应 USOM `Timebox`。

> **[023.12] 2026-07-06 状态枚举收敛 + 字段清理**：状态 enum 从 6 值 `planned | running | overtime | ended | cancelled | logged` 收敛为 3 值 `planned | logged | cancelled`（`running` / `overtime` / `ended` 时间派生态不持久化，由 `derive-display-status` 工具读时派生显示）。3 个时间戳列 `started_at` / `overtime_at` / `ended_at` 删除（migration 0034 `DROP COLUMN IF EXISTS`，TRUNCATE 清旧值后由 `schema.ts` `enum: [...]` 在 app 层约束 status 合法值；status 列是 TEXT，无 PG enum type）。
>
> **[023.12] 新增可修改性规则**：planned 可编辑/可删；logged/cancelled 不可编辑/不可删，但可经 `revert` action 回退到 planned。`revert` 守卫：若 `executionRecord != null`（logged 行）抛"请先清理执行记录再回退"（[023.12] D7），等价于 logged→planned 路径被拦截（logged 行必有 executionRecord），仅 cancelled→planned 可直接回退。

```sql
-- v2 变更（2026-07-06, [023.12]）：status 6→3 态（删 running/overtime/ended 改读时派生）；删 3 个时间戳列。
CREATE TABLE timeboxes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  schema_version integer not null default 2,

  -- 查询关键字段（独立列）
  status        text not null check (status in ('planned', 'logged', 'cancelled')),  -- [023.12] 6 值→3 值
  title         text not null,
  start_time    timestamptz not null,
  end_time      timestamptz not null,
  is_recurring  boolean not null default false,

  -- JSONB 允许：recurrence_rule MVP 不实现；tags 不参与 WHERE 过滤
  recurrence_rule jsonb,
  tags            jsonb not null default '[]',

  -- [023] A2: 关联活动原型，nullable（logTimebox 时带入能量消耗源）
  activity_archetype_id  uuid  REFERENCES activity_archetypes(id) ON DELETE SET NULL,

  -- JSONB 允许：执行记录，记录实际执行情况
  -- [023.13] JSONB 形状扩展 4 可选字段 actualStartTime/actualEndTime/focusMinutes/energyActual（USOM DetailedExecutionRecord），免 DDL 迁移
  execution_record jsonb,  -- ExecutionRecord（SimpleExecutionRecord | DetailedExecutionRecord）

  -- [023] A2 OV#P1-#2: USOM taskIds/habitIds 落库列（软关联，无 FK；强一致性由 Repository 负责）
  task_ids  uuid[] not null default '{}',
  habit_ids uuid[] not null default '{}',

  -- 审计字段
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- [023.12] 移除 started_at / overtime_at / ended_at 三列（时间派生态不持久化）
  logged_at     timestamptz
);

-- 索引
CREATE INDEX idx_timeboxes_user_status ON timeboxes(user_id, status);
CREATE INDEX idx_timeboxes_user_start ON timeboxes(user_id, start_time);
CREATE INDEX idx_timeboxes_user_end ON timeboxes(user_id, end_time);
-- [023] A2: 用户维度按 archetype 过滤
CREATE INDEX idx_timeboxes_user_archetype ON timeboxes(user_id, activity_archetype_id);

-- 约束
ALTER TABLE timeboxes ADD CONSTRAINT check_timeboxes_end_after_start
  CHECK (end_time > start_time);
```

> **注意**：`taskIds` 和 `habitIds` 软关联落库于本表 `task_ids` / `habit_ids`（[023] A2 OV#P1-#2 起）；`timebox_tasks` / `timebox_habits` 关联表仍保留供后续扩展（强一致性写入路径使用），USOM 中的数组字段在 Repository 层读取 `task_ids` / `habit_ids` 列后注入到 USOM 对象。`activityArchetypeId` 强外键引用 `activity_archetypes.id`，ON DELETE SET NULL。

### 时间盒重叠规则（[023.04]）

CNUI 提交时间盒时按两层校验：

1. **客户端预检**：`assertNoInternalOverlap`（`frontend/src/domains/timebox/lib/overlap.ts`）
   - 扫同日 batch 内多条是否区间重叠（半开：end==start 不算）
   - 命中 → 提交按钮 disabled + 红字提示
2. **服务端兜底**：`TimeOverlapRule`（`frontend/src/nexus/core/rule-engine/rules/timebox-overlap.ts`）
   - 读 `intent.fields.endTime`（[023] A2 OV#P1-#1 后 duration 已撤）
   - [023.12] `activeStatuses` 收窄为 `['planned']`（`running`/`overtime` 不再持久化，只对 planned 区间做 SQL 重叠检查；显示态 running/overtime 由 derive 函数表达，不参与重叠判定）
   - 与 `status = 'planned'` 且区间重叠 → severity=confirm
   - 与 `status ∈ {cancelled, logged}` 重叠 → pass（不阻断）

数据库层无唯一性约束；重叠允许但有提示用户确认。

---

### 4.7a task_execution_logs（任务执行记录表，新增 2026-05-28）

对应 USOM `Task.lastExecutionRecord` 的历史存储。Task 可能跨多个 Timebox 分段执行，需要独立表记录完整历史。

> 设计决策：与 `habit_logs` 对齐字段结构，确保跨 Domain 执行记录的语义一致性。
> 与 `timeboxes.execution_record`（JSONB）不同：`task_execution_logs` 是 1:N 关系，一个 Task 可在多个 Timebox 中执行。

```sql
CREATE TABLE task_execution_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  schema_version integer not null default 1,

  -- 关联字段（查询关键）
  task_id        uuid not null references tasks(id) on delete cascade,
  timebox_id     uuid references timeboxes(id) on delete set null,  -- 关联的 timebox（可为空）

  -- 执行记录字段（与 ExecutionRecord 对齐）
  completion_status text not null check (completion_status in ('completed', 'partially_completed', 'not_completed')),
  actual_duration   integer,
  planned_duration  integer,
  deviation_minutes integer,

  -- 详细模式字段（可选）
  completion_rating integer,
  actual_output     text,
  deviation_reasons text,
  energy_level      integer,

  -- 审计字段
  note           text,
  logged_at      timestamptz not null default now(),
  source         text not null check (source in ('manual', 'timebox_sync')) default 'manual'
);

-- 索引
CREATE INDEX idx_task_exec_logs_user_task ON task_execution_logs(user_id, task_id);
CREATE INDEX idx_task_exec_logs_timebox ON task_execution_logs(timebox_id);
CREATE INDEX idx_task_exec_logs_user_logged ON task_execution_logs(user_id, logged_at desc);
```

---

### 4.X appointments（约定表，[026]，[023.05] PR2 rename，[023.12] 反转 D2 reversal）

对应 USOM `Appointment`。

> **[023.12] 2026-07-06 反转 D2 reversal 回读时派生模式**（与 [026] D2 reversal 关系详见 `docs/usom-design.md` §3.13）：状态 enum 从 5 值 `scheduled | in_progress | expired | cancelled | completed` 收敛为 3 值 `scheduled | cancelled | completed`（`in_progress` / `expired` 不持久化，由 `derive-display-status` 读时派生）。2 个时间戳列 `in_progress_at` / `expired_at` 删除（migration 0034 `DROP COLUMN IF EXISTS`，TRUNCATE 清旧值后由 `schema.ts` `enum: [...]` 在 app 层约束；status 列是 TEXT，无 PG enum type）。
>
> **DDL 实现在 T2 迁移（手写 SQL + psql + 登记 journal，idx=31）落地**；本节先登记列/索引契约供 Repository 与 server actions 引用。

```sql
-- T2 迁移落地 SQL 草案（DDL 在 0031 迁移精确化；0033 RENAME 为 appointments；0034 删 2 个时间戳列）
CREATE TABLE appointments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  schema_version  integer not null default 1,

  -- 核心业务字段
  status          text not null check (status in ('scheduled', 'cancelled', 'completed')),  -- [023.12] 5 值→3 值
  title           text not null,
  detail          text,                    -- 活动详情，可空
  start_time      timestamptz not null,    -- 开始时间（UTC 存）
  duration_min    integer not null,        -- 时长（分钟）；end_time = start_time + duration_min 派生
  people          text[] not null default '{}',  -- 关系人（纯文本，D1=A）

  -- 2 个用户操作 transition 时间戳（[023.12] 移除 in_progress_at / expired_at 两个时间派生态时间戳）
  completed_at    timestamptz,             -- →completed 时盖（[023.12] 正式启用，[027] 由 timebox 打卡联动）
  cancelled_at    timestamptz,             -- →cancelled 时盖

  -- [026.01] archetype FK（nullable，archetype 删除时 appointment 保留）
  activity_archetype_id uuid REFERENCES activity_archetypes(id) ON DELETE SET NULL,

  -- 审计字段
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 索引
CREATE INDEX idx_appointments_user_status_start ON appointments(user_id, status, start_time);
CREATE INDEX idx_appointments_user_status       ON appointments(user_id, status);
-- [026.01] archetype 反向查询索引
CREATE INDEX idx_appointments_archetype         ON appointments(activity_archetype_id);
```

**设计要点**：
- `end_time` 不存列：派生 = `start_time + duration_min * interval '1 minute'`，与 USOM 注释一致；调度查询用 `tstzrange` 表达式。
- 2 时间戳 nullable（[023.12] 收敛）：只在用户操作 transition 触发时盖（cancelled/completed）；初始创建后仅 `created_at`/`updated_at` 有值。`in_progress_at` / `expired_at` 已删除——这两态由 `derive-display-status` 派生显示。
- 状态枚举与 USOM `AppointmentStatus` 3 值严格对齐；CHECK 约束由迁移 SQL 加。
- `people` 是 `text[]`（D1=A，关系人纯文本），不引入 relation 表。
- **[023.12] 派生 in_progress/expired 的数据源**：`status='scheduled'` 行的 `start_time`（UTC 存，按本地时区换算日历日）由 `derive-display-status` 工具在读取时按 `now` 与 `start_time` 日历日关系派生。SQL 级"查过期约定"不再可能——单用户 MVP 可接受；报表/分析需求时再考虑物化视图。

**[026] A3 SHIP（2026_07_03）**：表 DDL 已通过 T2 迁移 0031 手写落地（dev DB lifeware_dev@localhost:5432，journal idx=31）。`AppointmentRepository` 5 方法（findById/save/updateFields/findByDateRange/findNeedingReconcile）+ 双 mutation service（timebox/appointment 事件类型分离，D2 reversal 决议 A）+ lazy reconcile（`reconcileAndAdvanceAppointments` 页面 server component 加载时跑）。GrowthMenu 集成 4 intent_trigger 自动归 timebox 组（registry 自动分组，零代码改动）。详情见 CHANGELOG.md `## Itinerary 域（[026]）`。

**[023.05] PR2（2026_07_05）**：0033_rename_itineraries_to_appointments.sql（RENAME TABLE + 2 INDEX，journal idx=33）+ 全层重命名。

**[023.12] 反转（2026_07_06）**：appointment lifecycle 从 [026] 5 态存储 + lazy reconcile 反转回读时派生模式（持久态 3 值 + 派生 in_progress/expired badge）。`reconcile-appointment.ts` 改造为纯派生函数；`reconcile-appointments.ts` plural 写库入口删除；migration 0034 删除 `in_progress_at` / `expired_at` 两列。详见 CHANGELOG.md `## [023.12]`。

**[023.05] F2 snapshot drift acknowledge**：drizzle snapshot 停在 `0006_snapshot.json`，0007+ 全手写无 snapshot。本表 0033 RENAME 后 `schema.ts` 写 `pgTable('appointments')`，未来 `drizzle-kit generate` 会生成 `CREATE TABLE appointments`（表已存在）→ apply 失败。**决议**：维持手写迁移 convention，未来 appointments 表 schema 变更继续手写 SQL + 登记 journal；**不引入 `drizzle-kit up`**。

**[026.01] archetype 全链路接入（2026_07_07）**：`appointments` 表加 `activity_archetype_id uuid REFERENCES activity_archetypes(id) ON DELETE SET NULL` 列（nullable，archetype 删除时 appointment 保留）+ 索引 `idx_appointments_archetype ON appointments(activity_archetype_id)`（反向查询：列出某 archetype 的所有约定）。migration 编号 `0035_026_01_appointment_archetype_fk.sql`（IF NOT EXISTS 幂等 + 单独 DROP INDEX/INDEX/COLUMN down 兜底）。schema.ts 与 mapper 双向读写 archetype。详见 CHANGELOG.md `## [026.01]`。

### 迁移 0034 — 三域 lifecycle 简化（[023.12] 2026-07-06）

**目的**：[023.12] 把三域（timebox / cycle / appointment）持久态收敛到「只跟踪用户行为」——移除时间派生态相关列（timebox 3 列 + appointment 2 列）+ cycle 2 列重命名（语义对齐 status）。数据可弃（生产库无正式数据），TRUNCATE 清旧值（含旧 status 值）+ DROP COLUMN 废弃列 + RENAME cycle 时间戳列。**零 DDL on status**（status 列是 plain TEXT，无 PG enum type ——schema.ts 实际 `text('status', { enum: [...] })` 仅 app 层 union 约束，无 `pgEnum`）。`schema.ts` 改 `enum: [...]` 数组在 app 层承接 status 合法值集合。

**journal 登记**：idx=34（手写迁移规范 `[[project-drizzle-migrations-handwritten]]`）。文件：`frontend/src/lib/db/migrations/0034_023_12_lifecycle_simplify.sql` + `.down.sql`（反向重建废弃列，prod 不需要，dev 回滚兜底）。

```sql
-- 0034_023_12_lifecycle_simplify.sql 摘要

-- timeboxes: TRUNCATE 清旧值（含 running/overtime/ended 旧 status 行）+ DROP 3 个时间戳列
TRUNCATE timeboxes CASCADE;
ALTER TABLE timeboxes DROP COLUMN IF EXISTS started_at;
ALTER TABLE timeboxes DROP COLUMN IF EXISTS ended_at;
ALTER TABLE timeboxes DROP COLUMN IF EXISTS overtime_at;

-- cycles: status 列保留 TEXT（无废弃列），仅 TRUNCATE 清旧值 + RENAME 2 个时间戳列
TRUNCATE cycles CASCADE;
ALTER TABLE cycles RENAME COLUMN started_at TO approved_at;
ALTER TABLE cycles RENAME COLUMN ended_at   TO finished_at;

-- appointments: TRUNCATE 清旧值（含 in_progress/expired 旧 status 行）+ DROP 2 个时间戳列
TRUNCATE appointments CASCADE;
ALTER TABLE appointments DROP COLUMN IF EXISTS in_progress_at;
ALTER TABLE appointments DROP COLUMN IF EXISTS expired_at;
```

**CASCADE 影响**（schema FK 核对）：
- `TRUNCATE timeboxes CASCADE` → 清空 `task_timeboxes`（CASCADE junction）、`timebox_habits`（CASCADE junction）；`task_execution_logs.timebox_id` SET NULL（行留，列置空）。
- `TRUNCATE cycles CASCADE` → 清空 `objectives`（`cycleId` 虽 RESTRICT，但 TRUNCATE CASCADE 绕过 restrict 校验仍清空）→ 级联清空 `key_results`（FK to objectives CASCADE）。
- `TRUNCATE appointments CASCADE` → 无 FK 反向依赖（schema grep 0 hits），CASCADE 实际 no-op。
- `memory_episodes.metadata` jsonb 软引用：[023.08] F4 batch undo 通过 EpisodeRepository 把 timeboxId 写入 memory_episodes.metadata，TRUNCATE timeboxes 不动该表 → 留孤儿软引用。决议：接受孤儿（无 FK、无读路径反向解析 timeboxId，undo 已 ship 的 batch 仅作审计痕迹）。

**status 列合法值集合（[023.12] 收敛后，由 `schema.ts` `enum: [...]` 在 app 层约束）**：
- `timeboxes.status` ∈ {`planned`, `logged`, `cancelled`}
- `cycles.status` ∈ {`draft`, `approved`, `finished`, `reviewed`}
- `appointments.status` ∈ {`scheduled`, `cancelled`, `completed`}

---

### 4.8 reviews（复盘表）

对应 USOM `Review`。

```sql
CREATE TABLE reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  schema_version integer not null default 1,

  -- 查询关键字段（独立列）
  status      text not null check (status in ('draft', 'in_progress', 'completed', 'archived')),
  type        text not null check (type in ('daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual')),
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
  triggered_by text not null check (triggered_by in ('state_machine', 'time_trigger', 'template_apply', 'context_engine', 'handler')),
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

### 7.5 user_activities（用户行为埋点表）

纯分析基础设施，不走 Nexus 管道（Intent Engine / Rule Engine / State Machine）。记录用户在 AI 助手、GrowthMenu、页面导航、CNUI 操作中的行为数据，支持常用意图统计和软件使用分析。

**设计决策**：与 `structured_intents`（Nexus 管道业务记录）分离，`user_activities` 是唯一的统计分析入口。

```sql
CREATE TABLE user_activities (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,

  -- 查询关键字段（独立列）
  activity_type  text not null check (activity_type in ('intent_execute', 'menu_click', 'page_navigate', 'cnui_action')),
  source         text not null check (source in ('ai_assistant', 'growth_menu', 'shortcut', 'page_route', 'cnui_surface')),
  target_domain  text,
  target_action  text,

  -- JSONB 允许：附加上下文信息，不参与 WHERE 过滤
  metadata       jsonb not null default '{}',

  -- 审计字段
  created_at     timestamptz not null default now()
);

-- 索引
CREATE INDEX idx_user_activities_user_time ON user_activities(user_id, created_at);
CREATE INDEX idx_user_activities_type ON user_activities(user_id, activity_type, created_at);
```

> **写入方式**：通过 `recordActivity()` Server Action 显式调用，fire-and-forget（不阻塞业务流程）。写入失败不影响业务逻辑。
>
> **聚合查询**：`fetchFrequentIntents()` 使用时间衰减窗口（半衰期 7 天，查询窗口 30 天），`GROUP BY (target_domain, target_action)` 加权排序。

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

### activity_archetypes（活动原型）

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | uuid | PK, DEFAULT gen_random_uuid() | 主键 |
| user_id | uuid | NOT NULL, FK→users(id) ON DELETE CASCADE | 多租户隔离 |
| schema_version | integer | NOT NULL DEFAULT 1 | USOM 版本号 |
| l1_category | text | NOT NULL | L1 一级分类（7 选 1） |
| l2_name | text | NOT NULL | L2 二级名称 |
| energy_cost | jsonb | NOT NULL | EnergyCost 4 维 `{physical,mental,emotional,creative}` |
| activity_label | jsonb | NOT NULL DEFAULT '{}' | ActivityLabel 6 维 |
| synonyms | jsonb | NOT NULL DEFAULT '[]' | 同义词/范围描述数组，用于标题匹配 |
| is_system | boolean | NOT NULL DEFAULT false | 系统内置，不可删除 |
| created_at | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| updated_at | timestamptz | NOT NULL DEFAULT now() | 更新时间 |

索引：`(user_id, l1_category)`、`(user_id, is_system)`

### user_audit_log（用户操作审计日志）

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | uuid | PK, DEFAULT gen_random_uuid() | 主键 |
| user_id | uuid | NOT NULL, FK→users(id) ON DELETE CASCADE | 操作人 |
| table_name | text | NOT NULL | 被操作的表名 |
| record_id | uuid | NOT NULL | 被操作的记录 ID |
| action | text | NOT NULL, CHECK(IN('create','update','delete')) | 操作类型 |
| changed_fields | jsonb | | 变更字段列表 |
| old_values | jsonb | | 变更前值（create 时为 null） |
| new_values | jsonb | | 变更后值（delete 时为 null） |
| created_at | timestamptz | NOT NULL DEFAULT now() | 操作时间 |

索引：`(user_id, table_name, created_at DESC)`、`(user_id, created_at DESC)`

### timebox_templates（时间盒模板，[023-02]）

用户定义的时间盒模板。`rows`（有序行列表）描述时间安排行（来源 = 习惯/任务/主线/自定义），`days_of_week`（模板级星期数组）描述应用范围（`[]` = 不限）。**配置类实体**，不走 SM，每次 CUD 写 `user_audit_log`。

```sql
-- [023-02] 0032：rows 列表 + 模板级 days_of_week，移除 survival_segments + 3 订阅列
CREATE TABLE timebox_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version  integer NOT NULL DEFAULT 1,
  name            text NOT NULL,
  days_of_week    jsonb NOT NULL DEFAULT '[0,1,2,3,4,5,6]'::jsonb,
  rows            jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_timebox_templates_user ON timebox_templates(user_id);
```

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | uuid | PK, DEFAULT gen_random_uuid() | 主键 |
| user_id | uuid | NOT NULL, FK→users(id) ON DELETE CASCADE | 多租户隔离 |
| schema_version | integer | NOT NULL DEFAULT 1 | USOM 版本号 |
| name | text | NOT NULL | 模板名称 |
| days_of_week | jsonb | NOT NULL DEFAULT `[0,1,2,3,4,5,6]` | 模板级星期，0=周日..6=周六；`[]`=不限 |
| rows | jsonb | NOT NULL DEFAULT `[]` | 有序行列表，每行 `{id, activityName, start, end, source, sourceId?}` |
| created_at | timestamptz | NOT NULL DEFAULT now() | 创建时间 |
| updated_at | timestamptz | NOT NULL DEFAULT now() | 更新时间 |

索引：`(user_id)`

**迁移**：`frontend/src/lib/db/migrations/0032_023_02_timebox_template_redesign.sql`（手写，`IF [NOT] EXISTS` 幂等）

**迁移说明**（0032）：
- ADD COLUMN `rows` / `days_of_week`，缺省分别为 `[]` / `[0,1,2,3,4,5,6]`。
- 若 `survival_segments` 列仍存在，旧 7 段回填为 7 条 `source='custom'` 的行（activityName 对应段名中文：`起床/晨间/上午上班/午间/下午上班/晚间/睡眠`），仅当 `rows='[]'` 时回填（防覆盖已编辑数据）。
- DROP `survival_segments` / `subscribed_habits` / `subscribed_tasks` / `subscribed_threads`（已无下游消费者，spec §0 确认）。
- 行 id 用 `md5('seg-<key>')::text` 生成稳定值，便于后续 row 级引用。

**行来源（`rows[].source`）**：
- `custom`：用户手填活动名 + 起止时间。
- `habit`：行 `activityName` / `start` / `end` 由 server action `fetchSubscriptionSources` 从 `defaultTime` + `defaultDuration` 推算，UI 端起止锁时。
- `task` / `thread`：行 `activityName` 由对象 title resolve；起止时间由用户手填。

**A3 owner-check**：`create`/`update` 写入前遍历 `rows` 收集 `source∈{habit,task,thread}` 的 `sourceId`，按来源分组去重后分别校验归属（habits / tasks / threads 三张表）。任一 id 不归属或不存在则抛错。`update()` 在 `old.rows === input.rows`（引用相等）时跳过 owner-check，避免无谓的全表 inArray。

**配置管理权限（OQ-7）**：TimeboxTemplate 修改是配置变更（非业务执行写入口），走 Intent Engine 路由 + Repository 直写 + `user_audit_log`。不走 SM（无 lifecycle），无需 Rule Engine 校验。

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
  estimated_duration, due_date, thread_id, parent_id,
  tags, created_at, updated_at
FROM tasks
WHERE status IN ('todo', 'planned', 'in_progress')
  AND archived_at IS NULL;

-- 今日待打卡习惯视图
CREATE VIEW v_today_pending_habits AS
SELECT
  h.id, h.user_id, h.title, h.default_time, h.trackable, h.streak,
  h.completion_rate_7d,
  COALESCE(hl.completion_status, 'pending') as log_status
FROM habits h
LEFT JOIN habit_logs hl
  ON h.id = hl.habit_id AND hl.date = CURRENT_DATE
WHERE h.status = 'active'
  AND h.trackable = true
  AND h.archived_at IS NULL
  AND h.start_date <= CURRENT_DATE
  AND (h.end_date IS NULL OR h.end_date >= CURRENT_DATE);

-- 进行中的时间盒视图
CREATE VIEW v_running_timeboxes AS
SELECT
  id, user_id, title, status, start_time, end_time, tags
FROM timeboxes
WHERE status IN ('running', 'overtime');
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
| `Objective.cycleId` | `cycle_id` uuid | snake_case 映射；外键指向 `cycles(id)`，ON DELETE RESTRICT |
| `Objective.period` | 不存储（派生只读） | Repository 读时 join `cycles` 表，按 `cycle_id` 填充 `{type, start, end}` |
| `Objective.okrType` | `okr_type` text | snake_case 映射 |
| `Objective.discardedAt` | `discarded_at` timestamptz | snake_case 映射 |
| `KeyResult.discardedAt` | `discarded_at` timestamptz | snake_case 映射 |
| `Timebox.taskIds` | `timebox_tasks` 关联表 | Repository 联查后聚合为数组 |
| `Timebox.habitIds` | `timebox_habits` 关联表 | 同上 |
| `Timebox.executionRecord` | `execution_record` JSONB | 直接 JSON 序列化/反序列化 |
| `Habit.frequency` | 拆为 `frequency_type` + `days_of_week` | Repository 组装为 `HabitFrequency` 对象 |
| `Habit.defaultTime` | `default_time` text | snake_case 映射 |
| `Habit.earliestTime` | `earliest_time` text | snake_case 映射 |
| `Habit.latestStartTime` | `latest_start_time` text | snake_case 映射 |
| `Habit.defaultDuration` | `default_duration` integer | snake_case 映射 |
| `Habit.minDuration` | `min_duration` integer | snake_case 映射 |
| `HabitTemplate.habits` | （已 DROP 2026-06-30）| [023] A3.3 硬删，迁移 0027 |
| `Review.sections` | JSONB | 直接 JSON 序列化/反序列化 |
| `Review.metrics` | JSONB | 同上 |
| `Task.tags` / `Habit.tags` | JSONB | `string[]` 序列化 |
| `Task.lastExecutionRecord` | `task_execution_logs` 表 | Repository 联查后注入 |
| `HabitLog.status` | `completion_status` text | 值映射：completed/skipped/partial → completed/not_completed/partially_completed |
| `Contribution.keyResultId` | `key_result_id` uuid | snake_case 映射，FK → key_results(id) ON DELETE CASCADE |
| `Contribution.contributorType` | `contributor_type` text | snake_case 映射，CHECK IN ('task', 'habit', 'manual') |
| `Contribution.contributorId` | `contributor_id` uuid | snake_case 映射，对 OKR 不透明引用 |
| `Contribution.delta` | `delta` numeric(10,2) | snake_case 映射，可选 |
| `Contribution.weight` | `weight` numeric(3,2) | snake_case 映射，默认 1.0 |

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
|  | 任务执行记录表（新增 2026-05-28） |
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

### 第四批（AI 会话与记忆）

| 表名 | 说明 |
|---|---|
| `ai_sessions` | AI 会话表 |
| `user_settings` | 用户设置表 |
| `memory_episodes` | 记忆片段表 |
| `threads` | 主线表（替代原 projects） |
| `energy_logs` | 能量日志表 |

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

## 8.x 新增表：AI 会话与用户设置

### `ai_sessions`

| 列名 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | UUID | PK, defaultRandom() | 主键 |
| `user_id` | UUID | NOT NULL, FK→users(id) ON DELETE CASCADE | 所属用户 |
| `title` | TEXT | NOT NULL, DEFAULT '新对话' | 会话标题 |
| `status` | TEXT | NOT NULL, DEFAULT 'created', ENUM(created/active/completing/archived/deleted/closed) | 状态 |
| `domain_id` | TEXT | NULLABLE | 关联的 Domain ID |
| `action` | TEXT | NULLABLE | 触发的 action |
| `session_mode` | TEXT | NOT NULL, DEFAULT 'single_shot' | 会话模式 |
| `messages` | JSONB | NOT NULL, DEFAULT [] | ChatMessage[] |
| `state_snapshot` | JSONB | NOT NULL, DEFAULT {} | 状态快照 |
| `referenced_object_ids` | JSONB | NOT NULL, DEFAULT [] | 引用对象 ID 列表 |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 更新时间 |
| `archived_at` | TIMESTAMPTZ | NULLABLE | 归档时间 |

索引：
- `idx_ai_sessions_user_status` ON (user_id, status)
- `idx_ai_sessions_updated` ON (user_id, updated_at)

### `user_settings`

| 列名 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | UUID | PK, defaultRandom() | 主键 |
| `user_id` | UUID | NOT NULL, FK→users(id) ON DELETE CASCADE, UNIQUE | 用户（一对一） |
| `timezone` | TEXT | NOT NULL, DEFAULT 'Asia/Shanghai' | 时区 |
| `llm_config` | JSONB | NULLABLE | LLMConfig |
| `ui_prefs` | JSONB | NULLABLE | UI 偏好 |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 更新时间 |

索引：
- `uniq_user_settings_user` UNIQUE ON (user_id)

#### 部署 TZ 约束（[026] T20 codex #5 落地）

`user_settings.timezone` 列存的是**用户级**偏好（默认 `'Asia/Shanghai'`），用于前端展示与个性化。但 **reconcile 调度（`reconcile-appointment.ts` / `reconcile-appointments.ts` 的 `localDayKey`）依赖宿主进程本地时区**，即 Next.js server runtime 的系统 TZ，而不是 user_settings.timezone。

这意味着：
- **dev / staging / prod 三套环境的宿主 TZ 必须一致**（如都设为 `Asia/Shanghai` 或都设为 UTC），否则同一约定在不同环境的"今日 / 昨日"判定不一致。
- **跨 TZ 部署**（如北京 dev + 弗吉尼亚 prod）会引入「同一日历日歧义」——同一时刻在两地分属不同 localDayKey，reconcile 推进节奏会偏移。
- 单元测试已覆盖 TZ 边界（`reconcile-appointment-tz.test.ts`），但运行时仍以 Node 进程 TZ 为准。

**当前 [026] 决策**：保持 dev/prod TZ 一致即可，不做 user_settings.timezone → reconcile TZ 的扩展（保留后续 [027] 行程与智能编排合并时再演进）。若需多 TZ 部署，须把 `localDayKey` 扩展为接收显式 IANA TZ 参数或 UTC 归一化（见 [026] OQ-6，defer 至 [027]）。

**操作要点**：
- Docker 部署：在 `docker-compose.yml` / `Dockerfile` 设 `TZ=Asia/Shanghai` 或 `ENV TZ=Asia/Shanghai` + 挂载 `/etc/localtime`。
- 本地开发：CI 跑 `validate:structure` + `vitest` 已覆盖 TZ 边界场景；开发者本地无需特设。
- 生产环境：明确设置 `TZ` 环境变量，并在变更记录中标注（参考本文档第 §「变更记录」）。

### `memory_episodes`

Session 归档时自动生成的摘要记录，用于跨会话记忆。

| 列名 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | UUID | PK, defaultRandom() | 主键 |
| `user_id` | UUID | NOT NULL, FK→users(id) ON DELETE CASCADE | 所属用户 |
| `session_id` | UUID | FK→ai_sessions(id) ON DELETE SET NULL | 关联的 AI Session |
| `domain_id` | TEXT | NULLABLE | 关联的 Domain ID |
| `action` | TEXT | NULLABLE | 触发的 action |
| `episode_type` | TEXT | NOT NULL, DEFAULT 'session_summary' | 片段类型 |
| `summary` | TEXT | NOT NULL | 摘要内容 |
| `metadata` | JSONB | NOT NULL, DEFAULT {} | 元数据 |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 创建时间 |

索引：
- `idx_memory_episodes_user_created` ON (user_id, created_at)
- `idx_memory_episodes_session` ON (session_id)

---

## 十四、本文档的使用方式

- 本文档是 Drizzle Schema 文件（`schema.ts`）的唯一设计依据
- 每次新增或修改 USOM 对象字段，必须先同步更新 USOM 文档，再更新本文档，最后修改 Schema 代码
- Repository 接口的方法签名以本文档第十一章为准
- 三者优先级：**USOM 文档 > 本文档 > Schema 代码**

---

*文档版本：2026_07_07*
*关联上游文档：docs/usom-design.md*

*变更：[023.13] (2026_07_07) — §4.7 timeboxes.execution_record JSONB 形状扩展 4 可选字段（actualStartTime/actualEndTime/focusMinutes/energyActual），免 DDL 迁移（JSONB 演进）*
*变更：[023.11] (2026_07_06) — §7.6 activity_archetypes 加 `synonyms jsonb NOT NULL DEFAULT '[]'` 列（迁移 0034_023_11_archetype_synonyms.sql，幂等 ADD COLUMN IF NOT EXISTS）*
*变更：[026.01] (2026_07_07) — §appointments 加 `activity_archetype_id uuid REFERENCES activity_archetypes(id) ON DELETE SET NULL` 列 + 索引 `idx_appointments_archetype`，迁移 0035_026_01_appointment_activity_archetype.sql（IF NOT EXISTS 幂等）*
*变更：[023.05] PR2 阶段 2 (2026_07_05) — §4.X appointments（rename 自 itineraries）+ 0033 RENAME 迁移 + F2 snapshot drift acknowledge（drizzle snapshot 停 0006，未来 schema 变更继续手写 SQL + 登记 journal）*
