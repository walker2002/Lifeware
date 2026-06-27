/**
 * @file active-habits-provider
 * @brief 活跃习惯上下文提供者
 *
 * 实现 ContextProvider 接口，提供活跃习惯数据的查询能力。
 * 无 OKR 知识——仅暴露习惯基本信息，供他域（如 OKR）贡献关联时搜索。
 */

import type { ContextProvider } from '@/usom/types/process'
import type { IHabitRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'
import type { Habit } from '@/usom/types/objects'

export class ActiveHabitsProvider implements ContextProvider {
  constructor(private readonly repo: IHabitRepository) {}

  async provide(query: string, params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'active_habits') return []

    const { userId } = params as { userId: USOM_ID }
    const habits = await this.repo.findActive(userId)

    return habits.map((h: Habit) => ({
      id: h.id,
      title: h.title,
    }))
  }
}