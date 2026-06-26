/**
 * @file objects
 * @brief USOM 核心对象定义
 * @see docs/usom-design.md Section 3
 */

import type {
  USOM_ID, Timestamp, DateOnly, DurationMinutes, Notes, Tag,
  Priority, EnergyLevel, PeriodType, EnergyScore, EnergySource,
  Chronotype, EnergyCurvePoint, EnergySensitivity,
  ObjectiveStatus, KeyResultStatus, TaskStatus, HabitStatus,
  CompletionStatus, TimeboxStatus, ReviewStatus, IntentionStatus,
  ThreadStatus, AISessionStatus,
  ClarityLevel, ComplexityTag, DecompositionLevel, CaptureMode,
  EnergyProfile, SchedulingConstraint, TrackingMode,
} from './primitives'

// ─── 3.1 User ─────────────────────────────────────────────────
/**
 * 用户接口
 * @property id - 用户唯一标识
 * @property email - 用户邮箱
 * @property createdAt - 创建时间
 * @property updatedAt - 更新时间
 */
export interface User {
  id: USOM_ID
  email: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── 3.2 UserCalibration ───────────────────────────────────────
/**
 * 用户校准接口，存储用户的个性化配置和能量模型
 * @property userId - 用户ID
 * @property afternoonStart - 下午开始时间（小时）
 * @property eveningStart - 傍晚开始时间（小时）
 * @property nightStart - 夜晚开始时间（小时）
 * @property peakEnergyStart - 能量高峰开始时间
 * @property peakEnergyEnd - 能量高峰结束时间
 * @property energyConfidence - 能量预测置信度
 * @property chronotype - 生物钟类型
 * @property baselineCurve - 24小时能量基线曲线
 * @property sensitivity - 能量敏感度
 * @property lastEnergyCalibrationAt - 最后能量校准时间
 * @property comfortableWipLimit - 舒适的在办事项上限
 * @property sustainableDeepWorkHours - 可持续深度工作时长
 * @property habitRiskDays - 习惯风险日期列表
 * @property habitPreferredTimeSlots - 习惯偏好时间段
 * @property ruleOverrideHistory - 规则覆盖历史
 * @property updatedAt - 更新时间
 */
export interface UserCalibration {
  userId: USOM_ID
  afternoonStart: number
  eveningStart: number
  nightStart: number
  peakEnergyStart: number
  peakEnergyEnd: number
  energyConfidence: number
  chronotype: Chronotype
  baselineCurve: EnergyCurvePoint[]
  sensitivity: EnergySensitivity
  lastEnergyCalibrationAt?: Timestamp
  comfortableWipLimit: number
  sustainableDeepWorkHours: number
  habitRiskDays: number[]
  habitPreferredTimeSlots: string[]
  ruleOverrideHistory: Record<string, RuleOverrideEntry>
  updatedAt: Timestamp
}

/**
 * 规则覆盖记录
 * @property ruleKey - 规则标识
 * @property overrideAt - 覆盖时间
 * @property context - 覆盖上下文
 */
export interface RuleOverrideEntry {
  ruleKey: string
  overrideAt: Timestamp
  context: string
}

// ─── 3.3 Intention ─────────────────────────────────────────────
/**
 * 意图接口，代表用户的原始输入意图
 * @property id - 意图唯一标识
 * @property status - 意图状态
 * @property rawInput - 用户原始输入文本
 * @property inputMode - 输入模式（自然语言/表单/命令）
 * @property capturedAt - 捕获时间
 * @property dissolvedAt - 消解时间（可选）
 * @property sourceSnapshotId - 来源快照ID
 * @property notes - 备注
 */
export interface Intention {
  id: USOM_ID
  status: IntentionStatus
  rawInput: string
  inputMode: 'natural_language' | 'template_form' | 'slash_command'
  capturedAt: Timestamp
  dissolvedAt?: Timestamp
  sourceSnapshotId?: USOM_ID
  notes?: Notes
}

// ─── 3.4 StructuredIntent ──────────────────────────────────────
/**
 * 结构化意图接口，由意图引擎解析后生成
 * @property id - 结构化意图唯一标识
 * @property intentionId - 关联的原始意图ID
 * @property targetDomain - 目标域
 * @property action - 动作类型
 * @property fields - 动作参数字段
 * @property confidence - 解析置信度（0-1）
 * @property resolvedBy - 解析方式（AI/表单）
 * @property pathType - 路径类型（契约型/生成型/查询型）
 * @property createdAt - 创建时间
 */
export interface StructuredIntent {
  id: USOM_ID
  intentionId: USOM_ID
  targetDomain: string
  action: string
  fields: Record<string, unknown>
  confidence: number
  resolvedBy: 'ai' | 'template_form' | 'cnui_surface'
  pathType?: 'contract' | 'generative' | 'query'
  createdAt: Timestamp
}

// ─── 3.5a Cycle ──────────────────────────────────────────────
/**
 * OKR 周期（一级对象）。多个 Objective 归属同一 Cycle。
 * 总体健康度读时聚合、不落库。
 * @property id - 周期唯一标识
 * @property cycleType - 周期类型（年度/季度/月度/半年/自定义）
 * @property name - 周期名称
 * @property period - 周期起止区间（Cycle 自身字段，独占周期信息）
 * @property status - 周期生命周期状态（draft/not_started/in_progress/ended/reviewed）
 * @property createdAt - 创建时间
 * @property updatedAt - 更新时间
 * @property startedAt - 进入 in_progress 的时间
 * @property endedAt - 进入 ended 的时间
 * @property reviewedAt - 进入 reviewed 的时间
 */
export interface Cycle {
  id: USOM_ID
  cycleType: 'annual' | 'quarterly' | 'monthly' | 'semi_annual' | 'custom'
  name: string
  period: { start: DateOnly; end: DateOnly }
  status: 'draft' | 'not_started' | 'in_progress' | 'ended' | 'reviewed'
  createdAt: Timestamp
  updatedAt: Timestamp
  startedAt?: Timestamp
  endedAt?: Timestamp
  reviewedAt?: Timestamp
}

// ─── 3.5 Objective ────────────────────────────────────────────
/**
 * 目标接口（OKR 目标）
 * @property id - 目标唯一标识
 * @property status - 目标状态
 * @property title - 目标标题
 * @property description - 目标描述
 * @property cycleId - 权威周期归属，指向 Cycle（见 §3.5a）
 * @property period - 目标周期（派生只读）
 * @property parentId - 父目标ID（用于层级结构）
 * @property keyResultIds - 关联的关键结果ID列表
 * @property tags - 标签列表
 * @property createdAt - 创建时间
 * @property updatedAt - 更新时间
 * @property okrType - OKR类型（愿景型/承诺型）
 * @property objectiveNumber - 目标编号
 * @property priority - 优先级（P0/P1/P2）
 * @property discardedAt - 废弃时间
 * @property completedAt - 完成时间
 * @property archivedAt - 归档时间
 */
export interface Objective {
  id: USOM_ID
  status: ObjectiveStatus
  title: string
  description?: string
  /** 权威周期归属，指向 Cycle */
  cycleId: USOM_ID
  /** 派生只读：repo 读时 join cycle 填充，不落库 */
  period: {
    type: PeriodType
    start: DateOnly
    end: DateOnly
  }
  parentId?: USOM_ID
  keyResultIds: USOM_ID[]
  tags: Tag[]
  createdAt: Timestamp
  updatedAt: Timestamp
  okrType: 'visionary' | 'committed'
  objectiveNumber: string
  priority: 'P0' | 'P1' | 'P2'
  discardedAt?: Timestamp
  completedAt?: Timestamp
  archivedAt?: Timestamp
}

// ─── 3.6 KeyResult ────────────────────────────────────────────
/**
 * 关键结果接口（OKR 关键结果）
 * @property id - 关键结果唯一标识
 * @property objectiveId - 关联的目标ID
 * @property title - 关键结果标题
 * @property description - 关键结果描述
 * @property targetValue - 目标值
 * @property currentValue - 当前值
 * @property unit - 单位
 * @property progressRate - 进度比率（0-1）
 * @property status - 关键结果状态
 * @property dueDate - 截止日期
 * @property discardedAt - 废弃时间
 * @property createdAt - 创建时间
 * @property updatedAt - 更新时间
 */
export interface KeyResult {
  id: USOM_ID
  objectiveId: USOM_ID
  title: string
  description?: string
  targetValue: number
  currentValue: number
  unit: string
  progressRate: number
  status: KeyResultStatus
  dueDate?: DateOnly
  discardedAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── 3.6b Contribution ─────────────────────────────────────────
/**
 * KR 贡献记录（OKR 域私有 junction）
 *
 * 记录外部对象对 KeyResult 进度的贡献链接。
 * contributorType + contributorId 为不透明引用，OKR 不感知来源内部结构。
 * @property id - 贡献记录唯一标识
 * @property keyResultId - 关联的关键结果ID
 * @property contributorType - 贡献者类型（task/habit/manual）
 * @property contributorId - 贡献者ID
 * @property delta - 贡献增量（可选）
 * @property weight - 贡献权重（可选）
 * @property createdAt - 创建时间
 * @property updatedAt - 更新时间
 */
export interface Contribution {
  id: USOM_ID
  keyResultId: USOM_ID
  contributorType: 'task' | 'habit' | 'manual'
  contributorId: USOM_ID
  delta?: number
  weight?: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── 3.6a Thread ──────────────────────────────────────────────
/**
 * 主线接口（替代原 Project）
 * @property id - 主线唯一标识
 * @property status - 主线状态
 * @property name - 主线名称
 * @property description - 主线描述
 * @property color - 主线颜色
 * @property startDate - 开始日期
 * @property endDate - 结束日期
 * @property priority - 优先级
 * @property tags - 标签列表
 * @property createdAt - 创建时间
 * @property updatedAt - 更新时间
 * @property completedAt - 完成时间
 * @property archivedAt - 归档时间
 */
export interface Thread {
  id: USOM_ID
  status: ThreadStatus
  name: string
  description?: string
  color?: string
  startDate?: DateOnly
  endDate?: DateOnly
  priority?: Priority
  tags: Tag[]
  createdAt: Timestamp
  updatedAt: Timestamp
  completedAt?: Timestamp
  archivedAt?: Timestamp
}

// ─── 3.7 Task ─────────────────────────────────────────────────
/**
 * 任务接口
 * @property id - 任务唯一标识
 * @property status - 任务状态
 * @property title - 任务标题
 * @property description - 任务描述
 * @property priority - 优先级
 * @property energyRequired - 能量需求等级
 * @property estimatedDuration - 预计持续时间（分钟），模糊任务可为 null
 * @property actualDuration - 实际持续时间（分钟）
 * @property threadId - 关联的主线ID
 * @property parentId - 父任务ID（用于任务层级）
 * @property clarity - 清晰度等级
 * @property complexity - 复杂度标签列表
 * @property decomposition - 分解等级
 * @property captureMode - 捕获模式
 * @property energyProfile - 能量画像
 * @property schedulingConstraint - 调度约束
 * @property tracking - 追踪模式
 * @property aiTags - AI 辅助扩展数据
 * @property tags - 标签列表
 * @property dueDate - 截止日期
 * @property recurrence - 重复规则
 * @property createdAt - 创建时间
 * @property updatedAt - 更新时间
 * @property completedAt - 完成时间
 * @property archivedAt - 归档时间
 * @property startDate - 开始日期
 * @property endDate - 结束日期
 * @property lastExecutionRecord - 最近一次执行记录（查询时聚合，非持久化）
 * @property notes - 备注
 */
export interface Task {
  id: USOM_ID
  status: TaskStatus
  title: string
  description?: string
  priority: Priority
  energyRequired: EnergyLevel
  estimatedDuration?: number
  actualDuration?: number
  threadId?: USOM_ID
  parentId?: USOM_ID
  clarity: ClarityLevel
  complexity: ComplexityTag[]
  decomposition?: DecompositionLevel
  captureMode: CaptureMode
  energyProfile?: EnergyProfile
  schedulingConstraint?: SchedulingConstraint
  tracking: TrackingMode
  aiTags: Record<string, unknown>
  tags: Tag[]
  dueDate?: DateOnly
  recurrence?: RecurrenceRule
  createdAt: Timestamp
  updatedAt: Timestamp
  completedAt?: Timestamp
  archivedAt?: Timestamp
  startDate?: DateOnly
  endDate?: DateOnly
  /** 最近一次执行记录（查询时从 task_execution_logs 聚合，非持久化字段） */
  lastExecutionRecord?: ExecutionRecord
  notes?: Notes
}

// ─── 3.7d TaskExecutionLog ────────────────────────────────────
/**
 * 任务执行记录接口
 * @property id - 记录唯一标识
 * @property taskId - 关联的任务ID
 * @property timeboxId - 关联的时间盒ID
 * @property completionStatus - 完成状态
 * @property actualDuration - 实际持续时间（分钟）
 * @property plannedDuration - 计划持续时间（分钟）
 * @property deviationMinutes - 偏差时间（分钟）
 * @property completionRating - 完成质量评分
 * @property actualOutput - 实际产出
 * @property deviationReasons - 偏差原因
 * @property energyLevel - 执行时的能量等级
 * @property note - 备注
 * @property loggedAt - 记录时间
 * @property source - 记录来源（手动/时间盒同步）
 */
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

// MVP stub — type only, no business logic
/**
 * 重复规则接口（MVP 阶段预留）
 * @property frequency - 重复频率
 * @property interval - 重复间隔
 * @property endDate - 结束日期
 */
export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number
  endDate?: DateOnly
}

// ─── 3.8 Habit ────────────────────────────────────────────────
/**
 * 习惯接口
 * @property id - 习惯唯一标识
 * @property status - 习惯状态
 * @property title - 习惯标题
 * @property description - 习惯描述
 * @property frequency - 习惯频率
 * @property defaultTime - 默认执行时间（HH:MM）
 * @property earliestTime - 最早开始时间（HH:MM）
 * @property latestStartTime - 最晚开始时间（HH:MM）
 * @property defaultDuration - 默认持续时间（分钟）
 * @property minDuration - 最小持续时间（分钟）
 * @property trackable - 是否可追踪
 * @property startDate - 开始日期
 * @property endDate - 结束日期
 * @property streak - 当前连续打卡天数
 * @property longestStreak - 最长连续打卡天数
 * @property completionRate7d - 7天完成率
 * @property tags - 标签列表
 * @property createdAt - 创建时间
 * @property updatedAt - 更新时间
 * @property suspendedAt - 暂停时间
 * @property archivedAt - 归档时间
 * @property notes - 备注
 */
export interface Habit {
  id: USOM_ID
  status: HabitStatus
  title: string
  description?: string
  frequency: HabitFrequency
  defaultTime: string // HH:MM
  earliestTime: string // HH:MM
  latestStartTime: string // HH:MM
  defaultDuration: DurationMinutes
  minDuration: DurationMinutes
  trackable: boolean
  startDate: DateOnly
  endDate?: DateOnly
  streak: number
  longestStreak: number
  completionRate7d: number
  tags: Tag[]
  createdAt: Timestamp
  updatedAt: Timestamp
  suspendedAt?: Timestamp
  archivedAt?: Timestamp
  notes?: Notes
}

/**
 * 习惯频率接口
 * @property type - 频率类型（每日/每周/自定义）
 * @property daysOfWeek - 每周重复的天数（0=周日，6=周六）
 */
export interface HabitFrequency {
  type: 'daily' | 'weekly' | 'custom'
  daysOfWeek?: number[] // 0=Sunday ... 6=Saturday
}

// ─── 3.8a HabitTemplate ────────────────────────────────────────
/**
 * 习惯模板接口
 * @property id - 模板唯一标识
 * @property name - 模板名称
 * @property description - 模板描述
 * @property icon - 模板图标
 * @property status - 模板状态（草稿/活跃）
 * @property applicableDays - 适用日期（0=周日，6=周六）
 * @property habits - 习惯列表
 * @property createdAt - 创建时间
 * @property updatedAt - 更新时间
 */
export interface HabitTemplate {
  id: USOM_ID
  name: string
  description?: string
  icon?: string
  status: 'draft' | 'active'
  applicableDays: number[] // 0=Sunday ... 6=Saturday
  habits: TemplateHabitItem[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

/**
 * 模板习惯项接口
 * @property habitId - 习惯ID
 * @property sortOrder - 排序顺序
 * @property timeOverride - 时间覆盖（HH:MM）
 * @property durationOverride - 持续时间覆盖（分钟）
 */
export interface TemplateHabitItem {
  habitId: USOM_ID
  sortOrder: number
  timeOverride?: string // HH:MM
  durationOverride?: DurationMinutes
}

// ─── 3.9 HabitLog ─────────────────────────────────────────────
/**
 * 习惯打卡记录接口
 * @property id - 记录唯一标识
 * @property habitId - 关联的习惯ID
 * @property date - 打卡日期
 * @property completionStatus - 完成状态
 * @property actualDuration - 实际持续时间（分钟）
 * @property plannedDuration - 计划持续时间（分钟）
 * @property deviationMinutes - 偏差时间（分钟）
 * @property completionRating - 完成质量评分
 * @property energyLevel - 执行时的能量等级
 * @property note - 备注
 * @property loggedAt - 记录时间
 * @property source - 记录来源（手动/连接器/时间盒同步）
 */
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

// ─── Execution Source Type ─────────────────────────────────────
/**
 * 执行来源类型
 * - timebox: 时间盒
 * - habit: 习惯
 * - task: 任务
 */
export type ExecutionSourceType = 'timebox' | 'habit' | 'task'

// ─── Execution Record Types ────────────────────────────────────
/**
 * 执行记录基础接口
 * @property completionStatus - 完成状态
 * @property actualDuration - 实际持续时间（分钟）
 * @property plannedDuration - 计划持续时间（分钟）
 * @property deviationMinutes - 偏差时间（分钟）
 * @property sourceType - 来源类型
 * @property loggedAt - 记录时间
 */
export interface ExecutionRecordBase {
  completionStatus: CompletionStatus
  actualDuration: number
  plannedDuration: number
  deviationMinutes: number
  sourceType: ExecutionSourceType
  loggedAt: string
}

/**
 * 简单执行记录接口
 * @property mode - 模式标识（simple）
 */
export interface SimpleExecutionRecord extends ExecutionRecordBase {
  mode: 'simple'
}

/**
 * 详细执行记录接口
 * @property mode - 模式标识（detailed）
 * @property completionRating - 完成质量评分
 * @property actualOutput - 实际产出
 * @property deviationReasons - 偏差原因
 * @property energyLevel - 执行时的能量等级
 * @property notes - 备注
 */
export interface DetailedExecutionRecord extends ExecutionRecordBase {
  mode: 'detailed'
  completionRating: number
  actualOutput: string
  deviationReasons?: string
  energyLevel?: number
  notes?: string
}

/**
 * 执行记录类型（简单或详细）
 */
export type ExecutionRecord = SimpleExecutionRecord | DetailedExecutionRecord

// ─── 3.10 Timebox ─────────────────────────────────────────────
/**
 * 时间盒接口
 * @property id - 时间盒唯一标识
 * @property status - 时间盒状态
 * @property title - 时间盒标题
 * @property startTime - 开始时间
 * @property endTime - 结束时间
 * @property taskIds - 关联的任务ID列表
 * @property habitIds - 关联的习惯ID列表
 * @property isRecurring - 是否重复
 * @property recurrenceRule - 重复规则
 * @property tags - 标签列表
 * @property createdAt - 创建时间
 * @property updatedAt - 更新时间
 * @property startedAt - 开始执行时间
 * @property overtimeAt - 超时时间
 * @property endedAt - 结束时间
 * @property loggedAt - 记录时间
 * @property executionRecord - 执行记录
 * @property notes - 备注
 */
export interface Timebox {
  id: USOM_ID
  status: TimeboxStatus
  title: string
  startTime: Timestamp
  endTime: Timestamp
  taskIds: USOM_ID[]
  habitIds: USOM_ID[]
  isRecurring: boolean
  recurrenceRule?: RecurrenceRule
  tags: Tag[]
  createdAt: Timestamp
  updatedAt: Timestamp
  startedAt?: Timestamp
  overtimeAt?: Timestamp
  endedAt?: Timestamp
  loggedAt?: Timestamp
  executionRecord?: ExecutionRecord
  notes?: Notes
}

// ─── 3.11 Review ──────────────────────────────────────────────
/**
 * 复盘接口
 * @property id - 复盘唯一标识
 * @property status - 复盘状态
 * @property type - 复盘周期类型
 * @property periodStart - 复盘周期开始日期
 * @property periodEnd - 复盘周期结束日期
 * @property generatedBy - 生成方式（AI/手动）
 * @property sections - 复盘章节列表
 * @property metrics - 复盘指标
 * @property createdAt - 创建时间
 * @property updatedAt - 更新时间
 * @property completedAt - 完成时间
 * @property archivedAt - 归档时间
 */
export interface Review {
  id: USOM_ID
  status: ReviewStatus
  type: PeriodType
  periodStart: DateOnly
  periodEnd: DateOnly
  generatedBy: 'ai' | 'manual'
  sections: ReviewSection[]
  metrics: ReviewMetrics
  createdAt: Timestamp
  updatedAt: Timestamp
  completedAt?: Timestamp
  archivedAt?: Timestamp
}

/**
 * 复盘章节接口
 * @property key - 章节标识
 * @property title - 章节标题
 * @property content - 章节内容（Markdown格式）
 */
export interface ReviewSection {
  key: string
  title: string
  content: string // Markdown
}

/**
 * 复盘指标接口
 * @property tasksCompleted - 完成任务数
 * @property tasksTotal - 总任务数
 * @property habitsCompleted - 完成习惯数
 * @property habitsTotal - 总习惯数
 * @property timeboxedHours - 时间盒小时数
 * @property focusScore - 专注分数（0-100）
 */
export interface ReviewMetrics {
  tasksCompleted: number
  tasksTotal: number
  habitsCompleted: number
  habitsTotal: number
  timeboxedHours: number
  focusScore?: number // 0-100
}

/**
 * CN-UI 表面生命周期状态
 * - active: 活跃中
 * - saved: 已保存
 * - cancelled: 已取消
 */
export type SurfaceState = 'active' | 'saved' | 'cancelled'

/**
 * CN-UI 表面引用（嵌入 ChatMessage 用于对话内渲染）
 * @property cnuiSurfaceId - 表面ID
 * @property cnuiSurfaceType - 表面类型
 * @property domainId - 域ID
 * @property action - 动作类型
 * @property dataSnapshot - 数据快照
 * @property state - 表面状态
 */
export interface CnuiSurfaceRef {
  cnuiSurfaceId: string
  cnuiSurfaceType: string
  domainId: string
  action: string
  dataSnapshot?: Record<string, unknown>
  state?: SurfaceState
}

// ─── ChatMessage (embedded in AISession) ──────────────────────
/**
 * 聊天消息接口（嵌入在 AISession 中）
 * @property id - 消息ID
 * @property role - 角色（用户/助手/系统）
 * @property content - 消息内容
 * @property timestamp - 时间戳
 * @property intentRef - 关联的意图引用
 * @property cnuiSurface - CN-UI 表面引用
 */
export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Timestamp
  intentRef?: string
  cnuiSurface?: CnuiSurfaceRef
}

// ─── 3.12 AISession ──────────────────────────────────────────
/**
 * AI 会话接口
 * @property id - 会话唯一标识
 * @property userId - 用户ID
 * @property title - 会话标题
 * @property status - 会话状态
 * @property messages - 消息列表
 * @property stateSnapshot - 状态快照
 * @property referencedObjectIds - 引用的对象ID列表
 * @property createdAt - 创建时间
 * @property updatedAt - 更新时间
 * @property archivedAt - 归档时间
 * @property deletedAt - 删除时间
 */
export interface AISession {
  id: USOM_ID
  userId: string
  title: string
  status: AISessionStatus
  messages: ChatMessage[]
  stateSnapshot: Record<string, unknown>
  referencedObjectIds: USOM_ID[]
  createdAt: Timestamp
  updatedAt: Timestamp
  archivedAt?: Timestamp
  deletedAt?: Timestamp
}

/**
 * AI 会话摘要接口
 * @property id - 会话唯一标识
 * @property title - 会话标题
 * @property status - 会话状态
 * @property createdAt - 创建时间
 * @property updatedAt - 更新时间
 */
export interface AISessionSummary {
  id: USOM_ID
  title: string
  status: AISessionStatus
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── 3.13 LLMConfig (embedded in UserSettings) ────────────────
/**
 * LLM 配置接口（嵌入在 UserSettings 中）
 * @property activeProvider - 活跃的提供者
 * @property providers - 提供者配置记录
 */
export interface LLMConfig {
  activeProvider?: string
  providers?: Record<string, {
    baseUrl?: string
    models?: {
      default?: string
      thinking?: string
      quick?: string
    }
  }>
}

// ─── 3.14 UserSettings ───────────────────────────────────────
/**
 * 用户设置接口
 * @property id - 设置唯一标识
 * @property userId - 用户ID
 * @property timezone - 时区
 * @property llmConfig - LLM 配置
 * @property uiPrefs - UI 偏好设置
 */
export interface UserSettings {
  id: USOM_ID
  userId: string
  timezone: string
  llmConfig?: LLMConfig
  uiPrefs?: Record<string, unknown>
}
