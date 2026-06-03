/**
 * @file primitives
 * @brief USOM 共享基础类型定义
 * @see docs/usom-design.md Section 2
 */

// ─── Base ID Type ──────────────────────────────────────────────
/**
 * USOM 对象唯一标识符，采用 UUID v4 格式
 */
export type USOM_ID = string // UUID v4

// ─── Time Types (ISO 8601, UTC storage) ────────────────────────
/**
 * 时间戳类型，采用 ISO 8601 UTC 格式
 * @example "2026-03-19T08:00:00Z"
 */
export type Timestamp = string

/**
 * 日期类型，仅包含年月日，采用 ISO 8601 格式
 * @example "2026-03-19"
 */
export type DateOnly = string

// ─── Enum: Priority ────────────────────────────────────────────
/**
 * 优先级枚举
 * - Critical: 紧急，需要立即处理
 * - High: 高优先级
 * - Medium: 中等优先级
 * - Low: 低优先级
 */
export enum Priority {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

// ─── Enum: Energy Level ───────────────────────────────────────
/**
 * 能量等级枚举，用于任务/习惯的能量需求评估
 * - High: 高能量需求（如深度工作）
 * - Medium: 中等能量需求
 * - Low: 低能量需求（如轻松任务）
 */
export enum EnergyLevel {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

// ─── Energy Score (1-10, single dimension for MVP) ─────────────
/**
 * 能量分数，范围 1-10，用于量化用户当前能量状态
 */
export type EnergyScore = number // 1-10

// ─── Energy Source ─────────────────────────────────────────────
/**
 * 能量来源类型
 * - system: 系统推断的能量值
 * - user: 用户手动校准的能量值
 */
export type EnergySource = 'system' | 'user'

// ─── Energy State (embedded in ContextSnapshot) ────────────────
/**
 * 能量状态接口，嵌入在上下文快照中
 * @property inferredLevel - 系统推断的能量等级
 * @property calibratedLevel - 用户校准的能量等级（可为空）
 * @property activeLevel - 当前活跃的能量等级
 * @property source - 能量来源
 * @property lastCalibratedAt - 最后校准时间
 */
export interface EnergyState {
  inferredLevel: EnergyScore
  calibratedLevel: EnergyScore | null
  activeLevel: EnergyScore
  source: EnergySource
  lastCalibratedAt?: Timestamp
}

// ─── Chronotype ────────────────────────────────────────────────
/**
 * 生物钟类型（昼夜节律偏好）
 * - morning_lark: 早起型，早晨精力充沛
 * - night_owl: 夜猫子型，晚上精力充沛
 * - intermediate: 中间型，精力分布较均衡
 */
export type Chronotype = 'morning_lark' | 'night_owl' | 'intermediate'

// ─── Energy Curve Point (24-hour baseline) ─────────────────────
/**
 * 能量曲线点，用于表示24小时能量基线
 * @property hour - 小时（0-23）
 * @property baseline - 该时段的能量基线值（1-10）
 */
export interface EnergyCurvePoint {
  hour: number // 0-23
  baseline: number // 1-10
}

// ─── Energy Sensitivity ────────────────────────────────────────
/**
 * 能量敏感度，表示用户能量波动的敏感程度
 * - high: 高敏感度，能量波动大
 * - medium: 中等敏感度
 * - low: 低敏感度，能量稳定
 */
export type EnergySensitivity = 'high' | 'medium' | 'low'

// ─── Duration (minutes) ───────────────────────────────────────
/**
 * 持续时间类型，单位为分钟
 */
export type DurationMinutes = number

// ─── Enum: Period Type ─────────────────────────────────────────
/**
 * 周期类型枚举，用于 OKR 和习惯的周期设置
 * - Daily: 每日
 * - Weekly: 每周
 * - Monthly: 每月
 * - Quarterly: 每季度
 * - SemiAnnual: 每半年
 * - Annual: 每年
 */
export enum PeriodType {
  Daily = 'daily',
  Weekly = 'weekly',
  Monthly = 'monthly',
  Quarterly = 'quarterly',
  SemiAnnual = 'semi_annual',
  Annual = 'annual',
}

// ─── Time of Day (default boundaries: 05:00 / 12:00 / 18:00 / 22:00) ──
/**
 * 一天中的时间段
 * - morning: 早晨（05:00-12:00）
 * - afternoon: 下午（12:00-18:00）
 * - evening: 傍晚（18:00-22:00）
 * - night: 夜晚（22:00-05:00）
 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

// ─── Tag ───────────────────────────────────────────────────────
/**
 * 标签类型，用于分类和过滤对象
 * 要求：小写字母，最多20个字符
 */
export type Tag = string // lowercase, max 20 chars

// ─── Notes ─────────────────────────────────────────────────────
/**
 * 备注类型，可为空
 */
export type Notes = string | null

// ─── Status Enums ──────────────────────────────────────────────
/**
 * 目标状态
 * - draft: 草稿
 * - active: 活跃中
 * - paused: 已暂停
 * - completed: 已完成
 * - discarded: 已废弃
 * - archived: 已归档
 */
export type ObjectiveStatus = 'draft' | 'active' | 'paused' | 'completed' | 'discarded' | 'archived'

/**
 * 关键结果状态
 * - draft: 草稿
 * - active: 活跃中
 * - paused: 已暂停
 * - completed: 已完成
 * - discarded: 已废弃
 * - archived: 已归档
 */
export type KeyResultStatus = 'draft' | 'active' | 'paused' | 'completed' | 'discarded' | 'archived'

/**
 * 任务状态
 * - todo: 待办
 * - planned: 已计划
 * - in_progress: 进行中
 * - completed: 已完成
 * - archived: 已归档
 */
export type TaskStatus = 'todo' | 'planned' | 'in_progress' | 'completed' | 'archived'

/**
 * 线索状态
 * - active: 活跃中
 * - paused: 已暂停
 * - completed: 已完成
 * - archived: 已归档
 */
export type ThreadStatus = 'active' | 'paused' | 'completed' | 'archived'

/**
 * 习惯状态
 * - draft: 草稿
 * - active: 活跃中
 * - suspended: 已暂停
 * - archived: 已归档
 */
export type HabitStatus = 'draft' | 'active' | 'suspended' | 'archived'

/**
 * 时间盒状态
 * - planned: 已计划
 * - running: 进行中
 * - overtime: 超时中
 * - ended: 已结束
 * - cancelled: 已取消
 * - logged: 已记录
 */
export type TimeboxStatus = 'planned' | 'running' | 'overtime' | 'ended' | 'cancelled' | 'logged'
/**
 * 完成状态
 * - completed: 已完成
 * - partially_completed: 部分完成
 * - not_completed: 未完成
 */
export type CompletionStatus = 'completed' | 'partially_completed' | 'not_completed'

/**
 * 复盘状态
 * - draft: 草稿
 * - in_progress: 进行中
 * - completed: 已完成
 * - archived: 已归档
 */
export type ReviewStatus = 'draft' | 'in_progress' | 'completed' | 'archived'

/**
 * 意图状态
 * - captured: 已捕获
 * - clarified: 已澄清
 * - routed: 已路由
 * - dissolved: 已消解
 */
export type IntentionStatus = 'captured' | 'clarified' | 'routed' | 'dissolved'

/**
 * AI 会话状态
 * - active: 活跃中
 * - archived: 已归档
 * - deleted: 已删除
 */
export type AISessionStatus = 'active' | 'archived' | 'deleted'

// ─── Task Domain Primitives ────────────────────────────────────
/**
 * 清晰度等级
 * - fuzzy: 模糊，仅有大致方向
 * - scoped: 已界定范围，边界清晰
 * - actionable: 可执行，可转化为具体任务
 */
export type ClarityLevel = 'fuzzy' | 'scoped' | 'actionable'

/**
 * 复杂度标签
 * - routine: 常规任务，流程已知
 * - structure_unknown: 结构未知，需要探索
 * - multi_step: 多步骤任务
 * - exploratory: 探索性任务
 * - creative: 创造性任务
 */
export type ComplexityTag = 'routine' | 'structure_unknown' | 'multi_step' | 'exploratory' | 'creative'

/**
 * 分解等级
 * - atomic: 原子任务，不可再分
 * - splittable: 可拆分，但尚未拆分
 * - splitting_in_progress: 拆分进行中
 * - decomposed: 已分解为子任务
 */
export type DecompositionLevel = 'atomic' | 'splittable' | 'splitting_in_progress' | 'decomposed'

/**
 * 捕获模式
 * - scheduled: 计划内捕获
 * - ad_hoc: 临时捕获
 * - retrospective: 回顾性捕获
 */
export type CaptureMode = 'scheduled' | 'ad_hoc' | 'retrospective'

/**
 * 能量画像
 * - light: 轻量任务，低认知负荷
 * - deep: 深度任务，需要专注
 * - admin: 行政事务
 * - creative: 创造性工作
 * - reactive: 响应式工作
 */
export type EnergyProfile = 'light' | 'deep' | 'admin' | 'creative' | 'reactive'

/**
 * 调度约束
 * - hard_deadline: 硬性截止日期
 * - soft_target: 软性目标日期
 * - opportunistic: 机会性，有空就做
 * - recurring: 重复性任务
 */
export type SchedulingConstraint = 'hard_deadline' | 'soft_target' | 'opportunistic' | 'recurring'

/**
 * 追踪模式
 * - none: 不追踪
 * - check_in: 定期检查
 * - log: 记录日志
 * - review: 复盘追踪
 */
export type TrackingMode = 'none' | 'check_in' | 'log' | 'review'

// ─── Domain & Action Types ─────────────────────────────────────
/**
 * 域标识符，用于路由意图到正确的处理模块
 */
export type DomainId = 'tasks' | 'habits' | 'okrs' | 'timebox' | 'review'

/**
 * 动作分类
 * - guide: 引导型动作
 * - tile: 卡片型动作
 * - cue: 提示型动作
 */
export type ActionCategory = 'guide' | 'tile' | 'cue'

/**
 * 动作类型，用于动作面引擎生成推荐操作
 */
export type ActionType =
  | 'log_habit'              // 打卡习惯
  | 'streak_milestone_hint'  // 连续打卡里程碑提示
  | 'habit_risk_warning'     // 习惯风险警告
  | 'complete_task'          // 完成任务
  | 'start_timebox'          // 开始时间盒
  | 'review_okr'             // 复盘 OKR
  | 'create_review'          // 创建复盘
  | 'capture_intent'         // 捕获意图
  | 'snooze'                 // 延迟提醒
  | 'skip'                   // 跳过

/**
 * USOM 对象类型枚举
 */
export type USOMObjectType =
  | 'objective' | 'key_result'
  | 'task' | 'habit' | 'habit_log' | 'task_execution_log'
  | 'timebox' | 'review'
  | 'intention' | 'thread'

// ─── External Types (MVP stub) ────────────────────────────────
/**
 * 外部数据源类型（MVP 阶段预留）
 * - health: 健康数据
 * - productivity: 生产力工具
 * - calendar: 日历
 * - communication: 通讯工具
 * - custom: 自定义
 */
export type ExternalSourceType = 'health' | 'productivity' | 'calendar' | 'communication' | 'custom'
