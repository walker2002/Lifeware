/**
 * @file irepository
 * @brief Repository 接口定义 — Nexus 数据访问契约
 * 
 * R-02: 所有方法仅使用 USOM 类型，不暴露 Drizzle 类型
 * T-02: 所有方法通过 userId 过滤
 * T-03: Nexus 组件不直接处理 userId
 */

import type { USOM_ID, Timestamp, DateOnly, ObjectiveStatus, KeyResultStatus, Priority, EnergyLevel, ThreadStatus, AISessionStatus, ClarityLevel, ComplexityTag, DecompositionLevel, CaptureMode, SchedulingConstraint, TrackingMode, Notes } from '../types/primitives'
import type {
  User, UserCalibration, Intention, StructuredIntent,
  Objective, KeyResult, Task, Thread, Habit, HabitLog, Timebox, Review,
  HabitTemplate, TemplateHabitItem,
  AISession, AISessionSummary, ChatMessage, UserSettings, TaskExecutionLog,
  RecurrenceRule, Contribution,
} from '../types/objects'
import type {
  ContextSnapshot, SystemEvent, ActionSurface, DerivedSignals, EnergyLog,
} from '../types/process'
import type { HabitFrequency } from '../types/objects'
import type { DbClient } from '../../lib/db/index'
import type { ActivityArchetype, EnergyCost, ActivityLabel } from '../activity-archetype/types'
import type { L1Category } from '../activity-archetype/l1-categories'

// ─── User ──────────────────────────────────────────────────────

/**
 * 用户仓储接口
 */
export interface IUserRepository {
  /**
   * 根据 ID 查找用户
   * @param id - 用户 ID
   * @returns 用户或 null
   */
  findById(id: USOM_ID): Promise<User | null>

  /**
   * 根据邮箱查找用户
   * @param email - 邮箱地址
   * @returns 用户或 null
   */
  findByEmail(email: string): Promise<User | null>

  /**
   * 保存用户
   * @param user - 用户对象
   */
  save(user: User): Promise<void>
}

// ─── UserCalibration ──────────────────────────────────────────

/**
 * 用户校准仓储接口
 */
export interface IUserCalibrationRepository {
  /**
   * 根据用户 ID 查找校准数据
   * @param userId - 用户 ID
   * @returns 校准数据或 null
   */
  findByUserId(userId: USOM_ID): Promise<UserCalibration | null>

  /**
   * 保存校准数据
   * @param calibration - 校准数据对象
   */
  save(calibration: UserCalibration): Promise<void>

  /**
   * 初始化默认校准数据
   * @param userId - 用户 ID
   * @returns 默认校准数据
   */
  initializeDefaults(userId: USOM_ID): Promise<UserCalibration>
}

// ─── Task ──────────────────────────────────────────────────────

/**
 * 任务过滤条件
 */
export interface TaskFilters {
  /** 任务状态 */
  status?: Task['status'] | Task['status'][]
  /** 关联主线 ID */
  threadId?: USOM_ID
  /** 父任务 ID */
  parentId?: USOM_ID | null
  /** 清晰度等级（支持单值或多值筛选） */
  clarity?: ClarityLevel | ClarityLevel[]
  /** 复杂度标签 */
  complexity?: ComplexityTag
  /** 调度约束 */
  schedulingConstraint?: SchedulingConstraint
  /** 追踪模式 */
  tracking?: TrackingMode
}

/**
 * 创建任务输入
 */
export interface CreateTaskInput {
  /** 任务标题 */
  title: string
  /** 任务描述 */
  description?: string
  /** 优先级（默认 P1） */
  priority?: Priority
  /** 所需能量等级（默认 medium） */
  energyRequired?: EnergyLevel
  /** 预估时长（分钟），模糊任务可不填 */
  estimatedDuration?: number
  /** 关联主线 ID */
  threadId?: USOM_ID
  /** 父任务 ID */
  parentId?: USOM_ID
  /** 清晰度等级（默认 fuzzy，由 Repository 自动计算） */
  clarity?: ClarityLevel
  /** 复杂度标签列表（默认 []，由 AI 语义分析补充） */
  complexity?: ComplexityTag[]
  /** 分解等级（由 Repository 自动计算） */
  decomposition?: DecompositionLevel
  /** 捕获模式（默认 ad_hoc） */
  captureMode?: CaptureMode
  /** [023] A3: 关联 Activity Archetype */
  activityArchetypeId?: USOM_ID
  /** 调度约束 */
  schedulingConstraint?: SchedulingConstraint
  /** 追踪模式（默认 check_in） */
  tracking?: TrackingMode
  /** 开始日期 */
  startDate?: DateOnly
  /** 结束日期 */
  endDate?: DateOnly
  /** 标签列表 */
  tags?: string[]
  /** 截止日期 */
  dueDate?: DateOnly
  /** 重复规则 */
  recurrence?: RecurrenceRule
  /** 备注 */
  notes?: Notes
}

/** 更新任务输入 */
export type UpdateTaskInput = Partial<CreateTaskInput>

/**
 * 任务仓储接口
 */
export interface ITaskRepository {
  /**
   * 根据 ID 查找任务
   * @param id - 任务 ID
   * @param userId - 用户 ID
   * @returns 任务或 null
   */
  findById(id: USOM_ID, userId: USOM_ID): Promise<Task | null>

  /**
   * 根据用户 ID 查找任务
   * @param userId - 用户 ID
   * @param filters - 过滤条件
   * @returns 任务列表
   */
  findByUserId(userId: USOM_ID, filters?: TaskFilters): Promise<Task[]>

  /**
   * 根据状态查找任务
   * @param status - 任务状态
   * @param userId - 用户 ID
   * @returns 任务列表
   */
  findByStatus(status: Task['status'], userId: USOM_ID): Promise<Task[]>

  /**
   * 查找活跃任务
   * @param userId - 用户 ID
   * @returns 活跃任务列表
   */
  findActive(userId: USOM_ID): Promise<Task[]>

  /**
   * 根据父任务查找子任务
   * @param parentId - 父任务 ID
   * @param userId - 用户 ID
   * @returns 子任务列表
   */
  findByParent(parentId: USOM_ID, userId: USOM_ID): Promise<Task[]>

  /**
   * 查找所有任务
   * @param userId - 用户 ID
   * @returns 任务列表
   */
  findAll(userId: USOM_ID): Promise<Task[]>

  /**
   * 根据日期范围查找任务
   * @param start - 开始日期
   * @param end - 结束日期
   * @param userId - 用户 ID
   * @returns 任务列表
   */
  findByDateRange(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Task[]>

  /**
   * 创建任务
   * @param input - 创建输入
   * @param userId - 用户 ID
   * @returns 创建的任务
   */
  create(input: CreateTaskInput, userId: USOM_ID): Promise<Task>

  /**
   * 更新任务
   * @param id - 任务 ID
   * @param input - 更新输入
   * @param userId - 用户 ID
   * @returns 更新后的任务
   */
  update(id: USOM_ID, input: UpdateTaskInput, userId: USOM_ID): Promise<Task>

  /**
   * 更新任务状态
   * @param id - 任务 ID
   * @param status - 新状态
   * @param userId - 用户 ID
   * @returns 更新后的任务
   */
  updateStatus(id: USOM_ID, status: Task['status'], userId: USOM_ID): Promise<Task>

  /**
   * 保存任务
   * @param task - 任务对象
   * @param userId - 用户 ID
   */
  save(task: Task, userId: USOM_ID): Promise<void>

  /**
   * 归档任务
   * @param id - 任务 ID
   * @param userId - 用户 ID
   */
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── Thread ─────────────────────────────────────────────────────

/**
 * 主线过滤条件
 */
export interface ThreadFilters {
  /** 主线状态 */
  status?: ThreadStatus | ThreadStatus[]
  /** 优先级 */
  priority?: Priority
}

/**
 * 创建主线输入
 */
export interface CreateThreadInput {
  /** 主线名称 */
  name: string
  /** 主线描述 */
  description?: string
  /** 主线颜色 */
  color?: string
  /** 开始日期 */
  startDate?: DateOnly
  /** 结束日期 */
  endDate?: DateOnly
  /** 优先级 */
  priority?: Priority
  /** 标签列表 */
  tags?: string[]
}

/** 更新线索输入 */
export type UpdateThreadInput = Partial<CreateThreadInput>

/**
 * 主线仓储接口
 */
export interface IThreadRepository {
  /**
   * 根据 ID 查找主线
   * @param id - 主线 ID
   * @param userId - 用户 ID
   * @returns 主线或 null
   */
  findById(id: USOM_ID, userId: USOM_ID): Promise<Thread | null>

  /**
   * 根据用户 ID 查找主线
   * @param userId - 用户 ID
   * @param filters - 过滤条件
   * @returns 主线列表
   */
  findByUserId(userId: USOM_ID, filters?: ThreadFilters): Promise<Thread[]>

  /**
   * 根据状态查找主线
   * @param status - 主线状态
   * @param userId - 用户 ID
   * @returns 主线列表
   */
  findByStatus(status: ThreadStatus, userId: USOM_ID): Promise<Thread[]>

  /**
   * 创建主线
   * @param input - 创建输入
   * @param userId - 用户 ID
   * @returns 创建的主线
   */
  create(input: CreateThreadInput, userId: USOM_ID): Promise<Thread>

  /**
   * 更新主线
   * @param id - 主线 ID
   * @param input - 更新输入
   * @param userId - 用户 ID
   * @returns 更新后的主线
   */
  update(id: USOM_ID, input: UpdateThreadInput, userId: USOM_ID): Promise<Thread>

  /**
   * 更新主线状态
   * @param id - 主线 ID
   * @param status - 新状态
   * @param userId - 用户 ID
   * @returns 更新后的主线
   */
  updateStatus(id: USOM_ID, status: ThreadStatus, userId: USOM_ID): Promise<Thread>

  /**
   * 保存主线
   * @param thread - 主线对象
   * @param userId - 用户 ID
   */
  save(thread: Thread, userId: USOM_ID): Promise<void>

  /**
   * 删除主线
   * @param id - 主线 ID
   * @param userId - 用户 ID
   */
  delete(id: USOM_ID, userId: USOM_ID): Promise<void>

  /**
   * 归档主线
   * @param id - 主线 ID
   * @param userId - 用户 ID
   */
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── Habit ─────────────────────────────────────────────────────

/**
 * 习惯引用信息
 */
export interface HabitReferenceInfo {
  /** 习惯日志数量 */
  habitLogs: number
  /** 模板习惯数量 */
  templateHabits: number
  /** 时间盒习惯数量 */
  timeboxHabits: number
  /** 是否有引用 */
  hasReferences: boolean
}

/**
 * 习惯仓储接口
 */
export interface IHabitRepository {
  /**
   * 根据 ID 查找习惯
   * @param id - 习惯 ID
   * @param userId - 用户 ID
   * @returns 习惯或 null
   */
  findById(id: USOM_ID, userId: USOM_ID): Promise<Habit | null>

  /**
   * 根据用户 ID 查找习惯
   * @param userId - 用户 ID
   * @param filters - 过滤条件
   * @returns 习惯列表
   */
  findByUserId(userId: USOM_ID, filters?: HabitFilters): Promise<Habit[]>

  /**
   * 查找活跃习惯
   * @param userId - 用户 ID
   * @returns 活跃习惯列表
   */
  findActive(userId: USOM_ID): Promise<Habit[]>

  /**
   * 根据频率类型查找习惯
   * @param frequencyType - 频率类型
   * @param userId - 用户 ID
   * @returns 习惯列表
   */
  findByFrequency(frequencyType: HabitFrequency['type'], userId: USOM_ID): Promise<Habit[]>

  /**
   * 创建习惯
   * @param data - 创建数据
   * @param userId - 用户 ID
   * @returns 创建的习惯
   */
  create(data: CreateHabitInput, userId: USOM_ID): Promise<Habit>

  /**
   * 更新习惯
   * @param id - 习惯 ID
   * @param data - 更新数据
   * @param userId - 用户 ID
   * @returns 更新后的习惯
   */
  update(id: USOM_ID, data: UpdateHabitInput, userId: USOM_ID): Promise<Habit>

  /**
   * 更新习惯状态
   * @param id - 习惯 ID
   * @param status - 新状态
   * @param userId - 用户 ID
   * @returns 更新后的习惯
   */
  updateStatus(id: USOM_ID, status: Habit['status'], userId: USOM_ID): Promise<Habit>

  /**
   * 保存习惯
   * @param habit - 习惯对象
   * @param userId - 用户 ID
   */
  save(habit: Habit, userId: USOM_ID): Promise<void>

  /**
   * 删除习惯
   * @param id - 习惯 ID
   * @param userId - 用户 ID
   */
  delete(id: USOM_ID, userId: USOM_ID): Promise<void>

  /**
   * 归档习惯
   * @param id - 习惯 ID
   * @param userId - 用户 ID
   */
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>

  /**
   * 检查习惯引用
   * @param id - 习惯 ID
   * @param userId - 用户 ID
   * @returns 引用信息
   */
  checkReferences(id: USOM_ID, userId: USOM_ID): Promise<HabitReferenceInfo>

  /**
   * 计算连续天数
   * @param habitId - 习惯 ID
   * @param userId - 用户 ID
   * @returns 连续天数
   */
  calculateStreak(habitId: USOM_ID, userId: USOM_ID): Promise<number>

  /**
   * 计算最长连续天数
   * @param habitId - 习惯 ID
   * @param userId - 用户 ID
   * @returns 最长连续天数
   */
  calculateLongestStreak(habitId: USOM_ID, userId: USOM_ID): Promise<number>

  /**
   * 计算 7 天完成率
   * @param habitId - 习惯 ID
   * @param userId - 用户 ID
   * @returns 完成率 (0-100)
   */
  calculateCompletion7d(habitId: USOM_ID, userId: USOM_ID): Promise<number>

  /**
   * 更新习惯指标
   * @param habitId - 习惯 ID
   * @param userId - 用户 ID
   * @param metrics - 指标数据
   */
  updateMetrics(habitId: USOM_ID, userId: USOM_ID, metrics: { streak: number; longestStreak: number; completionRate7d: number }): Promise<void>
}

/**
 * 习惯过滤条件
 */
export interface HabitFilters {
  /** 习惯状态 */
  status?: Habit['status']
  /** 是否可追踪 */
  trackable?: boolean
}

/**
 * 创建习惯输入
 */
export interface CreateHabitInput {
  /** 习惯标题 */
  title: string
  /** 习惯描述 */
  description?: string
  /** 默认时间 */
  defaultTime: string
  /** 最早时间 */
  earliestTime: string
  /** 最晚开始时间 */
  latestStartTime: string
  /** 默认时长（分钟） */
  defaultDuration: number
  /** 最小时长（分钟） */
  minDuration: number
  /** 是否可追踪 */
  trackable: boolean
  /** 频率类型 */
  frequencyType: HabitFrequency['type']
  /** 周几执行 */
  daysOfWeek?: number[]
  /** 开始日期 */
  startDate: DateOnly
  /** 结束日期 */
  endDate?: DateOnly
  /** 标签列表 */
  tags?: string[]
  /** [023] A3: 关联 Activity Archetype */
  activityArchetypeId?: USOM_ID
}

/** 更新习惯输入 */
export type UpdateHabitInput = Partial<CreateHabitInput>

// ─── HabitTemplate ─────────────────────────────────────────────

/**
 * 习惯模板仓储接口
 */
export interface IHabitTemplateRepository {
  /**
   * 根据 ID 查找习惯模板
   * @param id - 模板 ID
   * @param userId - 用户 ID
   * @returns 习惯模板或 null
   */
  findById(id: USOM_ID, userId: USOM_ID): Promise<HabitTemplate | null>

  /**
   * 根据用户 ID 查找习惯模板
   * @param userId - 用户 ID
   * @returns 习惯模板列表
   */
  findByUserId(userId: USOM_ID): Promise<HabitTemplate[]>

  /**
   * 创建习惯模板
   * @param data - 创建数据
   * @param userId - 用户 ID
   * @returns 创建的习惯模板
   */
  create(data: CreateTemplateInput, userId: USOM_ID): Promise<HabitTemplate>

  /**
   * 更新习惯模板
   * @param id - 模板 ID
   * @param data - 更新数据
   * @param userId - 用户 ID
   * @returns 更新后的习惯模板
   */
  update(id: USOM_ID, data: UpdateTemplateInput, userId: USOM_ID): Promise<HabitTemplate>

  /**
   * 删除习惯模板
   * @param id - 模板 ID
   * @param userId - 用户 ID
   */
  delete(id: USOM_ID, userId: USOM_ID): Promise<void>

  /**
   * 向模板添加习惯
   * @param templateId - 模板 ID
   * @param habitId - 习惯 ID
   * @param overrides - 覆盖配置
   * @param userId - 用户 ID
   */
  addHabit(templateId: USOM_ID, habitId: USOM_ID, overrides: TemplateHabitOverrides | undefined, userId: USOM_ID): Promise<void>

  /**
   * 从模板移除习惯
   * @param templateId - 模板 ID
   * @param habitId - 习惯 ID
   * @param userId - 用户 ID
   */
  removeHabit(templateId: USOM_ID, habitId: USOM_ID, userId: USOM_ID): Promise<void>
}

/**
 * 创建模板输入
 */
export interface CreateTemplateInput {
  /** 模板名称 */
  name: string
  /** 模板描述 */
  description?: string
  /** 模板图标 */
  icon?: string
  /** 适用的日期（周几） */
  applicableDays: number[]
}

/** 更新模板输入 */
export type UpdateTemplateInput = Partial<CreateTemplateInput>

/**
 * 模板习惯覆盖配置
 */
export interface TemplateHabitOverrides {
  /** 排序顺序 */
  sortOrder?: number
  /** 时间覆盖 */
  timeOverride?: string
  /** 时长覆盖 */
  durationOverride?: number
}

// ─── HabitLog (immutable fact records) ─────────────────────────

/**
 * 习惯日志仓储接口（不可变事实记录）
 */
export interface IHabitLogRepository {
  /**
   * 根据习惯和日期查找日志
   * @param habitId - 习惯 ID
   * @param date - 日期
   * @param userId - 用户 ID
   * @returns 习惯日志或 null
   */
  findByHabitAndDate(habitId: USOM_ID, date: DateOnly, userId: USOM_ID): Promise<HabitLog | null>

  /**
   * 根据用户和日期查找日志
   * @param date - 日期
   * @param userId - 用户 ID
   * @returns 习惯日志列表
   */
  findByUserAndDate(date: DateOnly, userId: USOM_ID): Promise<HabitLog[]>

  /**
   * 根据习惯查找日志
   * @param habitId - 习惯 ID
   * @param userId - 用户 ID
   * @returns 习惯日志列表
   */
  findByHabit(habitId: USOM_ID, userId: USOM_ID): Promise<HabitLog[]>

  /**
   * 保存习惯日志
   * @param log - 日志对象
   * @param userId - 用户 ID
   */
  save(log: HabitLog, userId: USOM_ID): Promise<void>
}

// ─── TaskExecutionLog ──────────────────────────────────────────

/**
 * 任务执行日志仓储接口
 */
export interface ITaskExecutionLogRepository {
  /**
   * 根据任务查找执行日志
   * @param taskId - 任务 ID
   * @param userId - 用户 ID
   * @returns 执行日志列表
   */
  findByTask(taskId: USOM_ID, userId: USOM_ID): Promise<TaskExecutionLog[]>

  /**
   * 根据时间盒查找执行日志
   * @param timeboxId - 时间盒 ID
   * @param userId - 用户 ID
   * @returns 执行日志列表
   */
  findByTimebox(timeboxId: USOM_ID, userId: USOM_ID): Promise<TaskExecutionLog[]>

  /**
   * 保存执行日志
   * @param log - 日志对象
   * @param userId - 用户 ID
   */
  save(log: TaskExecutionLog, userId: USOM_ID): Promise<void>
}

// ─── Timebox ───────────────────────────────────────────────────

/**
 * 时间盒仓储接口
 */
export interface ITimeboxRepository {
  /**
   * 根据 ID 查找时间盒
   * @param id - 时间盒 ID
   * @param userId - 用户 ID
   * @returns 时间盒或 null
   */
  findById(id: USOM_ID, userId: USOM_ID): Promise<Timebox | null>

  /**
   * 查找运行中的时间盒
   * @param userId - 用户 ID
   * @returns 时间盒列表
   */
  findRunning(userId: USOM_ID): Promise<Timebox[]>

  /**
   * 根据状态查找时间盒
   * @param status - 状态
   * @param userId - 用户 ID
   * @returns 时间盒列表
   */
  findByStatus(status: string, userId: USOM_ID): Promise<Timebox[]>

  /**
   * 查找即将到来的时间盒
   * @param userId - 用户 ID
   * @param withinHours - 未来几小时内
   * @returns 时间盒列表
   */
  findUpcoming(userId: USOM_ID, withinHours?: number): Promise<Timebox[]>

  /**
   * 根据时间范围查找时间盒
   * @param start - 开始时间戳
   * @param end - 结束时间戳
   * @param userId - 用户 ID
   * @returns 时间盒列表
   */
  findByDateRange(start: Timestamp, end: Timestamp, userId: USOM_ID): Promise<Timebox[]>

  /**
   * 保存时间盒
   * @param timebox - 时间盒对象
   * @param userId - 用户 ID
   */
  save(timebox: Timebox, userId: USOM_ID): Promise<void>

  /**
   * 归档时间盒
   * @param id - 时间盒 ID
   * @param userId - 用户 ID
   * @param executionRecord - 执行记录（可选）
   */
  archive(id: USOM_ID, userId: USOM_ID, executionRecord?: import('../types/objects').ExecutionRecord): Promise<void>
}

// ─── Objective ─────────────────────────────────────────────────

/**
 * 包含关键结果的目标
 */
export type ObjectiveWithKR = Objective & { keyResults: KeyResult[] }

/**
 * 目标仓储接口
 */
export interface IObjectiveRepository {
  /**
   * 根据 ID 查找目标
   * @param id - 目标 ID
   * @param userId - 用户 ID
   * @returns 目标或 null
   */
  findById(id: USOM_ID, userId: USOM_ID): Promise<Objective | null>

  /**
   * 查找所有目标
   * @param userId - 用户 ID
   * @returns 目标列表
   */
  findAll(userId: USOM_ID): Promise<Objective[]>

  /**
   * 查找活跃目标
   * @param userId - 用户 ID
   * @returns 活跃目标列表
   */
  findActive(userId: USOM_ID): Promise<Objective[]>

  /**
   * 根据状态查找目标
   * @param status - 目标状态
   * @param userId - 用户 ID
   * @returns 目标列表
   */
  findByStatus(status: ObjectiveStatus, userId: USOM_ID): Promise<Objective[]>

  /**
   * 根据周期查找目标
   * @param start - 开始日期
   * @param end - 结束日期
   * @param userId - 用户 ID
   * @returns 目标列表
   */
  findByPeriod(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Objective[]>

  /**
   * 根据状态和周期查找目标
   * @param status - 目标状态列表
   * @param start - 开始日期
   * @param end - 结束日期
   * @param userId - 用户 ID
   * @returns 目标列表
   */
  findByStatusInPeriod(status: ObjectiveStatus[], start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Objective[]>

  /**
   * 查找包含关键结果的目标
   * @param id - 目标 ID
   * @param userId - 用户 ID
   * @returns 包含关键结果的目标或 null
   */
  findWithKeyResults(id: USOM_ID, userId: USOM_ID): Promise<ObjectiveWithKR | null>

  /**
   * 保存目标
   * @param objective - 目标对象
   * @param userId - 用户 ID
   */
  save(objective: Objective, userId: USOM_ID): Promise<void>

  /**
   * 归档目标
   * @param id - 目标 ID
   * @param userId - 用户 ID
   */
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── KeyResult ─────────────────────────────────────────────────

/**
 * 关键结果仓储接口
 */
export interface IKeyResultRepository {
  /**
   * 根据 ID 查找关键结果
   * @param id - 关键结果 ID
   * @param userId - 用户 ID
   * @returns 关键结果或 null
   */
  findById(id: USOM_ID, userId: USOM_ID): Promise<KeyResult | null>

  /**
   * 根据目标查找关键结果
   * @param objectiveId - 目标 ID
   * @param userId - 用户 ID
   * @returns 关键结果列表
   */
  findByObjective(objectiveId: USOM_ID, userId: USOM_ID): Promise<KeyResult[]>

  /**
   * 更新进度
   * @param id - 关键结果 ID
   * @param currentValue - 当前值
   * @param userId - 用户 ID
   * @returns 更新后的关键结果
   */
  updateProgress(id: USOM_ID, currentValue: number, userId: USOM_ID): Promise<KeyResult>

  /**
   * 批量更新状态
   * @param objectiveId - 目标 ID
   * @param fromStatus - 原状态
   * @param toStatus - 新状态
   * @param userId - 用户 ID
   */
  batchUpdateStatus(objectiveId: USOM_ID, fromStatus: KeyResultStatus, toStatus: KeyResultStatus, userId: USOM_ID): Promise<void>

  /**
   * 删除草稿
   * @param id - 关键结果 ID
   * @param userId - 用户 ID
   */
  deleteDraft(id: USOM_ID, userId: USOM_ID): Promise<void>

  /**
   * 保存关键结果
   * @param keyResult - 关键结果对象
   * @param userId - 用户 ID
   */
  save(keyResult: KeyResult, userId: USOM_ID): Promise<void>

  /**
   * 归档关键结果
   * @param id - 关键结果 ID
   * @param userId - 用户 ID
   */
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── Contribution ───────────────────────────────────────────────

/**
 * 创建贡献记录输入
 */
export interface CreateContributionInput {
  /** 关联的关键结果 ID */
  keyResultId: USOM_ID
  /** 贡献者类型 */
  contributorType: 'task' | 'habit' | 'manual'
  /** 贡献者 ID */
  contributorId: USOM_ID
  /** 贡献增量（可选） */
  delta?: number
  /** 贡献权重（可选） */
  weight?: number
}

/**
 * 贡献记录仓储接口
 */
export interface IContributionRepository {
  /**
   * 根据关键结果查找贡献记录
   * @param keyResultId - 关键结果 ID
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄
   * @returns 贡献记录列表
   */
  findByKeyResult(keyResultId: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Contribution[]>

  /**
   * 根据贡献者查找贡献记录
   * @param contributorType - 贡献者类型
   * @param contributorId - 贡献者 ID
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄
   * @returns 贡献记录列表
   */
  findByContributor(contributorType: string, contributorId: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<Contribution[]>

  /**
   * 添加贡献记录
   * @param input - 创建输入
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄
   * @returns 创建的贡献记录
   */
  add(input: CreateContributionInput, userId: USOM_ID, tx?: DbClient): Promise<Contribution>

  /**
   * 删除贡献记录
   * @param id - 贡献记录 ID
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄
   */
  remove(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<void>

  /**
   * 根据贡献者删除贡献记录
   * @param contributorType - 贡献者类型
   * @param contributorId - 贡献者 ID
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄
   */
  removeByContributor(contributorType: string, contributorId: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<void>

  /**
   * 重新计算关键结果进度
   * @param keyResultId - 关键结果 ID
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄
   * @returns 重新计算后的进度数据
   */
  recomputeProgress(keyResultId: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<{ currentValue: number; progressRate: number }>
}

// ─── Intention ─────────────────────────────────────────────────

/**
 * 意图仓储接口
 */
export interface IIntentionRepository {
  /**
   * 根据 ID 查找意图
   * @param id - 意图 ID
   * @param userId - 用户 ID
   * @returns 意图或 null
   */
  findById(id: USOM_ID, userId: USOM_ID): Promise<Intention | null>

  /**
   * 根据状态查找意图
   * @param status - 意图状态
   * @param userId - 用户 ID
   * @returns 意图列表
   */
  findByStatus(status: Intention['status'], userId: USOM_ID): Promise<Intention[]>

  /**
   * 保存意图
   * @param intention - 意图对象
   * @param userId - 用户 ID
   */
  save(intention: Intention, userId: USOM_ID): Promise<void>

  /**
   * 解散意图
   * @param id - 意图 ID
   * @param userId - 用户 ID
   */
  dissolve(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── StructuredIntent ──────────────────────────────────────────

/**
 * 结构化意图仓储接口
 */
export interface IStructuredIntentRepository {
  /**
   * 根据意图查找结构化意图
   * @param intentionId - 意图 ID
   * @param userId - 用户 ID
   * @returns 结构化意图或 null
   */
  findByIntention(intentionId: USOM_ID, userId: USOM_ID): Promise<StructuredIntent | null>

  /**
   * 保存结构化意图
   * @param structuredIntent - 结构化意图对象
   * @param userId - 用户 ID
   */
  save(structuredIntent: StructuredIntent, userId: USOM_ID): Promise<void>
}

// ─── Review ────────────────────────────────────────────────────

/**
 * 复盘仓储接口
 */
export interface IReviewRepository {
  /**
   * 根据 ID 查找复盘
   * @param id - 复盘 ID
   * @param userId - 用户 ID
   * @returns 复盘或 null
   */
  findById(id: USOM_ID, userId: USOM_ID): Promise<Review | null>

  /**
   * 根据周期查找复盘
   * @param start - 开始日期
   * @param end - 结束日期
   * @param userId - 用户 ID
   * @returns 复盘列表
   */
  findByPeriod(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Review[]>

  /**
   * 根据类型查找复盘
   * @param type - 复盘类型
   * @param userId - 用户 ID
   * @returns 复盘列表
   */
  findByType(type: Review['type'], userId: USOM_ID): Promise<Review[]>

  /**
   * 保存复盘
   * @param review - 复盘对象
   * @param userId - 用户 ID
   */
  save(review: Review, userId: USOM_ID): Promise<void>

  /**
   * 归档复盘
   * @param id - 复盘 ID
   * @param userId - 用户 ID
   */
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── SystemEvent (append-only) ─────────────────────────────────

/**
 * 系统事件仓储接口（仅追加）
 */
export interface ISystemEventRepository {
  /**
   * 追加事件
   * @param event - 事件对象
   * @param userId - 用户 ID
   */
  append(event: SystemEvent, userId: USOM_ID): Promise<void>

  /**
   * 根据用户和时间范围查找事件
   * @param userId - 用户 ID
   * @param startAt - 开始时间戳
   * @param endAt - 结束时间戳
   * @returns 事件列表
   */
  findByUserInRange(userId: USOM_ID, startAt: Timestamp, endAt: Timestamp): Promise<SystemEvent[]>

  /**
   * 按 intentId 查找事件（[022] ADV-#1 修复 2026-06-26）。
   *
   * 替代跨域事件分发器的「时间窗口 + JS 过滤 intentId」方案：
   * 直接走 JSONB payload->>'intentId' 索引查询，无需 5 秒窗口近似，
   * 消除并发场景下的跨意图事件泄漏风险（spike §R7 设计决策升级）。
   *
   * @param intentId - 意图 ID
   * @param userId - 用户 ID（多租户 T-02）
   * @returns 该 intent 关联的事件列表（含已处理/未处理，按 occurredAt asc）
   */
  findByIntent(intentId: USOM_ID, userId: USOM_ID): Promise<SystemEvent[]>

  /**
   * 查找未处理的事件
   * @param userId - 用户 ID
   * @returns 未处理事件列表
   */
  findUnprocessed(userId: USOM_ID): Promise<SystemEvent[]>

  /**
   * 标记为已处理
   * @param id - 事件 ID
   * @param userId - 用户 ID
   */
  markProcessed(id: USOM_ID, userId: USOM_ID): Promise<void>
}

// ─── ContextSnapshot ───────────────────────────────────────────

/**
 * 上下文快照仓储接口
 */
export interface IContextSnapshotRepository {
  /**
   * 查找最新快照
   * @param userId - 用户 ID
   * @returns 最新快照或 null
   */
  findLatest(userId: USOM_ID): Promise<ContextSnapshot | null>

  /**
   * 保存快照
   * @param snapshot - 快照对象
   * @param userId - 用户 ID
   */
  save(snapshot: ContextSnapshot, userId: USOM_ID): Promise<void>
}

// ─── ActionSurface ─────────────────────────────────────────────

/**
 * 动作面仓储接口
 */
export interface IActionSurfaceRepository {
  /**
   * 查找最新动作面
   * @param userId - 用户 ID
   * @returns 最新动作面或 null
   */
  findLatest(userId: USOM_ID): Promise<ActionSurface | null>

  /**
   * 保存动作面
   * @param surface - 动作面对象
   * @param userId - 用户 ID
   */
  save(surface: ActionSurface, userId: USOM_ID): Promise<void>
}

// ─── DerivedSignals (one row per user) ─────────────────────────

/**
 * 派生信号仓储接口（每个用户一行）
 */
export interface IDerivedSignalsRepository {
  /**
   * 根据用户查找信号
   * @param userId - 用户 ID
   * @returns 派生信号或 null
   */
  findByUser(userId: USOM_ID): Promise<DerivedSignals | null>

  /**
   * 更新或插入信号
   * @param signals - 信号对象
   * @param userId - 用户 ID
   */
  upsert(signals: DerivedSignals, userId: USOM_ID): Promise<void>
}

// ─── EnergyLog ─────────────────────────────────────────────────

/**
 * 能量日志仓储接口
 */
export interface IEnergyLogRepository {
  /**
   * 根据用户和时间范围查找日志
   * @param userId - 用户 ID
   * @param startAt - 开始时间戳
   * @param endAt - 结束时间戳
   * @returns 能量日志列表
   */
  findByUserInRange(userId: USOM_ID, startAt: Timestamp, endAt: Timestamp): Promise<EnergyLog[]>

  /**
   * 保存能量日志
   * @param log - 日志对象
   * @param userId - 用户 ID
   */
  save(log: EnergyLog, userId: USOM_ID): Promise<void>
}

// ─── AISession ─────────────────────────────────────────────────

/**
 * AI 会话仓储接口
 */
export interface IAISessionRepository {
  /**
   * 根据 ID 查找会话
   * @param id - 会话 ID
   * @param userId - 用户 ID
   * @returns 会话或 null
   */
  findById(id: USOM_ID, userId: USOM_ID): Promise<AISession | null>

  /**
   * 根据用户 ID 查找会话摘要列表
   * @param userId - 用户 ID
   * @returns 会话摘要列表
   */
  findByUserId(userId: USOM_ID): Promise<AISessionSummary[]>

  /**
   * 创建会话
   * @param session - 会话数据（不含 id、createdAt、updatedAt）
   * @param userId - 用户 ID
   * @returns 创建的会话
   */
  create(session: Omit<AISession, 'id' | 'createdAt' | 'updatedAt'>, userId: USOM_ID): Promise<AISession>

  /**
   * 更新消息
   * @param id - 会话 ID
   * @param messages - 消息列表
   * @param userId - 用户 ID
   */
  updateMessages(id: USOM_ID, messages: AISession['messages'], userId: USOM_ID): Promise<void>

  /**
   * 更新状态快照
   * @param id - 会话 ID
   * @param snapshot - 状态快照
   * @param userId - 用户 ID
   */
  updateStateSnapshot(id: USOM_ID, snapshot: AISession['stateSnapshot'], userId: USOM_ID): Promise<void>

  /**
   * 更新标题
   * @param id - 会话 ID
   * @param title - 标题
   * @param userId - 用户 ID
   */
  updateTitle(id: USOM_ID, title: string, userId: USOM_ID): Promise<void>

  /**
   * 更新时间戳
   * @param id - 会话 ID
   * @param userId - 用户 ID
   */
  updateTimestamp(id: USOM_ID, userId: USOM_ID): Promise<void>

  /**
   * 归档会话
   * @param id - 会话 ID
   * @param userId - 用户 ID
   */
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>

  /**
   * 恢复会话
   * @param id - 会话 ID
   * @param userId - 用户 ID
   */
  restore(id: USOM_ID, userId: USOM_ID): Promise<void>

  /**
   * 软删除会话
   * @param id - 会话 ID
   * @param userId - 用户 ID
   */
  softDelete(id: USOM_ID, userId: USOM_ID): Promise<void>

  /**
   * 硬删除过期会话
   * @param retentionDays - 保留天数
   * @returns 删除的记录数
   */
  hardDeleteExpired(retentionDays: number): Promise<number>
}

// ─── L1Message ──────────────────────────────────────────────────

/**
 * L1 消息仓储接口
 */
export interface IL1MessageRepository {
  /**
   * 追加消息
   * @param message - 消息数据
   */
  append(message: { sessionId: string; userId: string; role: string; content: string; intentRef?: string; cnuiSurface?: Record<string, unknown> | import('../types/objects').CnuiSurfaceRef }): Promise<void>

  /**
   * 根据会话 ID 查找消息
   * @param sessionId - 会话 ID
   * @param userId - 用户 ID
   * @returns 消息列表
   */
  findBySessionId(sessionId: string, userId: string): Promise<ChatMessage[]>

  /**
   * 软删除会话消息
   * @param sessionId - 会话 ID
   * @param userId - 用户 ID
   */
  softDeleteBySessionId(sessionId: string, userId: string): Promise<void>

  /**
   * 恢复会话消息
   * @param sessionId - 会话 ID
   * @param userId - 用户 ID
   */
  restoreBySessionId(sessionId: string, userId: string): Promise<void>

  /**
   * 硬删除过期消息
   * @param retentionDays - 保留天数
   * @returns 删除的记录数
   */
  hardDeleteExpired(retentionDays: number): Promise<number>
}

// ─── UserSettings ──────────────────────────────────────────────

/**
 * 用户设置仓储接口
 */
export interface IUserSettingsRepository {
  /**
   * 根据用户 ID 查找设置
   * @param userId - 用户 ID
   * @returns 用户设置或 null
   */
  findByUserId(userId: USOM_ID): Promise<UserSettings | null>

  /**
   * 更新或插入设置
   * @param settings - 设置数据（不含 id）
   * @param userId - 用户 ID
   * @returns 用户设置
   */
  upsert(settings: Omit<UserSettings, 'id'>, userId: USOM_ID): Promise<UserSettings>
}

// ─── ActivityArchetype ────────────────────────────────────────

/** 创建 Activity Archetype 输入 */
export interface CreateActivityArchetypeInput {
  /** L1 一级分类 */
  l1Category: L1Category
  /** L2 二级名称 */
  l2Name: string
  /** 4 维能量消耗 */
  energyCost: EnergyCost
  /** 6 维执行特征 */
  activityLabel: ActivityLabel
}

/** 更新 Activity Archetype 输入 */
export interface UpdateActivityArchetypeInput {
  /** L1 一级分类（可选） */
  l1Category?: L1Category
  /** L2 二级名称（可选） */
  l2Name?: string
  /** 4 维能量消耗（可选） */
  energyCost?: EnergyCost
  /** 6 维执行特征（可选） */
  activityLabel?: ActivityLabel
}

/**
 * Activity Archetype 仓储接口（[023] A1 D4 拆分方案：类型归 USOM，运行时数据归 DB）
 *
 * 每次 CUD 自动写入 user_audit_log（OQ-7）。
 * seedDefaults 按 (l1Category, l2Name) 判重，幂等插入。
 */
export interface IActivityArchetypeRepository {
  /**
   * 按 ID 查单个 Archetype
   * @param id - Archetype ID
   * @param userId - 用户 ID（T-02 多租户）
   * @param tx - 可选事务句柄
   * @returns Archetype 或 null
   */
  findById(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<ActivityArchetype | null>

  /**
   * 查用户全部 Archetype（按 l1Category, l2Name 排序）
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄
   * @returns Archetype 列表
   */
  findByUser(userId: USOM_ID, tx?: DbClient): Promise<ActivityArchetype[]>

  /**
   * 按 L1 分类过滤（按 l2Name 排序）
   * @param l1Category - L1 分类
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄
   * @returns Archetype 列表
   */
  findByL1Category(l1Category: L1Category, userId: USOM_ID, tx?: DbClient): Promise<ActivityArchetype[]>

  /**
   * 创建 Archetype（含 user_audit_log 写入）
   * @param input - 创建输入
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄
   * @returns 创建的 Archetype
   */
  create(input: CreateActivityArchetypeInput, userId: USOM_ID, tx?: DbClient): Promise<ActivityArchetype>

  /**
   * 更新 Archetype（含 user_audit_log 写入，记录 changedFields）
   * @param id - Archetype ID
   * @param input - 更新输入
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄
   * @returns 更新后的 Archetype
   */
  update(id: USOM_ID, input: UpdateActivityArchetypeInput, userId: USOM_ID, tx?: DbClient): Promise<ActivityArchetype>

  /**
   * 删除非系统 Archetype（isSystem=true 拒绝删除）
   * @param id - Archetype ID
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄
   */
  delete(id: USOM_ID, userId: USOM_ID, tx?: DbClient): Promise<void>

  /**
   * 按 L1 分类初始化种子数据（幂等：按 l1Category + l2Name 判重）
   * @param userId - 用户 ID
   * @param tx - 可选事务句柄
   * @returns 实际插入数量
   */
  seedDefaults(userId: USOM_ID, tx?: DbClient): Promise<number>
}
