/**
 * @file timebox-provider
 * @brief 时间盒上下文提供者
 * 
 * 实现 ContextProvider 接口，提供时间盒数据的查询能力
 */

import type { ContextProvider } from '@/usom/types/process'
import type { ITimeboxRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'

/**
 * 时间盒上下文提供者
 */
export class TimeboxProvider implements ContextProvider {
  /**
   * 构造函数
   * 
   * @param repo - 时间盒仓储实例
   */
  constructor(private readonly repo: ITimeboxRepository) {}

  /**
   * 提供时间盒上下文数据
   * 
   * @param query - 查询类型
   * @param params - 查询参数
   * @returns 时间盒列表
   */
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
