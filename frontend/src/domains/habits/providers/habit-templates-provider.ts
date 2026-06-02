/**
 * @file habit-templates-provider
 * @brief 习惯模板上下文提供者
 * 
 * 实现 ContextProvider 接口，提供习惯模板数据的查询能力
 */

import type { ContextProvider } from '@/usom/types/process'
import type { IHabitTemplateRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'

/**
 * 习惯模板上下文提供者
 */
export class HabitTemplatesProvider implements ContextProvider {
  /**
   * 构造函数
   * 
   * @param repo - 习惯模板仓储实例
   */
  constructor(private readonly repo: IHabitTemplateRepository) {}

  /**
   * 提供习惯模板上下文数据
   * 
   * @param query - 查询类型
   * @param params - 查询参数
   * @returns 适用于指定日期的习惯模板列表
   */
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
