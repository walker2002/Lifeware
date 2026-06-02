/**
 * @file pending-habits-provider
 * @brief 待打卡习惯上下文提供者
 * 
 * 实现 ContextProvider 接口，提供指定日期待打卡习惯数据的查询能力
 */

import type { ContextProvider } from '@/usom/types/process'
import type { IHabitRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'

/**
 * 待打卡习惯上下文提供者
 */
export class PendingHabitsProvider implements ContextProvider {
  /**
   * 构造函数
   * 
   * @param repo - 习惯仓储实例
   */
  constructor(private readonly repo: IHabitRepository) {}

  /**
   * 提供待打卡习惯上下文数据
   * 
   * @param query - 查询类型
   * @param params - 查询参数
   * @returns 指定日期需要打卡的活跃习惯列表
   */
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
