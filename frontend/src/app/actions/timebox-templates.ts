/**
 * @file timebox-templates actions
 * @brief 时间盒模板配置 server actions（[023] A2，配置类不走 Nexus）
 *
 * 包装 TimeboxTemplateRepository（CRUD + audit），供客户端编辑器调用。
 * 订阅源（habits/tasks/threads）按用户可订阅的状态筛选：habits=active, tasks=active, threads=active。
 */
'use server'

import { TimeboxTemplateRepository, type TimeboxTemplateInput, type TimeboxTemplate } from '@/lib/db/repositories/timebox-template'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { TaskRepository } from '@/domains/tasks/repository/task'
import { ThreadRepository } from '@/domains/tasks/repository/thread'
import type { USOM_ID } from '@/usom/types/primitives'

/** MVP 用户 ID（临时使用，与 activity-archetype.ts 一致） */
export const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as USOM_ID

/** 操作结果 */
export interface TimeboxTemplateActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

/** 订阅源汇总（habits/tasks/threads 都用 { id, title } 简化） */
export interface SubscriptionSources {
  habits: Array<{ id: string; title: string }>
  tasks: Array<{ id: string; title: string }>
  threads: Array<{ id: string; title: string }>
}

// ─── CRUD ────────────────────────────────────────────────────────

export async function saveTimeboxTemplate(
  input: TimeboxTemplateInput,
): Promise<TimeboxTemplateActionResult<TimeboxTemplate>> {
  try {
    const repo = new TimeboxTemplateRepository()
    const data = input.id
      ? await repo.update(input.id, input, MVP_USER_ID)
      : await repo.create(input, MVP_USER_ID)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '保存时间盒模板失败' }
  }
}

export async function deleteTimeboxTemplate(
  id: string,
): Promise<TimeboxTemplateActionResult> {
  try {
    const repo = new TimeboxTemplateRepository()
    await repo.delete(id, MVP_USER_ID)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '删除时间盒模板失败' }
  }
}

// ─── 订阅源 ──────────────────────────────────────────────────────

/**
 * 拉取当前用户可选订阅的 habits/tasks/threads：
 * - habits: status='active'
 * - tasks: status='todo' 或 'planned' 或 'in_progress'（活跃任务）
 * - threads: status='active'
 */
export async function fetchSubscriptionSources(): Promise<TimeboxTemplateActionResult<SubscriptionSources>> {
  try {
    const [habits, tasks, threads] = await Promise.all([
      new HabitRepository().findByUserId(MVP_USER_ID, { status: 'active' }),
      new TaskRepository().findByUserId(MVP_USER_ID, { status: ['todo', 'planned', 'in_progress'] }),
      new ThreadRepository().findByUserId(MVP_USER_ID, { status: 'active' }),
    ])
    return {
      success: true,
      data: {
        habits: habits.map((h) => ({ id: h.id, title: h.title })),
        tasks: tasks.map((t) => ({ id: t.id, title: t.title })),
        threads: threads.map((th) => ({ id: th.id, title: th.name })),
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '拉取订阅源失败' }
  }
}