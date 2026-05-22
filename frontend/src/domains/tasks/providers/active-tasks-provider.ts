import type { ContextProvider } from '@/usom/types/process'
import type { ITaskRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'

export class ActiveTasksProvider implements ContextProvider {
  constructor(private readonly repo: ITaskRepository) {}

  async provide(query: string, params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'active_with_details') return []

    const { userId } = params as { userId: USOM_ID }
    const tasks = await this.repo.findByStatus('active', userId)

    return tasks.map(t => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      energyRequired: t.energyRequired,
      estimatedDuration: t.estimatedDuration,
      projectId: t.projectId,
    }))
  }
}
