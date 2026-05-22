import type { ContextProvider } from '@/usom/types/process'
import type { IHabitRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'

export class PendingHabitsProvider implements ContextProvider {
  constructor(private readonly repo: IHabitRepository) {}

  async provide(query: string, params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'unlogged_for_date') return []

    const { date, userId } = params as { date: string; userId: USOM_ID }
    const habits = await this.repo.findActive(userId)
    const dayOfWeek = new Date(date).getDay()

    const applicable = habits.filter(h => {
      if (h.frequency.type === 'daily') return true
      if (h.frequency.type === 'weekly') return h.frequency.daysOfWeek?.includes(dayOfWeek)
      if (h.frequency.type === 'custom') return h.frequency.daysOfWeek?.includes(dayOfWeek)
      return false
    })

    return applicable.map(h => ({
      id: h.id,
      title: h.title,
      defaultTime: h.defaultTime,
      defaultDuration: h.defaultDuration,
      frequencyType: h.frequency.type,
    }))
  }
}
