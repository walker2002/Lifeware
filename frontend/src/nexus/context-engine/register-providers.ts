import { z } from 'zod'
import { registerContextCapability } from './registry'
import { TimeboxProvider, EnergyCurveProvider } from '@/domains/timebox/providers'
import { ActiveTasksProvider, CompletedTasksProvider } from '@/domains/tasks/providers'
import { PendingHabitsProvider, HabitTemplatesProvider, ActiveHabitsProvider } from '@/domains/habits/providers'
import type { ITimeboxRepository, ITaskRepository, IHabitRepository, IHabitTemplateRepository } from '@/usom/interfaces/irepository'

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

const TemplateArraySchema = z.array(z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  habits: z.array(z.any()),
}))

const EnergyCurveSchema = z.object({
  peakHours: z.array(z.number()),
  lowHours: z.array(z.number()),
  source: z.string(),
})

export interface ProviderDeps {
  timeboxRepo?: ITimeboxRepository
  taskRepo?: ITaskRepository
  habitRepo?: IHabitRepository
  habitTemplateRepo?: IHabitTemplateRepository
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

  if (deps.habitTemplateRepo) {
    registerContextCapability({
      id: 'habitTemplates',
      visibility: 'planning',
      schema: TemplateArraySchema,
      description: '习惯模板',
      provider: new HabitTemplatesProvider(deps.habitTemplateRepo),
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
