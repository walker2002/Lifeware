import { registerContextCapability } from '@/nexus/context-engine/registry'
import { z } from 'zod'
import type { IHabitRepository } from '@/usom/interfaces/irepository'

const HabitSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  defaultTime: z.string(),
  trackable: z.boolean(),
  streak: z.number(),
  todayLogged: z.boolean(),
})

const HabitLogSchema = z.object({
  habitId: z.string(),
  date: z.string(),
  completed: z.boolean(),
})

const HabitStreakSchema = z.object({
  habitId: z.string(),
  title: z.string(),
  currentStreak: z.number(),
  longestStreak: z.number(),
  completionRate7d: z.number(),
})

/** 注册 habits Domain 的查询用 Context Providers。在 Domain 初始化时调用。 */
export function registerHabitProviders(habitRepo: IHabitRepository) {
  registerContextCapability({
    id: 'activeHabits',
    provider: {
      async provide(_query, params) {
        const userId = params['userId'] as string
        const habits = await habitRepo.findActive(userId as any)
        return habits.map(h => ({
          id: h.id,
          title: h.title,
          status: h.status,
          defaultTime: h.defaultTime,
          trackable: h.trackable,
          streak: h.streak ?? 0,
          todayLogged: false,
        }))
      },
    },
    visibility: 'planning',
    schema: z.array(HabitSummarySchema),
    description: '活跃习惯列表',
  })

  registerContextCapability({
    id: 'habitLogs',
    provider: {
      async provide(_query, _params) {
        return []
      },
    },
    visibility: 'planning',
    schema: z.array(HabitLogSchema),
    description: '最近习惯打卡记录',
  })

  registerContextCapability({
    id: 'habitStreaks',
    provider: {
      async provide(_query, params) {
        const userId = params['userId'] as string
        const habits = await habitRepo.findActive(userId as any)
        return habits.map(h => ({
          habitId: h.id,
          title: h.title,
          currentStreak: h.streak ?? 0,
          longestStreak: h.longestStreak ?? 0,
          completionRate7d: h.completionRate7d ?? 0,
        }))
      },
    },
    visibility: 'planning',
    schema: z.array(HabitStreakSchema),
    description: '习惯连续打卡统计',
  })
}
