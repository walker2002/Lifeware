/**
 * @file active-tasks-provider
 * @brief 活跃任务上下文提供者
 * 
 * 实现 ContextProvider 接口，提供活跃任务数据的查询能力
 */

import type { ContextProvider } from '@/usom/types/process'
import type { ITaskRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'

/**
 * 活跃任务上下文提供者
 */
export class ActiveTasksProvider implements ContextProvider {
  /**
   * 构造函数
   * 
   * @param repo - 任务仓储实例
   */
  constructor(private readonly repo: ITaskRepository) {}

  /**
   * 提供活跃任务上下文数据
   * 
   * @param query - 查询类型
   * @param params - 查询参数
   * @returns 活跃任务列表（包含详细信息）
   */
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
