import { HabitStatisticsHandler } from './statistics-handler'
import type { DomainHandler } from '@/usom/types/process'

export const habitHandlers: Record<string, DomainHandler> = {
  habit_statistics: new HabitStatisticsHandler(),
}
