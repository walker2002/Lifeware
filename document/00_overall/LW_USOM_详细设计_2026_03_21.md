# Lifeware USOM 详细设计 2026_03_21

---

**本文档说明**

本文档是 USOM（Unified Semantic & Object Model，统一语义和对象层）的详细设计文件，是总体设计文档中 USOM 章节的展开与落地。

USOM 是全系统的**共同语言**，定义所有对象的结构、生命周期与版本演化规范，不含任何业务逻辑或执行规则。

**变更记录**：

- **2026_03_21**：新增原则 6（多租户隔离）、能量账户设计（EnergyState/EnergyScore/Chronotype/EnergyCurvePoint/EnergySensitivity）、UserCalibration 新增能量校准字段、ContextSnapshot/USOMSnapshot 增加 energyState
- **2026_03_20**：新增 `USOMSnapshot` 类型定义，明确其与 `ContextSnapshot` 的区别及派生关系、`DerivedSignals` 接口定义、四钩子签名完整修正版、`timeOfDay` 默认边界划分、治理条款 G-07 对齐 Bridge Layer

关联文档：
- `LW_overall_总体设计_2026_03_18.md`（上级约束文件）
- `LW_overall_技术栈设计演进_2026_03_18.md`（技术实现约束）
- `LW_database_数据库设计_2026_03_21.md`（数据库落地实现）

---

## 一、USOM 设计原则（重申与细化）

### 原则 1：对象先于能力（Object-before-Capability）

所有能力、钩子、AI 交互的输入输出，必须能被映射到 USOM 定义的某一对象类型上。若无法映射，则说明该能力缺乏合法的对象载体，不得实现。

### 原则 2：只读快照是唯一共享格式（Read-Only Snapshot）

Domain 只能通过 `USOMSnapshot` 接收数据，不能持有对象引用，不能访问数据库。快照是状态的某一时刻切片，不是实时流。

### 原则 3：语义版本化

USOM 对象字段的变更必须遵循版本化规范，不允许悄悄修改字段语义（即使字段名不变）。

### 原则 4：生命周期语义唯一

同一状态名在不同对象中的语义必须保持一致。例如 `Archived` 在所有对象中均表示"历史归档，不再活跃，不可直接操作"。

### 原则 5：MVP 约束

MVP 阶段只实现 **Tasks · Habits · Timebox · OKRs · Review** 五个核心 Domain 所需的 USOM 对象。Career 等扩展 Domain 的对象在 USOM 中预留命名空间，不实现字段。

### 原则 6：多租户隔离（Multi-Tenancy）

虽然 MVP 阶段为单用户应用，但 USOM 架构必须从一开始就支持多租户。

| 约束 | 说明 |
|---|---|
| MT-01 | 所有核心业务对象（Task / Habit / Timebox 等）在 DB 层包含 `userId`，但 USOM 对象不显式暴露 |
| MT-02 | `userId` 由 Repository 层在持久化时注入，Domain 钩子不感知 |
| MT-03 | `ContextSnapshot` 和 `USOMSnapshot` 包含 `userId`，供 Bridge Layer 消费 |
| MT-04 | 所有查询必须带 `userId` 条件过滤，由 Repository 层透明处理 |

---

## 二、通用基础类型（Shared Primitives）

所有 USOM 对象复用以下基础类型，不得在单个对象中重复定义。

```typescript
// ─── 基础 ID 类型 ──────────────────────────────────────────────
type USOM_ID = string  // UUID v4，全局唯一

// ─── 时间类型（统一 ISO 8601，UTC 存储，展示层本地化）─────────
type Timestamp = string  // e.g. "2026-03-19T08:00:00Z"
type DateOnly   = string  // e.g. "2026-03-19"

// ─── 枚举：优先级 ──────────────────────────────────────────────
enum Priority {
  Critical = 'critical',  // 必须完成，影响关键结果
  High     = 'high',
  Medium   = 'medium',
  Low      = 'low',
}

// ─── 枚举：精力消耗等级 ────────────────────────────────────────
enum EnergyLevel {
  High   = 'high',    // 需要高度专注，深度工作
  Medium = 'medium',  // 常规任务，轻度专注
  Low    = 'low',     // 机械性任务，几乎不消耗专注
}

// ─── 能量分数（1-10，用于用户能量状态）──────────────────────────
// MVP 阶段只推行单一能量维度，避免多维度测量导致用户心理摩擦
type EnergyScore = number  // 1-10，1 = 极低能量，10 = 极高能量

// ─── 能量来源标识 ────────────────────────────────────────────────
type EnergySource = 'system' | 'user'  // 系统预测 | 用户校准

// ─── 能量状态接口（ContextSnapshot 内嵌）─────────────────────────
// 表示用户当前时刻的能量状态，由 State Machine 在生成 ContextSnapshot 时计算
interface EnergyState {
  inferredLevel:  EnergyScore   // 系统根据时段 + 用户校准曲线推断（1-10）
  calibratedLevel: EnergyScore | null  // 用户最近一次手动校准值，无则 null
  activeLevel:    EnergyScore   // 实际生效值：calibratedLevel ?? inferredLevel
  source:         EnergySource  // 'user' 表示 activeLevel 来自用户校准，否则 'system'
  lastCalibratedAt?: Timestamp  // 用户最近校准时间
}

// ─── 昼夜节律类型 ────────────────────────────────────────────────
type Chronotype = 'morning_lark' | 'night_owl' | 'intermediate'
// morning_lark: 早起型，精力高峰在上午
// night_owl: 夜猫型，精力高峰在晚间
// intermediate: 中间型，精力分布较均匀

// ─── 能量曲线点（24 小时基准曲线）─────────────────────────────────
interface EnergyCurvePoint {
  hour:    number  // 0-23
  baseline: number // 基准能量值 1-10
}
// 示例：早起型用户可能 [9,10] 点 baseline=8，[14,15] 点 baseline=4

// ─── 能量敏感度 ───────────────────────────────────────────────────
type EnergySensitivity = 'high' | 'medium' | 'low'
// high: 对能量波动敏感，系统应更保守地安排高耗能任务
// low: 对能量波动不敏感，系统可更灵活地安排任务

// ─── 时长（分钟存储）──────────────────────────────────────────
type DurationMinutes = number

// ─── 枚举：周期类型 ────────────────────────────────────────────
enum PeriodType {
  Daily     = 'daily',
  Weekly    = 'weekly',
  Monthly   = 'monthly',
  Quarterly = 'quarterly',
  Annual    = 'annual',
}


// ─── 枚举：时段（用于 ContextSnapshot / USOMSnapshot）─────────
//
// 默认时段边界（基于 24 小时制，可由用户在设置中自定义）：
//   morning:   05:00 – 11:59
//   afternoon: 12:00 – 17:59
//   evening:   18:00 – 21:59
//   night:     22:00 – 04:59（次日）
//
// 自定义机制：
//   - 用户可在设置中调整三条分隔线（12:00 / 18:00 / 22:00）
//   - 自定义值存储在 UserCalibration.timeBoundaries
//   - State Machine 在生成 ContextSnapshot 时读取 UserCalibration 计算 timeOfDay
//   - 默认值：{ afternoonStart: 12, eveningStart: 18, nightStart: 22 }
type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

// ─── 标签 ──────────────────────────────────────────────────────
type Tag = string  // 自由文本，小写，最多 20 字符

// ─── 备注 ──────────────────────────────────────────────────────
type Notes = string | null
```

---

## 三、核心对象定义（Core Objects）

### 3.1 User（用户）

**对象意图**：系统用户，非 USOM 核心业务对象，但为多租户隔离提供主体标识。MVP 阶段极简，后续按需扩展。

```typescript
interface User {
  id:        USOM_ID
  email:     string
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

---

### 3.2 UserCalibration（用户校准参数）

**对象意图**：存储用户的个性化配置参数，由 Memory Framework 学习后更新，供 Rule Engine 和 State Machine 读取。

**归属与责任边界**：

| 维度 | 说明 |
|---|---|
| 类型定义 | USOM 层（本节） |
| 计算逻辑 | Memory Framework（从 DerivedSignals 和用户行为中学习） |
| 消费方 | Rule Engine（精力冲突检测、WIP 上限判断）、State Machine（计算 `timeOfDay`） |
| 写入方 | Memory Framework 通过 Review 周期校准提案更新 |

**每用户一行**，初始值来自方法论默认值。

```typescript
interface UserCalibration {
  userId: USOM_ID

  // ── 时段边界（用于计算 timeOfDay）────────────────────────────
  // 默认值：morningStart 隐含为 05:00，由代码处理
  afternoonStart: number   // 下午开始小时数，默认 12
  eveningStart:   number   // 晚上开始小时数，默认 18
  nightStart:     number   // 夜间开始小时数，默认 22

  // ── 精力高峰参数（来自 DerivedSignals 校准后回写）────────────
  peakEnergyStart:  number  // 精力高峰开始小时，默认 9
  peakEnergyEnd:    number  // 精力高峰结束小时，默认 12
  energyConfidence: number  // 置信度 0-1，初始为 0

  // ── 能量校准参数（UserEnergyCalibration）──────────────────────
  // 用于 State Machine 计算 inferredLevel
  chronotype:       Chronotype       // 昼夜节律类型
  baselineCurve:    EnergyCurvePoint[]  // 基准能量曲线（24小时）
  sensitivity:      EnergySensitivity   // 对偏离基准的反应敏感度

  // ── 能量校准历史（用于 Memory Framework 学习）──────────────────
  lastEnergyCalibrationAt?: Timestamp  // 最近一次用户能量校准时间

  // ── 执行容量参数（用于 Rule Engine 冲突检测）────────────────
  comfortableWipLimit:       number  // 舒适 WIP 上限，默认 5
  sustainableDeepWorkHours:  number  // 可持续深度工作小时，默认 4

  // ── 习惯执行参数（Memory Framework 学习后写入）──────────────
  habitRiskDays:           number[]  // 习惯高风险日（周几容易断链）
  habitPreferredTimeSlots: string[]  // 习惯偏好时段

  // ── 规则覆盖历史（触发校准提案的数据来源）──────────────────
  ruleOverrideHistory: Record<string, RuleOverrideEntry>

  updatedAt: Timestamp
}

interface RuleOverrideEntry {
  ruleKey:     string    // 被覆盖的规则标识
  overrideAt:  Timestamp
  context:     string    // 覆盖时的上下文描述
}
```

---

### 3.3 Intention（意图）

**对象意图**：用户产生的一次输入动作，可以是模糊念头、明确需求或情绪感受。
Intention 是系统的入口原材料，经 Intent Engine 处理后输出 `StructuredIntent`，Intention 本身归 Memory Framework 管理。

**生命周期**：`Captured → Clarified → Routed → Dissolved`

| 状态 | 语义 |
|---|---|
| `Captured` | 已记录，尚未解析 |
| `Clarified` | 已补全必要字段，待路由 |
| `Routed` | 已转化为 StructuredIntent，进入 Nexus 处理链 |
| `Dissolved` | 已消化（被接纳/被拒绝/被忽略），不再活跃 |

```typescript
interface Intention {
  id:               USOM_ID
  status:           IntentionStatus
  rawInput:         string           // 用户原始输入（文字 / 语音转写 / 模板表单值）
  inputMode:        'natural_language' | 'template_form' | 'slash_command'
  capturedAt:       Timestamp
  dissolvedAt?:     Timestamp
  sourceSnapshotId?: USOM_ID         // 产生该意图时的 ContextSnapshot 引用
  notes?:           Notes
}

type IntentionStatus = 'captured' | 'clarified' | 'routed' | 'dissolved'
```

---

### 3.4 StructuredIntent（结构化意图）

**对象意图**：Intent Engine 对 Intention 解析后的输出，是进入 Rule Engine 的标准输入格式。

> StructuredIntent 是过程对象，不持久化到用户可见层，由 Orchestrator 传递，处理完成后归档。

```typescript
interface StructuredIntent {
  id:           USOM_ID
  intentionId:  USOM_ID                  // 对应原始 Intention
  targetDomain: DomainId                 // 路由目标 Domain
  action:       string                   // Domain 内的动作名，e.g. 'create_habit'
  fields:       Record<string, unknown>  // Domain manifest.required_fields 补全后的字段集
  confidence:   number                   // 0-1，AI 解析置信度；template_form 固定为 1.0
  resolvedBy:   'ai' | 'template_form'
  createdAt:    Timestamp
}
```

---

### 3.5 OKR：Objective（目标）

**对象意图**：用户在某一时间段内希望达到的定性目标，是承上启下的战略连接节点。

**生命周期**：`Draft → Active → Paused → Completed / Archived`

| 状态 | 语义 |
|---|---|
| `Draft` | 已创建但未激活，允许修改 |
| `Active` | 进行中，可被系统引用 |
| `Paused` | 暂停，不参与日常行动编排 |
| `Completed` | 已完成，锁定，不可修改 |
| `Archived` | 历史归档，不再活跃 |

```typescript
interface Objective {
  id:           USOM_ID
  status:       ObjectiveStatus
  title:        string
  description?: string
  period: {
    type:  PeriodType
    start: DateOnly
    end:   DateOnly
  }
  parentId?:    USOM_ID  // 支持 Objective 层级（季度 OKR 对应年度 OKR）
  keyResultIds: USOM_ID[]
  tags:         Tag[]
  createdAt:    Timestamp
  updatedAt:    Timestamp
  completedAt?: Timestamp
  archivedAt?:  Timestamp
}

type ObjectiveStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
```

---

### 3.6 OKR：KeyResult（关键结果）

**对象意图**：衡量 Objective 达成程度的可量化指标，是 Task 和 Habit 向上承接的锚点。

```typescript
interface KeyResult {
  id:           USOM_ID
  objectiveId:  USOM_ID
  title:        string
  description?: string
  targetValue:  number
  currentValue: number   // 由 State Machine 在 Task/Habit 完成时自动更新
  unit:         string   // e.g. '次', '%', 'km', '篇'
  progressRate: number   // currentValue / targetValue，0-1，冗余字段便于排序
  status:       KeyResultStatus
  dueDate?:     DateOnly
  createdAt:    Timestamp
  updatedAt:    Timestamp
}

type KeyResultStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
```

---

### 3.7 Task（任务）

**对象意图**：一个有明确完成条件的单次可执行单元。

**生命周期**：`Draft → Active → Scheduled → Completed / Archived`

| 状态 | 语义 |
|---|---|
| `Draft` | 已捕获，条件未完整，不参与编排 |
| `Active` | 待执行，可被 Timebox 调度 |
| `Scheduled` | 已被排入某个 Timebox |
| `Completed` | 已完成，KeyResult 自动更新 |
| `Archived` | 归档，不再显示在活跃列表 |

```typescript
interface Task {
  id:                USOM_ID
  status:            TaskStatus
  title:             string
  description?:      string
  priority:          Priority
  energyRequired:    EnergyLevel
  estimatedDuration: DurationMinutes
  actualDuration?:   DurationMinutes   // 完成时由 Timebox 或手动记录填入
  keyResultId?:      USOM_ID           // 关联 KeyResult（可选）
  timeboxId?:        USOM_ID           // 当前排入的 Timebox（可选）
  tags:              Tag[]
  dueDate?:          DateOnly
  recurrence?:       RecurrenceRule    // 重复任务规则（暂不在 MVP 实现）
  createdAt:         Timestamp
  updatedAt:         Timestamp
  completedAt?:      Timestamp
  archivedAt?:       Timestamp
  notes?:            Notes
}

type TaskStatus = 'draft' | 'active' | 'scheduled' | 'completed' | 'archived'

// 暂不在 MVP 中实现，字段预留
interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly'
  interval:  number
  endDate?:  DateOnly
}
```

---

### 3.7 Habit（习惯）

**对象意图**：用户希望长期坚持的周期性行为，以连续性（streak）为核心衡量指标。

**生命周期**：`Draft → Active → Suspended / Archived`

| 状态 | 语义 |
|---|---|
| `Draft` | 已创建，尚未开始（未到 startDate） |
| `Active` | 进行中，每日参与打卡调度 |
| `Suspended` | 暂停（如旅行），不计入 streak 断链 |
| `Archived` | 永久停止，不参与任何编排 |

```typescript
interface Habit {
  id:               USOM_ID
  status:           HabitStatus
  title:            string
  description?:     string
  frequency:        HabitFrequency
  scheduledTime:    string           // HH:MM，e.g. "07:00"
  duration:         DurationMinutes
  startDate:        DateOnly
  endDate?:         DateOnly
  keyResultId?:     USOM_ID
  streak:           number           // 当前连续天数
  longestStreak:    number
  completionRate7d: number           // 最近 7 天完成率，0-1
  tags:             Tag[]
  createdAt:        Timestamp
  updatedAt:        Timestamp
  suspendedAt?:     Timestamp
  archivedAt?:      Timestamp
  notes?:           Notes
}

type HabitStatus = 'draft' | 'active' | 'suspended' | 'archived'

interface HabitFrequency {
  type:        'daily' | 'weekly' | 'custom'
  daysOfWeek?: number[]  // 0=Sunday ... 6=Saturday
}
```

---

### 3.8 HabitLog（习惯打卡记录）

**对象意图**：每次习惯执行的单次事实记录，是 Habit streak 计算的原始数据。

> 设计决策：HabitLog 作为独立对象而非嵌套在 Habit 内，便于按日期查询、支持复盘聚合、避免 Habit 对象无限增长。

```typescript
interface HabitLog {
  id:              USOM_ID
  habitId:         USOM_ID
  date:            DateOnly
  status:          HabitLogStatus
  actualDuration?: DurationMinutes
  note?:           Notes
  loggedAt:        Timestamp
  source:          'manual' | 'connector'  // connector 为外部数据源，MVP 不实现
}

type HabitLogStatus = 'completed' | 'skipped' | 'partial'
```

---

### 3.9 Timebox（时间盒）

**对象意图**：一段被显式划分给特定任务/习惯的时间区间，是时间结构的最小执行单元。

**生命周期**：`Planned → Running → Paused → Ended → Logged`

| 状态 | 语义 |
|---|---|
| `Planned` | 已安排，未到开始时间 |
| `Running` | 计时中 |
| `Paused` | 中途暂停 |
| `Ended` | 时间到达结束点，等待记录 |
| `Logged` | 已记录完成情况，归档 |

```typescript
interface Timebox {
  id:              USOM_ID
  status:          TimeboxStatus
  title:           string
  startTime:       Timestamp
  endTime:         Timestamp
  taskIds:         USOM_ID[]
  habitIds:        USOM_ID[]
  isRecurring:     boolean
  recurrenceRule?: RecurrenceRule
  tags:            Tag[]
  createdAt:       Timestamp
  updatedAt:       Timestamp
  startedAt?:      Timestamp
  pausedAt?:       Timestamp
  endedAt?:        Timestamp
  loggedAt?:       Timestamp
  notes?:          Notes
}

type TimeboxStatus = 'planned' | 'running' | 'paused' | 'ended' | 'logged'
```

---

### 3.10 Review（复盘）

**对象意图**：对一段时间内执行情况的结构化反思记录，由 AI 生成初稿，用户编辑确认。

**生命周期**：`Draft → InProgress → Completed / Archived`

```typescript
interface Review {
  id:           USOM_ID
  status:       ReviewStatus
  type:         PeriodType
  periodStart:  DateOnly
  periodEnd:    DateOnly
  generatedBy:  'ai' | 'manual'
  sections:     ReviewSection[]
  metrics:      ReviewMetrics
  createdAt:    Timestamp
  updatedAt:    Timestamp
  completedAt?: Timestamp
  archivedAt?:  Timestamp
}

type ReviewStatus = 'draft' | 'in_progress' | 'completed' | 'archived'

interface ReviewSection {
  key:     string   // e.g. 'highlights', 'blockers', 'next_actions'
  title:   string
  content: string   // Markdown 格式
}

interface ReviewMetrics {
  tasksCompleted:  number
  tasksTotal:      number
  habitsCompleted: number
  habitsTotal:     number
  timeboxedHours:  number
  focusScore?:     number  // 0-100，由 Memory Framework DerivedSignals 提供
}
```

---

## 四、系统流通对象（Process Objects）

系统流通对象是 Nexus 内部各组件之间传递数据的格式，不直接对应持久化实体，但必须在 USOM 层统一定义。

### 4.1 ContextSnapshot（上下文快照）

**对象意图**：State Machine 在每次状态变更后同步刷新的全局状态切片，是系统内部的状态管理对象。

> **ContextSnapshot 与 USOMSnapshot 的区别**（见 4.2 节）：
> ContextSnapshot 是 State Machine 的内部产物，含系统元数据（`generatedBy`、`snapshotId` 等）；
> USOMSnapshot 是从 ContextSnapshot 派生的 Domain 只读视图，裁剪了系统内部字段。
> Domain 钩子只能接收 USOMSnapshot，不能直接接收 ContextSnapshot。

```typescript
interface ContextSnapshot {
  snapshotId:  USOM_ID
  userId:      USOM_ID              // 多租户标识，供 Bridge Layer 消费
  generatedAt: Timestamp
  generatedBy: 'state_machine'  // 只有 State Machine 可以生成，其他组件不得创建

  // 当前活跃对象
  activeObjectives:  ObjectiveSummary[]
  activeKeyResults:  KeyResultSummary[]
  activeTasks:       TaskSummary[]       // status = 'active' | 'scheduled'
  pendingHabits:     HabitSummary[]      // status = 'active'，今日未打卡
  currentTimebox?:   TimeboxSummary      // status = 'running' | 'paused'
  upcomingTimeboxes: TimeboxSummary[]    // 未来 2 小时内的 Timebox
  pendingIntentions: IntentionSummary[]  // status = 'captured' | 'clarified'

  // 当前时间上下文
  currentTime: Timestamp
  currentDate: DateOnly
  dayOfWeek:   number      // 0=Sunday
  timeOfDay:   TimeOfDay   // 由 UserCalibration.timeBoundaries 计算，见第二章

  // 能量状态（能量优先调度的核心数据）
  energyState: EnergyState  // 用户当前能量状态，由 State Machine 计算
}
```

---

### 4.2 USOMSnapshot（Domain 只读视图）

**对象意图**：Domain 钩子的唯一合法入参类型，是 Orchestrator 从最新 ContextSnapshot 派生的 Domain 访问界面。

**与 ContextSnapshot 的关系**：

| 维度 | ContextSnapshot | USOMSnapshot |
|---|---|---|
| 生成者 | State Machine | Orchestrator（从 ContextSnapshot 派生） |
| 用途 | 系统内部状态管理 | Domain 钩子的只读入参 |
| 是否含系统元数据 | 是（`generatedBy`、`snapshotId` 等） | 否，已裁剪 |
| Domain 可否直接接收 | **禁止** | **唯一合法方式** |
| 类比 | 数据库原始 Table | 面向消费方的 View |

```typescript
// ─── USOMSnapshot：Domain 钩子的唯一入参类型 ──────────────────────
//
// 由 Orchestrator 在调用任何 Domain 钩子前，从最新 ContextSnapshot 派生。
// 所有字段均为深度只读（Readonly + ReadonlyArray），Domain 不得修改。
// Domain 不能持有此对象的引用，不能向下传递给其他 Domain。
//
// 派生规则：去除 ContextSnapshot 的系统内部字段（snapshotId / generatedBy / generatedAt），
// 保留业务内容字段，所有集合字段转为 ReadonlyArray，所有对象字段转为 Readonly。

type USOMSnapshot = Readonly<{
  userId:            USOM_ID  // 多租户标识，供 Bridge Layer 消费

  activeObjectives:  ReadonlyArray<Readonly<ObjectiveSummary>>
  activeKeyResults:  ReadonlyArray<Readonly<KeyResultSummary>>
  activeTasks:       ReadonlyArray<Readonly<TaskSummary>>
  pendingHabits:     ReadonlyArray<Readonly<HabitSummary>>
  currentTimebox?:   Readonly<TimeboxSummary>
  upcomingTimeboxes: ReadonlyArray<Readonly<TimeboxSummary>>
  pendingIntentions: ReadonlyArray<Readonly<IntentionSummary>>

  currentTime: Timestamp
  currentDate: DateOnly
  dayOfWeek:   number
  timeOfDay:   TimeOfDay

  // 能量状态（能量优先调度的核心数据）
  energyState: Readonly<EnergyState>  // 用户当前能量状态

  // USOMSnapshot 自身的溯源字段（只读）
  readonly sourceSnapshotId: USOM_ID  // 对应来源 ContextSnapshot 的 snapshotId
}>

// ContextSnapshot → USOMSnapshot 的派生契约（由 Orchestrator 执行，此处只定义契约）
// function deriveUSOMSnapshot(ctx: ContextSnapshot): USOMSnapshot
```

---

### 4.3 DerivedSignals（记忆衍生信号）

**对象意图**：Memory Framework 从分层记忆中预先计算、压缩、脱敏后生成的量化信号，为各消费模块提供个性化决策依据。

**归属与责任边界**：

| 维度 | 说明 |
|---|---|
| 类型定义 | USOM 层（本节），因为多个独立组件消费同一类型，必须统一契约 |
| 计算逻辑 | Memory Framework 内部，不在 USOM 层定义 |
| 消费方 | Rule Engine（个性冲突检测）、Action Surface Engine（排序权重）、Intent Engine（上下文感知）、Bridge Layer（`query_derived_signals` MCP Tool） |
| 写入方 | 只有 Memory Framework 可以写入，其他任何组件（包括 Bridge Layer）不得直接写入 |

> 约束：DerivedSignals 不应包含原始文字内容，只包含经过计算的数值或枚举型标签。
> 此约束是 Memory Framework 的实现规范，不在 USOM 层定义，USOM 层只管形状。

```typescript
interface DerivedSignals {
  userId: USOM_ID

  // ── 精力节律信号（来源：Timebox 执行时段 × 完成质量）────────
  // null 表示数据量不足，尚未形成有效信号
  energyPattern: {
    peakHours:  number[]  // e.g. [9, 10, 11]，一天中精力最高的小时列表
    lowHours:   number[]  // e.g. [14, 15]，精力低谷的小时列表
    confidence: number    // 0-1，数据量越多置信度越高，初始为 0
  } | null

  // ── 执行容量信号（来源：Task 完成率 × WIP 数量）──────────────
  activeTaskCount:      number  // 当前进行中任务数
  avgCompletionRate7d:  number  // 最近 7 天任务完成率，0-1
  avgCompletionRate30d: number  // 最近 30 天任务完成率，0-1

  // ── 习惯信号（来源：HabitLog 历史）──────────────────────────
  habitStreaks:          Record<USOM_ID, number>  // habitId → 当前 streak
  habitCompletionRates:  Record<USOM_ID, number>  // habitId → 近 30 天完成率

  // ── Timebox 执行偏差（来源：实际 vs 计划对比）────────────────
  timeboxAdherence7d: number  // 0-1，实际完成时间盒 / 计划时间盒（近 7 天）

  // ── 过度承诺信号（来源：activeTaskCount × UserCalibration）───
  isOvercommitted: boolean    // activeTaskCount > UserCalibration.comfortable_wip_limit

  // ── 信号元数据 ────────────────────────────────────────────────
  computedAt:     Timestamp
  dataWindowDays: number      // 本次信号基于多少天的数据
}
```

---

### 4.4 Domain Plugin 四钩子签名（完整修正版）

**归属说明**：钩子签名本身是 USOM 层的契约定义，因为它规定了 Domain 与 Nexus 之间数据传递的完整类型，需在此统一记录。

```typescript
interface DomainPlugin {
  // ── 声明文件（静态配置，非运行时钩子）────────────────────────
  manifest: DomainManifest

  // ── 钩子 1：意图校验 ─────────────────────────────────────────
  // 调用者：Rule Engine（经 Orchestrator）
  // 时机：StructuredIntent 进入 State Machine 之前
  // 职责：Domain 内部的结构性校验（字段合法性、状态合法性）
  // 注意：个性冲突检测由 Rule Engine 自身读取 DerivedSignals 完成，不在此钩子
  onValidate(
    intent:   StructuredIntent,
    snapshot: USOMSnapshot
  ): { valid: boolean; errors: string[] }

  // ── 钩子 2：事件响应 ─────────────────────────────────────────
  // 调用者：Event Bus 广播后由 Memory Framework 触发
  // 时机：State Machine 发布 SystemEvent 后
  // 职责：返回派生指标与行动建议，不得触发任何状态变更
  onEvent(
    event:    SystemEvent,
    snapshot: USOMSnapshot
  ): { metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] }

  // ── 钩子 3：行动切面请求 ─────────────────────────────────────
  // 调用者：Action Surface Engine
  // 时机：Action Surface Engine 需要刷新行动切面时
  // 职责：返回候选行动列表，由 Action Surface Engine 统一排序
  // 注意：此钩子需要 DerivedSignals 作为独立参数，
  //        因为行动候选的权重计算依赖精力信号、streak 等个性化数据；
  //        DerivedSignals 来源于 Memory Framework，不属于 USOMSnapshot，
  //        显式传参而非混入 snapshot，保持来源清晰。
  onActionSurfaceRequest(
    snapshot: USOMSnapshot,
    signals:  Readonly<DerivedSignals>  // 显式独立参数，不混入 snapshot
  ): { actions: ActionCandidate[]; category: ActionCategory; weight: number }

  // ── 钩子 4：出站推送声明（可选，MVP 不实现）─────────────────
  // 调用者：Connector Runner
  // 时机：Event Bus 广播相关事件后
  // 职责：声明推送意图，由 Connector Runner 执行实际 IO，Domain 不执行 IO
  onOutboundRequest?(
    trigger:  SystemEvent,
    snapshot: USOMSnapshot
  ): { connector: string; payload: ExternalPayload; condition?: string }
}

// ── 辅助类型 ─────────────────────────────────────────────────────
interface DomainManifest {
  domainId:        DomainId
  version:         string
  requiredFields:  string[]   // Intent Engine 据此补全 StructuredIntent.fields
  subscribedEvents: SystemEventType[]
}

interface MetricUpdate {
  metricKey:  string
  value:      number
  unit?:      string
}

interface ActionSurfaceSuggestion {
  actionType: ActionType
  label:      string
  weight:     number
}
```

---

### 4.5 StateProposal（状态变更提案）

**对象意图**：Rule Engine 审批通过后，传递给 State Machine 的变更指令。

```typescript
interface StateProposal {
  id:           USOM_ID
  intentId:     USOM_ID
  targetObject: {
    type: USOMObjectType
    id?:  USOM_ID  // 无 ID 表示新建对象
  }
  action:     string   // e.g. 'create', 'transition_status', 'update_fields'
  payload:    Record<string, unknown>
  approvedAt: Timestamp
  approvedBy: 'rule_engine'
}

type USOMObjectType =
  | 'objective' | 'key_result'
  | 'task' | 'habit' | 'habit_log'
  | 'timebox' | 'review'
  | 'intention'
```

---

### 4.6 SystemEvent（系统事件）

**对象意图**：State Machine 向 Event Bus 发布的不可变事实记录，是 Domain.onEvent 和 Memory Framework 的消费输入。

```typescript
interface SystemEvent {
  id:          USOM_ID
  type:        SystemEventType
  occurredAt:  Timestamp
  triggeredBy: 'state_machine' | 'time_trigger'
  payload:     Record<string, unknown>  // 只包含该事件类型必需的最小字段
  snapshotId:  USOM_ID                 // 产生该事件时的 ContextSnapshot 引用
}

type SystemEventType =
  | 'TaskCreated' | 'TaskActivated' | 'TaskScheduled' | 'TaskCompleted' | 'TaskArchived'
  | 'HabitCreated' | 'HabitActivated' | 'HabitSuspended' | 'HabitArchived'
  | 'HabitLogged' | 'HabitSkipped' | 'HabitStreakMilestone'
  | 'TimeboxCreated' | 'TimeboxStarted' | 'TimeboxPaused' | 'TimeboxEnded' | 'TimeboxLogged'
  | 'ObjectiveCreated' | 'ObjectiveCompleted' | 'KeyResultUpdated' | 'KeyResultCompleted'
  | 'ReviewCreated' | 'ReviewCompleted'
  | 'IntentionCaptured' | 'IntentionDissolved'

// 示例：HabitLogged payload
interface HabitLoggedPayload {
  habitId:           USOM_ID
  habitLogId:        USOM_ID
  date:              DateOnly
  status:            HabitLogStatus
  streak:            number
  isStreakMilestone: boolean
}
```

---

### 4.7 ActionCandidate（行动候选）

**对象意图**：Domain.onActionSurfaceRequest 返回的候选行动单元，是 Action Surface Engine 排序的输入。

```typescript
interface ActionCandidate {
  id:               USOM_ID
  sourceObjectId:   USOM_ID
  sourceObjectType: USOMObjectType
  label:            string        // 展示文案，e.g. "完成今日跑步"
  subLabel?:        string        // 副文案，e.g. "已坚持 12 天"
  actionType:       ActionType
  targetRoute?:     string        // 点击跳转目标（限定格式，非任意 URL）
  category:         ActionCategory
  weight:           number        // 0-100，Domain 建议权重
  expiresAt?:       Timestamp
}

type ActionCategory = 'guide' | 'tile' | 'cue'

type ActionType =
  | 'log_habit'
  | 'complete_task'
  | 'start_timebox'
  | 'review_okr'
  | 'create_review'
  | 'capture_intent'
  | 'snooze'
  | 'skip'
```

---

### 4.8 ExternalEvent（外部事件，MVP 接口预留）

**对象意图**：Inbound Connector 将外部数据翻译为 USOM 格式后注入系统的事件对象。MVP 阶段接口预留，不实现。

```typescript
// MVP 阶段不实现，接口预留
interface ExternalEvent {
  id:           USOM_ID
  source:       string
  sourceType:   ExternalSourceType
  rawPayload:   Record<string, unknown>
  mappedTo:     SystemEventType
  receivedAt:   Timestamp
  processedAt?: Timestamp
}

type ExternalSourceType = 'health' | 'productivity' | 'calendar' | 'communication' | 'custom'
```

---

## 五、Summary 子类型定义

Summary 类型只包含 Domain 决策所需的最小字段，避免 USOMSnapshot / ContextSnapshot 体积膨胀。所有 Summary 类型在此统一定义。

```typescript
interface TaskSummary {
  id:             USOM_ID
  title:          string
  status:         TaskStatus
  priority:       Priority
  energyRequired: EnergyLevel
  dueDate?:       DateOnly
  keyResultId?:   USOM_ID
}

interface HabitSummary {
  id:            USOM_ID
  title:         string
  status:        HabitStatus
  scheduledTime: string   // HH:MM
  streak:        number
  todayLogged:   boolean
}

interface TimeboxSummary {
  id:        USOM_ID
  title:     string
  status:    TimeboxStatus
  startTime: Timestamp
  endTime:   Timestamp
  taskIds:   USOM_ID[]
  habitIds:  USOM_ID[]
}

interface ObjectiveSummary {
  id:           USOM_ID
  title:        string
  status:       ObjectiveStatus
  period:       { type: PeriodType; start: DateOnly; end: DateOnly }
  keyResultIds: USOM_ID[]
}

interface KeyResultSummary {
  id:           USOM_ID
  objectiveId:  USOM_ID
  title:        string
  progressRate: number
  status:       KeyResultStatus
  dueDate?:     DateOnly
}

interface IntentionSummary {
  id:         USOM_ID
  status:     IntentionStatus
  rawInput:   string
  capturedAt: Timestamp
}
```

---

## 六、对象生命周期约束汇总

| 对象 | 有效状态流转 | 禁止 / 约束 |
|---|---|---|
| Objective | Draft → Active → Paused → Active（可反复）| 任何状态不可直接 → Draft |
| Objective | Active / Paused → Completed | Completed 不可回退 |
| Objective | 任意 → Archived | Archived 不可恢复 |
| KeyResult | 跟随父 Objective；Active 时可更新 currentValue | Completed 后 currentValue 锁定 |
| Task | Draft → Active → Scheduled → Completed | Scheduled 取消排期 → Active（可回退） |
| Task | Active / Scheduled / Draft → Archived | Completed 不可回退 Active |
| Habit | Draft → Active（依据 startDate 自动触发）| — |
| Habit | Active ↔ Suspended（可多次）| Archived 不可恢复 |
| HabitLog | 创建时确定 status | 创建后 status 不可修改（事实记录） |
| Timebox | Planned → Running → Paused → Running | Ended 后只能 → Logged |
| Timebox | Running / Paused → Ended（时间触发）| Logged 后不可修改 |
| Review | Draft → InProgress → Completed | Completed 后只可 → Archived |
| Intention | Captured → Clarified → Routed → Dissolved | 任何状态不可回退 |

---

## 七、版本化机制

### 7.1 版本字段

所有 USOM 对象在 DB 层增加版本字段（不暴露到 USOMSnapshot）：

```typescript
// DB 层字段，不出现在 USOMSnapshot 中
interface VersionedObject {
  schemaVersion: number  // 从 1 开始，破坏性变更时递增
}
```

### 7.2 字段变更规则

| 变更类型 | 策略 |
|---|---|
| 新增可选字段 | 兼容性变更，schemaVersion 不变，旧数据新字段默认 null |
| 新增必填字段 | 破坏性变更，schemaVersion +1，需提供迁移脚本填充历史数据 |
| 修改字段语义（即使名称不变）| 破坏性变更，schemaVersion +1 |
| 删除字段 | 先标记 @deprecated 至少一个版本，再删除 |
| 新增枚举值 | 兼容性变更，但 Domain switch/case 需更新兜底逻辑 |
| 删除枚举值 | 破坏性变更 |

### 7.3 废弃流程

```
步骤 1：字段注释标注 @deprecated since v{N}，新版本不再写入
步骤 2：下一个大版本从 StructuredIntent 和 USOMSnapshot 中移除
步骤 3：DB 层保留字段至少一个版本，数据归档后删除列
```

---

## 八、USOM 与 Nexus / Domain 的治理条款

| 编号 | 条款 | 违规示例 |
|---|---|---|
| G-01 | Domain 只能接收 `USOMSnapshot`（及 `DerivedSignals`），不得接收完整 DB 行对象或 `ContextSnapshot` | `onValidate(intent, contextSnapshot)` |
| G-02 | Domain 返回值不得包含 USOM 对象的直接引用，只能包含 `USOM_ID` 引用 | 返回 `{ task: TaskObject }` 而非 `{ taskId: string }` |
| G-03 | `ContextSnapshot` 只由 State Machine 生成，其他任何组件不得创建或修改 | Event Bus 生成 snapshot |
| G-04 | `SystemEvent.payload` 只包含该事件类型必需的最小字段，不得内嵌完整对象 | HabitLogged payload 中嵌套完整 Habit 对象 |
| G-05 | `StructuredIntent.fields` 的 key 名称必须与对应 USOM 对象字段名一致 | fields.name 对应 Habit 对象，但 Habit 字段名为 title |
| G-06 | 新 USOM 对象字段必须先在本文档定义，再在代码中实现 | 代码先行，文档滞后 |
| G-07 | Bridge Layer 约束（A-D）从 MVP 第一行代码起即生效：所有外部写操作必须经过完整 Nexus 链路（Intent Engine → Rule Engine → State Machine）；MCP Tools 只暴露读查询和意图提交；Nexus 组件方法签名须与 Bridge Layer 兼容，不依赖 HTTP 上下文 | Bridge Layer 暴露直接 CRUD 接口；Domain 方法签名依赖 HTTP 上下文 |
| G-08 | `DerivedSignals` 的字段变更视为 Bridge Layer API 的 breaking change，需要遵循版本化机制处理 | DerivedSignals 变更未全局通报 |

---

## 九、MVP 实现范围与优先级

### 第一批（核心路径，Day 1 必须完成）

- 全部 Shared Primitives（含 `TimeOfDay` 及默认边界定义）
- `User`、`UserCalibration`（多租户支持）
- `ContextSnapshot` 及全部 Summary 子类型（第五章）
- `USOMSnapshot`（4.2 节）
- `DerivedSignals`（4.3 节，类型定义完成，计算逻辑由 Memory Framework 实现）
- `Task`、`TaskStatus`
- `Habit`、`HabitLog`、`HabitStatus`、`HabitFrequency`
- `Timebox`、`TimeboxStatus`
- `StructuredIntent`、`StateProposal`
- `SystemEvent` 及核心 `SystemEventType`
- `ActionCandidate`、`ActionCategory`、`ActionType`
- Domain Plugin 四钩子签名（4.4 节）

### 第二批（OKR 路径）

- `Objective`、`KeyResult`
- `ObjectiveSummary`、`KeyResultSummary`

### 第三批（复盘路径）

- `Review`、`ReviewSection`、`ReviewMetrics`

### 预留接口，不实现

- `ExternalEvent`、`ExternalPayload`
- `RecurrenceRule`（Task 重复任务）

---

## 十、本文档的使用方式

- 每次新增对象或修改字段，必须先更新本文档，再修改代码
- Domain 开发者以本文档为唯一类型参考，不查看 DB Schema 或 Drizzle 定义
- 代码实现的 TypeScript 类型文件（`usom.types.ts`）应与本文档完全对齐；二者不一致时以**本文档为准**
- 本文档版本号以文件名日期为准

---

*文档版本：2026_03_21*
*关联上级文档：LW_overall_总体设计_2026_03_18.md*
*关联数据库文档：LW_database_数据库设计_2026_03_21.md*
