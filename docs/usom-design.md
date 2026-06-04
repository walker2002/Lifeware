# Lifeware USOM 详细设计 2026_03_21

---

**本文档说明**

本文档是 USOM（Unified Semantic & Object Model，统一语义和对象层）的详细设计文件，是总体设计文档中 USOM 章节的展开与落地。

USOM 是全系统的**共同语言**，定义所有对象的结构、生命周期与版本演化规范，不含任何业务逻辑或执行规则。

**变更记录**：

- **2026_06_03 (refactor)**：Task Domain 重构 — Project→Thread（`ProjectStatus`→`ThreadStatus`，`Project`→`Thread`，`projectId`→`threadId`）；移除 `ProjectTemplate`/`TaskTemplate`（MVP 不实现模板）；`Task` 新增双轴标签系统：AI 维护标签（`clarity`/`complexity`/`decomposition`）+ 用户管理标签（`captureMode`/`energyProfile`/`schedulingConstraint`/`tracking`）+ `aiTags` 扩展数据；SystemEventType 从 `Project*` 更新为 `Thread*`
- **2026_05_28 (refactor)**：执行记录模型统一化 —— `ExecutionRecord` 从 timebox 专属提升为跨 domain 共享类型；`HabitLog` 字段对齐 ExecutionRecord（新增 completionStatus/plannedDuration/deviationMinutes/completionRating/energyLevel，source 扩展 'timebox_sync'）；`Task` 新增 `lastExecutionRecord`；`ExecutionRecord` 增加 `sourceType` 字段；新增 `ExecutionLogged` 系统事件类型；`ActionSurfaceSuggestion` 扩展 `suggestionType` 字段
- **2026_05_20 (enhancement)**：新增 ContextProvider/ContextCapability、DomainHandler、GenerationRequest/GenerationResult、ContextRegistry/ContextAssembler 等流通类型，支持 Handler + Context Engine 架构的双轨模型
- **2026_05_25 (sync)**：同步代码变更 — 移除 Task/Project/ProjectTemplate/TaskTemplate 时间字段；新增 StructuredIntent.pathType、DomainHandler.onGenerate/onQuery、Query Path 类型（QueryContext/QueryResult/CNUISurfacePayload）、GenerationRequest 扩展字段；更新 SystemEventType（Objective 全生命周期/Project/Generative 事件）、SystemEvent.triggeredBy（context_engine/handler）；重构 LLMConfig；扩展 AISession 状态枚举；新增 MemoryEpisode 类型；修正 ObjectiveSummary 移除 okrType；USOMObjectType 新增 project
- **2026_05_22 (enhancement)**：新增 AI Runtime 基础设施类型（AIRuntime/LLMGateway/TokenBudget）、CN-UI 协议类型（CNUISurface/CNUIMessage/CNUISurfaceStore/CNUIEvent）、AIRuntimeError 错误类型，支持 AI Runtime 架构
- **2026_05_11 (enhancement)**：Objective 新增 objectiveNumber/priority 字段、PeriodType 新增 SemiAnnual
- **2026_05_11**：Objective 新增 okrType/discardedAt 字段、ObjectiveStatus/KeyResultStatus 新增 discarded 状态
- **2026_05_09**：Habit 时间模型升级（三字段时间窗口 + 双时长 + trackable）、新增 HabitTemplate/TemplateHabitItem 接口、Timebox 生命周期更新（Paused→Overtime, 新增 Cancelled, ExecutionRecord）、SystemEvent.triggeredBy 新增 template_apply、ActionType 新增 streak_milestone_hint/habit_risk_warning、HabitSummary/TimeboxSummary 字段更新
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
  Quarterly  = 'quarterly',
  SemiAnnual = 'semi_annual',
  Annual     = 'annual',
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

### ThreadStatus

type ThreadStatus = 'active' | 'paused' | 'completed' | 'archived'

状态转换：
- active → paused, completed, archived
- paused → active, archived
- completed → archived
- archived →（终态）

### ClarityLevel
type ClarityLevel = 'fuzzy' | 'scoped' | 'actionable'

### ComplexityTag
type ComplexityTag = 'routine' | 'multi_step' | 'creative' | 'research' | 'social'

### DecompositionLevel
type DecompositionLevel = 'atomic' | 'splittable' | 'splitting_in_progress' | 'decomposed'

### CaptureMode
type CaptureMode = 'scheduled' | 'ad_hoc' | 'retrospective'

### EnergyProfile
type EnergyProfile = 'light' | 'deep' | 'admin' | 'creative' | 'reactive'

### SchedulingConstraint
type SchedulingConstraint = 'hard_deadline' | 'soft_target' | 'opportunistic' | 'recurring'

### TrackingMode
type TrackingMode = 'none' | 'check_in' | 'log' | 'review'

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
  pathType?:    'contract' | 'generative' | 'query'  // 三路径路由类型，由 Orchestrator 解析
  createdAt:    Timestamp
}
```

---

### 3.5 OKR：Objective（目标）

**对象意图**：用户在某一时间段内希望达到的定性目标，是承上启下的战略连接节点。

**生命周期**：`Draft → Active → Paused → Completed / Discarded → Archived`

| 状态 | 语义 |
|---|---|
| `Draft` | 已创建但未激活，允许修改 |
| `Active` | 进行中，可被系统引用 |
| `Paused` | 暂停，不参与日常行动编排 |
| `Completed` | 已完成，锁定，不可修改 |
| `Discarded` | 已废弃，不再活跃，不参与编排 |
| `Archived` | 历史归档，不再活跃 |

```typescript
interface Objective {
  id:           USOM_ID
  status:       ObjectiveStatus
  okrType:      'visionary' | 'committed'  // OKR 类型，默认 'committed'
  objectiveNumber: string                  // 自动生成编号，格式如 26Q1-O1，创建时由 Repository 层自动分配
  priority:     'P0' | 'P1' | 'P2'        // 重要程度，默认 P1。P0=必须完成，P1=应该完成，P2=有余力则做
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
  discardedAt?: Timestamp
  archivedAt?:  Timestamp
}

type ObjectiveStatus = 'draft' | 'active' | 'paused' | 'completed' | 'discarded' | 'archived'
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
  discardedAt?: Timestamp
}

type KeyResultStatus = 'draft' | 'active' | 'paused' | 'completed' | 'discarded' | 'archived'
```

---

### 3.7 Task（任务）

**对象意图**：一个有明确完成条件的单次可执行单元。

**生命周期**：`Draft → Active → InProgress → OnHold → Completed / Archived`

| 状态 | 语义 |
|---|---|
| `Draft` | 已捕获，条件未完整，不参与编排 |
| `Active` | 已就绪，可被 Timebox 调度 |
| `InProgress` | 执行中 |
| `OnHold` | 暂停/搁置 |
| `Completed` | 已完成，KeyResult 自动更新 |
| `Archived` | 归档，不再显示在活跃列表 |

> **兼容说明**：旧状态 `scheduled` 保留兼容，读取时映射为 `in_progress`。

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
  parentId?:         USOM_ID           // 父任务 ID（null=顶级任务）
  threadId?:         USOM_ID           // 归属主线 ID（null=独立任务）
  keyResultId?:      USOM_ID           // 关联 KeyResult（可选）
  timeboxId?:        USOM_ID           // 当前排入的 Timebox（可选）
  frequencyType?:    'once' | 'daily' | 'weekly' | 'custom'  // 频率类型
  daysOfWeek?:       number[]          // frequencyType=custom 时使用
  startDate?:        DateOnly          // 周期性任务开始日期
  endDate?:          DateOnly          // 周期性任务结束日期
  tags:              Tag[]
  dueDate?:          DateOnly
  recurrence?:           RecurrenceRule         // 重复任务规则（暂不在 MVP 实现）
  lastExecutionRecord?:  ExecutionRecord        // 最近一次执行记录（查询时聚合）

  // ── AI 维护标签（认知轴）──
  clarity:               ClarityLevel           // 清晰度：fuzzy → scoped → actionable
  complexity:            ComplexityTag[]         // 复杂度标签列表
  decomposition?:        DecompositionLevel      // 分解等级

  // ── 用户管理标签（执行轴）──
  captureMode:           CaptureMode             // 捕获模式
  energyProfile?:        EnergyProfile           // 能量画像
  schedulingConstraint?: SchedulingConstraint    // 调度约束
  tracking:              TrackingMode            // 追踪模式

  // ── AI 辅助扩展 ──
  aiTags:                Record<string, unknown> // AI 辅助扩展数据

  createdAt:             Timestamp
  updatedAt:             Timestamp
  completedAt?:          Timestamp
  archivedAt?:           Timestamp
  notes?:                Notes
}

type TaskStatus = 'draft' | 'active' | 'in_progress' | 'on_hold' | 'completed' | 'archived'
// @deprecated 'scheduled' 保留兼容，读取时映射为 'in_progress'

状态转换：
- draft → active, archived
- active → in_progress, on_hold, archived
- in_progress → on_hold, completed, archived
- on_hold → active, archived
- completed → archived
- archived →（终态）

// 暂不在 MVP 中实现，字段预留
interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly'
  interval:  number
  endDate?:  DateOnly
}
```

---

### 3.6a Thread（主线）

主线是任务的组织容器（替代原 Project），拥有独立的状态生命周期。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `USOM_ID` | 是 | UUID v4 |
| `status` | `ThreadStatus` | 是 | active/paused/completed/archived |
| `name` | `string` | 是 | 主线名称 |
| `description` | `string` | 否 | 主线描述 |
| `startDate` | `DateOnly` | 否 | 开始日期 |
| `endDate` | `DateOnly` | 否 | 结束日期 |
| `priority` | `Priority` | 否 | critical/high/medium/low |
| `color` | `string` | 否 | CSS 颜色标识 |
| `tags` | `Tag[]` | 是 | 标签数组 |
| `createdAt` | `Timestamp` | 是 | 创建时间 |
| `updatedAt` | `Timestamp` | 是 | 更新时间 |
| `completedAt` | `Timestamp` | 否 | 完成时间 |
| `archivedAt` | `Timestamp` | 否 | 归档时间 |

```typescript
interface Thread {
  id:                    USOM_ID
  status:                ThreadStatus
  name:                  string
  description?:          string
  startDate?:            DateOnly
  endDate?:              DateOnly
  priority?:             Priority
  color?:                string
  tags:                  Tag[]
  createdAt:             Timestamp
  updatedAt:             Timestamp
  completedAt?:          Timestamp
  archivedAt?:           Timestamp
}
```

---

> **注意**：`ProjectTemplate` 和 `TaskTemplate` 已在 Task Domain 重构中移除（MVP 不实现模板功能）。
> 原有 `3.7b ProjectTemplate` 和 `3.7c TaskTemplate` 定义已废弃。
  frequencyType?:      'once' | 'daily' | 'weekly' | 'custom'
  sortOrder:           number
  createdAt:           Timestamp
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

> **时间模型升级（2026-05-09）**：原 `scheduledTime` + `duration` 双字段升级为三字段时间窗口（`defaultTime` + `earliestTime` + `latestStartTime`）+ 双时长（`defaultDuration` + `minDuration`）+ 可追踪标记（`trackable`），支持弹性排程。`trackable=false` 的习惯仅占时（如午休），不计入 streak 和完成率。

```typescript
interface Habit {
  id:               USOM_ID
  status:           HabitStatus
  title:            string
  description?:     string
  frequency:        HabitFrequency
  defaultTime:      string           // HH:MM，e.g. "07:00" — 默认执行时间
  earliestTime:     string           // HH:MM — 最早可开始时间
  latestStartTime:    string           // HH:MM — 最迟可开始时间
  defaultDuration:  DurationMinutes  // 默认执行时长
  minDuration:      DurationMinutes  // 最短有效时长（低于此视为未完成）
  trackable:        boolean          // true=可追踪打卡, false=仅占时
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

**对象意图**：每次习惯执行的单次事实记录，是 Habit streak 计算的原始数据。HabitLog 的字段与 ExecutionRecord 对齐，确保跨 Domain 的语义一致性。

> 设计决策：HabitLog 作为独立对象而非嵌套在 Habit 内，便于按日期查询、支持复盘聚合、避免 Habit 对象无限增长。
> 
> **2026-05-28 变更**：
> - `status` → `completionStatus`，值域统一为 `CompletionStatus`
> - 新增 `plannedDuration`、`deviationMinutes`、`completionRating`、`energyLevel`
> - source 新增 `'timebox_sync'`，标识由时间盒确认触发的级联打卡

```typescript
interface HabitLog {
  id:                 USOM_ID
  habitId:            USOM_ID
  date:               DateOnly
  completionStatus:   CompletionStatus   // 替代旧的 HabitLogStatus，值域统一
  actualDuration?:    DurationMinutes
  plannedDuration?:   DurationMinutes    // 新增：计划时长（从 Habit.defaultDuration 取）
  deviationMinutes?:  number             // 新增：偏差分钟数（actual - planned）
  // 详细模式字段（可选展开）
  completionRating?:  number             // 新增：完成评分 1-5
  energyLevel?:       number             // 新增：能量水平 1-10
  note?:              Notes
  loggedAt:           Timestamp
  source:             'manual' | 'connector' | 'timebox_sync'
}

// HabitLogStatus 已废弃（2026-05-28），统一使用 CompletionStatus
// 值映射：'completed' → 'completed', 'skipped' → 'not_completed', 'partial' → 'partially_completed'
```

---

### 3.8a HabitTemplate（习惯模板）

**对象意图**：一组习惯的打包方案，可一键应用到某天生成多个 Timebox。模板中的习惯可覆盖默认时间和时长。

```typescript
interface HabitTemplate {
  id:              USOM_ID
  name:            string
  description?:    string
  icon?:           string                // 图标标识，e.g. "sunrise", "focus"
  status:          'draft' | 'active'
  applicableDays:  number[]              // 适用星期（0=Sunday ... 6=Saturday）
  habits:          TemplateHabitItem[]
  createdAt:       Timestamp
  updatedAt:       Timestamp
}

interface TemplateHabitItem {
  habitId:           USOM_ID
  sortOrder:         number              // 在模板中的排列顺序
  timeOverride?:     string              // HH:MM，覆盖习惯自身 defaultTime
  durationOverride?: DurationMinutes     // 覆盖习惯自身 defaultDuration
}
```

> **设计说明**：`HabitTemplate` 不是 USOM 核心业务对象的独立生命周期实体，而是习惯的组合编排工具。其 `status` 仅控制模板自身的可用性，不影响关联习惯的状态。

---

### 3.9 Timebox（时间盒）

**对象意图**：一段被显式划分给特定任务/习惯的时间区间，是时间结构的最小执行单元。

**生命周期**：`Planned → Running → Overtime → Ended → Logged`

> **状态枚举更新（2026-05-09）**：原 `Paused` 替换为 `Overtime`（超时运行），新增 `Cancelled`（取消）。设计理由：Timebox 本质是时间约束，超时比暂停更贴合语义。

| 状态 | 语义 |
|---|---|
| `Planned` | 已安排，未到开始时间 |
| `Running` | 计时中 |
| `Overtime` | 超过预定结束时间，仍在运行 |
| `Ended` | 时间到达结束点，等待记录 |
| `Cancelled` | 已取消，不生成执行记录 |
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
  overtimeAt?:     Timestamp       // 进入超时状态的时间
  endedAt?:        Timestamp
  loggedAt?:       Timestamp
  executionRecord?: ExecutionRecord // 执行记录（Logged 时填入）
  notes?:          Notes
}

type TimeboxStatus = 'planned' | 'running' | 'overtime' | 'ended' | 'cancelled' | 'logged'

// 执行记录类型（2026-05-28 升级为跨 Domain 共享类型）
type CompletionStatus = 'completed' | 'partially_completed' | 'not_completed'
type ExecutionSourceType = 'timebox' | 'habit' | 'task'

interface ExecutionRecordBase {
  completionStatus: CompletionStatus
  actualDuration: number
  plannedDuration: number
  deviationMinutes: number
  sourceType: ExecutionSourceType     // 新增：来源 Domain 标识
  loggedAt: Timestamp
}

interface SimpleExecutionRecord extends ExecutionRecordBase {
  mode: 'simple'
}

interface DetailedExecutionRecord extends ExecutionRecordBase {
  mode: 'detailed'
  completionRating: number
  actualOutput: string
  deviationReasons?: string
  energyLevel?: number
  notes?: string
}

type ExecutionRecord = SimpleExecutionRecord | DetailedExecutionRecord
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
  currentTimebox?:   TimeboxSummary      // status = 'running' | 'overtime'
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
  domainId:         DomainId
  version:          string
  requiredFields:   string[]   // Intent Engine 据此补全 StructuredIntent.fields
  subscribedEvents: SystemEventType[]
  intentTriggers?:  IntentTriggerInfo[]  // 域声明的意图触发器（用于 AI 面板快捷操作）
  viewRoutes?:      Record<string, ViewRouteInfo>  // 域声明的视图路由
}

// 意图触发器：描述域支持的意图动作及快捷方式
interface IntentTriggerInfo {
  action:      string    // 域内动作名，e.g. 'create_habit'
  shortcut?:   string    // 快捷指令，e.g. '/habit'
  description: string    // 动作描述
}

// 视图路由：域声明的 UI 组件路由
interface ViewRouteInfo {
  component: string                      // 组件名
  params?:   Record<string, unknown>     // 路由参数
}

interface MetricUpdate {
  metricKey:  string
  value:      number
  unit?:      string
}

interface ActionSurfaceSuggestion {
  actionType:       ActionType
  suggestionType:   'state_transition' | 'log_entry' | 'action_surface'   // 新增：建议类型（2026-05-28）
  targetType?:      USOMObjectType     // 目标对象类型
  targetId?:        USOM_ID            // 目标对象 ID
  payload?:         Record<string, unknown>  // 建议携带的数据
  label:            string
  weight:           number
}
```

---

### 4.4a ContextProvider（上下文提供者）

**对象意图**：Domain 的受控共享接口，通过只读投影将内部数据暴露给其他 Domain 的 Handler 消费。Provider 是 Context Engine 的数据来源。

```typescript
interface ContextProvider {
  provide(query: string, params: Record<string, unknown>): Promise<unknown>
}

interface ContextCapability {
  id: string                            // 全局唯一，如 'activeTasks'
  provider: ContextProvider
  visibility: 'private' | 'planning' | 'system'
  schema: ZodSchema                     // 输出类型校验
  description?: string
}
```

**Provider 约束**：
1. **读取** — 从本 Domain 的 Repository 获取数据
2. **投影** — 筛选/变换为对外共享格式
3. **聚合轻量信息** — 统计摘要（如完成率、连续天数）
4. **禁止** — planning / 决策 / 复杂计算 / 调用 AI

---

### 4.4b DomainHandler（领域处理器）

**对象意图**：Domain 的主动计算单元，负责生成型操作。接收 Context Engine 组装的完整数据，执行算法和/或 AI 调用，输出结构化的 proposal 和 presentation。

Handler 不做：数据获取（由 Context Engine 完成）、状态写入（由 State Machine 完成）、UI 渲染（由 Presentation Layer 完成）。

```typescript
interface GenerationRequest {
  intent: StructuredIntent              // 用户参数
  contexts: Record<string, unknown>     // Context Engine 组装的系统数据
  sessionId?: string                    // AI 会话 ID（多轮对话时传入）
  sessionHistory?: Array<{ role: string; content: string }>  // 会话历史
  reviseTarget?: string                 // 修订目标 proposal ID
  previousProposals?: GeneratedProposal[]  // 前次生成的 proposals（修订场景）
  tokenBudget?: { totalTokens: number; remainingTokens: number }  // Token 预算
}

interface Warning {
  code: string
  message: string
  severity: 'info' | 'warn' | 'error'
  affectedProposalIds?: string[]
}

interface GeneratedProposal {
  id: string
  action: string                        // 如 'createTimebox'
  payload: Record<string, unknown>      // proposal 具体内容
  sourceType: 'habit' | 'task' | 'planned' | 'adhoc'
  priority: string                      // 用户定义的优先级
  energyMatch?: {
    required: string                    // 如 'high'
    actual: string                      // 如 'medium'
    score: number                       // 0-1
  }
}

interface ProposalSet {
  id: string
  label?: string                        // 如 "高强度工作日"
  proposals: GeneratedProposal[]
  tags?: string[]
}

interface PresentationPayload {
  type: 'markdown' | 'kanban' | 'calendar' | 'timeline' | 'mindmap'
  content: unknown                      // 各类型自定义结构
}

interface GenerationResult {
  proposalSet: ProposalSet              // MVP: 单个 set
  alternatives?: ProposalSet[]          // 预留：多方案选择
  presentation?: PresentationPayload
  warnings?: Warning[]
}

interface DomainHandler {
  handle(request: GenerationRequest): Promise<GenerationResult>
  onGenerate?(request: GenerationRequest, aiRuntime: AIRuntime): Promise<GenerationResult>
  onQuery?(context: QueryContext, aiRuntime: AIRuntime): Promise<QueryResult>
}
```

---

### 4.4c Context Engine 流通类型

**对象意图**：Context Engine 是 Nexus 的新增组件，负责生成型操作的数据规划。

```typescript
// Context Registry — 系统级注册中心
// 管理所有 ContextCapability 的注册与查询

interface ContextRegistry {
  register(capability: ContextCapability): void
  resolve(
    capabilityId: string,
    query: string,
    params: Record<string, unknown>,
    requiredVisibility?: string
  ): Promise<unknown>
}

// Assembler — 将 StructuredIntent + manifest 声明组装为 GenerationRequest
interface ContextAssembler {
  assemble(intent: StructuredIntent, manifest: DomainManifest): Promise<GenerationRequest>
}
```

---

### 4.4d Query Path 类型

**对象意图**：支持 Orchestrator 三路径路由中的 Query Path，用于数据查询场景。Handler 通过 `onQuery` 接收查询上下文，返回文本或 CN-UI Surface 格式的结果。

```typescript
// 查询上下文 — Context Engine 产出，注入到 Handler.onQuery
interface QueryContext {
  intent: StructuredIntent
  contexts: Record<string, unknown>
  sessionId?: string
  sessionContext?: SessionQueryContext
}

// 同 Session 中的历史查询上下文
interface SessionQueryContext {
  priorQueries: PriorQueryEntry[]
}

interface PriorQueryEntry {
  action: string
  resultSummary: {
    count: number
    objectIds: string[]
    keyMetrics: Record<string, unknown>
  }
  answerText?: string
  cnuiSurfaceType?: string
  timestamp: string
  relevance: number
}

// 查询结果 — Handler.onQuery 或 Shortcut Path 的输出
type QueryResult =
  | { type: 'text'; content: string }
  | { type: 'cnui'; payload: CNUISurfacePayload }

// CN-UI Surface Payload（Query Path 输出用）
interface CNUISurfacePayload {
  surfaceType: string
  components: Array<{
    type: string
    props: Record<string, unknown>
  }>
  actions: Array<{
    type: string
    label: string
  }>
}
```

---

### 4.4e MemoryEpisode（记忆片段）

**对象意图**：AI Session 归档时自动生成的摘要记录，用于跨会话记忆。

```typescript
interface MemoryEpisode {
  id:          USOM_ID
  userId:      USOM_ID
  sessionId?:  USOM_ID       // 关联的 AI Session ID
  domainId?:   string        // 关联的 Domain ID
  action?:     string        // 触发的 action
  episodeType: string        // 默认 'session_summary'
  summary:     string
  metadata:    Record<string, unknown>
  createdAt:   Timestamp
}
```

---

### 4.6 StateProposal（状态变更提案）

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
  | 'intention' | 'project'
```

---

### 4.7 SystemEvent（系统事件）

**对象意图**：State Machine 向 Event Bus 发布的不可变事实记录，是 Domain.onEvent 和 Memory Framework 的消费输入。

```typescript
interface SystemEvent {
  id:          USOM_ID
  type:        SystemEventType
  occurredAt:  Timestamp
  triggeredBy: 'state_machine' | 'time_trigger' | 'template_apply' | 'context_engine' | 'handler'
  payload:     Record<string, unknown>  // 只包含该事件类型必需的最小字段
  snapshotId:  USOM_ID                 // 产生该事件时的 ContextSnapshot 引用
}

type SystemEventType =
  | 'TaskCreated' | 'TaskActivated' | 'TaskScheduled' | 'TaskCompleted' | 'TaskArchived'
  | 'HabitCreated' | 'HabitActivated' | 'HabitSuspended' | 'HabitArchived'
  | 'HabitLogged' | 'HabitSkipped' | 'HabitStreakMilestone'
  | 'TimeboxCreated' | 'TimeboxStarted' | 'TimeboxOvertime' | 'TimeboxEnded' | 'TimeboxLogged' | 'TimeboxCancelled'
  | 'ObjectiveCreated' | 'ObjectiveActivated' | 'ObjectivePaused' | 'ObjectiveResumed'
  | 'ObjectiveCompleted' | 'ObjectiveDiscarded' | 'ObjectiveArchived'
  | 'KeyResultUpdated' | 'KeyResultCompleted' | 'KeyResultProgressUpdated'
  | 'ReviewCreated' | 'ReviewCompleted'
  | 'IntentionCaptured' | 'IntentionDissolved'
  | 'ThreadCreated' | 'ThreadPaused' | 'ThreadResumed'
  | 'ThreadCompleted' | 'ThreadArchived'
  | 'ExecutionLogged'                                    // 新增：跨 Domain 执行记录事件
  | 'GenerativeContextAssembled' | 'GenerativeHandlerCompleted'
  | 'GenerativeUserConfirmed' | 'GenerativeProposalRejected' | 'GenerativeBatchExecuted'

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

### 4.8 ActionCandidate（行动候选）

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
  | 'streak_milestone_hint'   // 连续打卡里程碑提示
  | 'habit_risk_warning'      // 习惯断链风险预警
  | 'complete_task'
  | 'start_timebox'
  | 'review_okr'
  | 'create_review'
  | 'capture_intent'
  | 'snooze'
  | 'skip'
```

---

### 4.9 ExternalEvent（外部事件，MVP 接口预留）

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
  defaultTime:   string   // HH:MM
  trackable:     boolean  // true=可追踪打卡, false=仅占时
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
  startedAt?:      Timestamp
  overtimeAt?:     Timestamp
  endedAt?:        Timestamp
  loggedAt?:       Timestamp
  executionRecord?: ExecutionRecord
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
| Objective | Active / Paused / Draft → Discarded | Discarded 不可恢复为 Active |
| Objective | 任意 → Archived | Archived 不可恢复 |
| KeyResult | 跟随父 Objective；Active 时可更新 currentValue | Completed 后 currentValue 锁定 |
| KeyResult | Active / Draft → Discarded | 跟随父 Objective 废弃 |
| Task | Draft → Active → Scheduled → Completed | Scheduled 取消排期 → Active（可回退） |
| Task | Active / Scheduled / Draft → Archived | Completed 不可回退 Active |
| Habit | Draft → Active（依据 startDate 自动触发）| — |
| Habit | Active ↔ Suspended（可多次）| Archived 不可恢复 |
| HabitLog | 创建时确定 status | 创建后 status 不可修改（事实记录） |
| Timebox | Planned → Running → Overtime → Running（可反复） | Ended 后只能 → Logged |
| Timebox | Running / Overtime → Ended（时间触发） | Logged 后不可修改 |
| Timebox | Planned / Running → Cancelled | Cancelled 后不可恢复 |
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
- `HabitTemplate`、`TemplateHabitItem`
- `Timebox`、`TimeboxStatus`、`ExecutionRecord`
- `StructuredIntent`、`StateProposal`
- `SystemEvent` 及核心 `SystemEventType`
- `ActionCandidate`、`ActionCategory`、`ActionType`
- Domain Plugin 四钩子签名（4.4 节）

### 第二批（OKR 路径）

- `Objective`、`KeyResult`
- `ObjectiveSummary`、`KeyResultSummary`

### 第三批（复盘路径）

- `Review`、`ReviewSection`、`ReviewMetrics`

### 第四批（AI 会话 + 用户设置）

- `ChatMessage`（AISession 嵌套类型）
  - `role`: 'user' | 'assistant' | 'system'
  - `content`: string
  - `timestamp`: Timestamp
  - `intentRef?`: string
- `AISession`
  - `id`: USOM_ID
  - `userId`: string
  - `title`: string
  - `status`: 'created' | 'active' | 'completing' | 'archived' | 'deleted' | 'closed'
  - `domainId?`: string
  - `action?`: string
  - `sessionMode`: 'single_shot'
  - `messages`: ChatMessage[]
  - `stateSnapshot`: Record<string, unknown>
  - `referencedObjectIds`: USOM_ID[]
  - `createdAt`: Timestamp
  - `updatedAt`: Timestamp
  - `archivedAt?`: Timestamp
  - 生命周期：created → active → completing → closed/archived；active → archived；archived → active(恢复)；active 不可直接 deleted
- `AISessionSummary`（列表摘要）
  - `id`: USOM_ID, `title`: string, `status`: AISessionStatus, `domainId?`: string, `action?`: string, `createdAt`: Timestamp, `updatedAt`: Timestamp
- `LLMConfig`
  - `activeProvider?`: string, `providers?`: Record<string, { baseUrl?: string, models?: { default?: string, thinking?: string, quick?: string } }>
- `UserSettings`
  - `id`: USOM_ID, `userId`: string, `timezone`: string
  - `llmConfig?`: LLMConfig, `uiPrefs?`: Record<string, unknown>

### AI Runtime 基础设施类型

- `AITaskType` = `'intent_routing' | 'field_extraction' | 'content_generation' | 'summary' | 'cn_ui_revision'`
- `TokenUsage`
  - `input`: number, `output`: number, `total`: number
- `TokenUsageRecord`
  - `domainId`: DomainId, `action`: string, `taskType`: AITaskType, `model`: string
  - `input`: number, `output`: number, `cost?`: number, `timestamp`: Timestamp
- `TokenDailySummary`
  - `date`: DateOnly, `totalTokens`: number, `totalCost`: number
  - `byDomain`: Record<DomainId, { tokens: number; calls: number }>
  - `byTaskType`: Record<AITaskType, { tokens: number; calls: number }>
- `LLMProviderConfig`
  - `provider`: 'anthropic' | 'openai' | 'ollama'
  - `model`: string, `timeout`: number (default 30000ms), `maxRetries`: number (default 2)
  - `fallback?`: LLMProviderConfig

### CN-UI 协议类型

- `CNUISurface`
  - `id`: USOM_ID
  - `type`: string（组件目录中的类型 ID，如 'habit-creation-card'）
  - `status`: 'rendering' | 'interacting' | 'completed' | 'closed'
  - `components`: CNUIComponent[]
  - `dataModel`: Record<string, unknown>
- `CNUIComponent`
  - `id`: string, `type`: string, `props`: Record<string, unknown>
- `CNUIEvent`
  - `type`: 'input_change' | 'button_click' | 'item_reorder' | 'item_delete' | 'form_submit' | 'cancel'
  - `CNUISurfaceId`: USOM_ID, `componentId?`: string, `payload`: unknown, `timestamp`: Timestamp
- `CNUIMessage extends ChatMessage`
  - `role`: 'assistant', `type`: 'cnui_surface'
  - `CNUISurfaceId`: USOM_ID, `CNUISurfaceType`: string
  - `action`: 'created' | 'updated' | 'completed' | 'cancelled'
  - `dataSnapshot?`: Record<string, unknown>
- `CNUISurfaceStoreData`（MVP：内存 Map 的 value 类型）
  - `CNUISurfaceType`: string, `sessionId`: USOM_ID
  - `dataModel`: Record<string, unknown>
  - `status`: 'rendering' | 'interacting' | 'completed' | 'closed'

### AI Runtime 错误类型

- `AIRuntimeError extends Error`
  - `code`: 'TIMEOUT' | 'RATE_LIMITED' | 'PROVIDER_ERROR' | 'NETWORK_ERROR'
  - `retries`: number, `fallbackAttempted`: boolean
- `CNUISchemaError extends Error`
  - `surfaceType`: string, `validationErrors`: string[]

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

*文档版本：2026_05_25*
*关联上级文档：LW_overall_总体设计_2026_03_18.md*
*关联数据库文档：LW_database_数据库设计_2026_03_21.md*
