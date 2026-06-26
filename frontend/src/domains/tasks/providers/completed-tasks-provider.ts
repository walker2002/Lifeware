/**
 * @file completed-tasks-provider
 * @brief 已完成任务上下文提供者
 *
 * 实现 ContextProvider 接口，提供已完成任务数据的查询能力。
 * 无 OKR 知识——仅暴露任务完成态信息，供他域（如 OKR）读时聚合。
 */

import type { ContextProvider } from '@/usom/types/process'
import type { ITaskRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'

export class CompletedTasksProvider implements ContextProvider {
  constructor(private readonly repo: ITaskRepository) {}

  async provide(query: string, params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'completed_ids') return []

    const { userId } = params as { userId: USOM_ID }
    const tasks = await this.repo.findByStatuses(['completed'], userId)

    return tasks.map(t => ({
      id: t.id,
      title: t.title,
      completedAt: t.completedAt,
    }))
  }
}
