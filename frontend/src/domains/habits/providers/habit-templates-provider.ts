import type { ContextProvider } from '@/usom/types/process'
import type { IHabitTemplateRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'

export class HabitTemplatesProvider implements ContextProvider {
  constructor(private readonly repo: IHabitTemplateRepository) {}

  async provide(query: string, params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'templates_for_date') return []

    const { date, userId } = params as { date: string; userId: USOM_ID }
    const templates = await this.repo.findByUserId(userId)
    const dayOfWeek = new Date(date).getDay()

    return templates
      .filter(t => t.applicableDays.includes(dayOfWeek))
      .map(t => ({
        id: t.id,
        name: t.name,
        icon: t.icon,
        habits: t.habits,
      }))
  }
}
