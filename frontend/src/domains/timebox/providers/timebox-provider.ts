import type { ContextProvider } from '@/usom/types/process'
import type { ITimeboxRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'

export class TimeboxProvider implements ContextProvider {
  constructor(private readonly repo: ITimeboxRepository) {}

  async provide(query: string, params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'timeboxes_for_date') return []

    const { date, userId } = params as { date: string; userId: USOM_ID }
    const dayStart = new Date(`${date}T00:00:00`).toISOString()
    const dayEnd = new Date(`${date}T23:59:59`).toISOString()

    const timeboxes = await this.repo.findByDateRange(dayStart, dayEnd, userId)

    return timeboxes.map(t => ({
      id: t.id,
      title: t.title,
      startTime: t.startTime,
      endTime: t.endTime,
      status: t.status,
      habitIds: t.habitIds,
      taskIds: t.taskIds,
    }))
  }
}
