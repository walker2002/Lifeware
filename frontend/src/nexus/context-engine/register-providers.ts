import { z } from 'zod'
import { registerContextCapability } from './registry'
import { TimeboxProvider, EnergyCurveProvider } from '@/domains/timebox/providers'
import { ActiveTasksProvider, CompletedTasksProvider } from '@/domains/tasks/providers'
import { PendingHabitsProvider, ActiveHabitsProvider } from '@/domains/habits/providers'
import type { ITimeboxRepository, ITaskRepository, IHabitRepository } from '@/usom/interfaces/irepository'

const TimeboxArraySchema = z.array(z.object({
  id: z.string(),
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  status: z.string(),
  habitIds: z.array(z.string()),
  taskIds: z.array(z.string()),
}))

const TaskArraySchema = z.array(z.object({
  id: z.string(),
  title: z.string(),
  priority: z.string(),
  energyRequired: z.string().optional(),
  estimatedDuration: z.number(),
  threadId: z.string().nullable().optional(),
}))

const CompletedTaskArraySchema = z.array(z.object({
  id: z.string(),
  title: z.string(),
  completedAt: z.string().optional(),
}))

const HabitArraySchema = z.array(z.object({
  id: z.string(),
  title: z.string(),
  defaultTime: z.string(),
  defaultDuration: z.number(),
  frequencyType: z.string(),
}))

/**
 * EnergyCurve Schema（F3 [023] A0 post-review）
 *
 * 原始 `z.array(z.number())` 接受 NaN/Infinity/负数/&gt;23/小数——
 * 静默污染 routing 与 energy match 计算。
 *
 * 守卫：每个 hour 必须为 [0, 23] 区间内的整数（z.number().int() 已
 * 拒绝 NaN/Infinity/小数）。空数组允许（MVP 静态默认与用户校准
 * 动态值都允许空）。
 */
const EnergyCurveHourSchema = z.number().int().min(0).max(23)

const EnergyCurveSchema = z.object({
  peakHours: z.array(EnergyCurveHourSchema),
  lowHours: z.array(EnergyCurveHourSchema),
  source: z.string(),
})

export interface ProviderDeps {
  timeboxRepo?: ITimeboxRepository
  taskRepo?: ITaskRepository
  habitRepo?: IHabitRepository
}

export function registerAllProviders(deps: ProviderDeps): void {
  if (deps.timeboxRepo) {
    registerContextCapability({
      id: 'existingTimeboxes',
      visibility: 'planning',
      schema: TimeboxArraySchema,
      description: '已有时间盒',
      provider: new TimeboxProvider(deps.timeboxRepo),
    })
  }

  if (deps.taskRepo) {
    registerContextCapability({
      id: 'activeTasks',
      visibility: 'planning',
      schema: TaskArraySchema,
      description: '活跃任务',
      provider: new ActiveTasksProvider(deps.taskRepo),
    })

    registerContextCapability({
      id: 'completedTasks',
      visibility: 'planning',
      schema: CompletedTaskArraySchema,
      description: '已完成任务（供跨域贡献重算）',
      provider: new CompletedTasksProvider(deps.taskRepo),
    })
  }

  if (deps.habitRepo) {
    registerContextCapability({
      id: 'pendingHabits',
      visibility: 'planning',
      schema: HabitArraySchema,
      description: '待打卡习惯',
      provider: new PendingHabitsProvider(deps.habitRepo),
    })

    registerContextCapability({
      id: 'activeHabits',
      visibility: 'planning',
      schema: z.array(z.object({
        id: z.string(),
        title: z.string(),
      })),
      description: '活跃习惯列表（供跨域贡献关联搜索）',
      provider: new ActiveHabitsProvider(deps.habitRepo),
    })
  }

  registerContextCapability({
    id: 'energyCurve',
    visibility: 'planning',
    schema: EnergyCurveSchema,
    description: '能量曲线（高效/低效时段）',
    provider: new EnergyCurveProvider(),
  })
}

import { TimeboxRepository } from '@/domains/timebox/repository'
import { TaskRepository } from '@/domains/tasks/repository'
import { HabitRepository } from '@/domains/habits/repository/habit'

/**
 * [023-01] 幂等保证 capability 已注册。
 *
 * registerAllProviders 原是死代码（零调用方），导致 6 个 capability provider
 * 从未注册，任何生成型路径 action 报 "Context capability not found"。
 * 由 orchestrator executeGenerativePath 入口调用（lazy + 幂等：仅生成型路径
 * 需要 capability，contract 路径不浪费）。
 */
let _providersRegistered = false
export function ensureProvidersRegistered(): void {
  if (_providersRegistered) return
  registerAllProviders({
    timeboxRepo: new TimeboxRepository(),
    taskRepo: new TaskRepository(),
    habitRepo: new HabitRepository(),
  })
  _providersRegistered = true
}
