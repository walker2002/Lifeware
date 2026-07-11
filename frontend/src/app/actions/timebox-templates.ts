/**
 * @file timebox-templates actions
 * @brief 时间盒模板配置 server actions（[023] A2 / [023-02] 行列表 + 模板级星期）
 *
 * 包装 TimeboxTemplateRepository（CRUD + audit），供客户端编辑器调用。
 * 订阅源（habits/tasks/threads）按用户可订阅的状态筛选：habits=active, tasks=active, threads=active。
 *
 * MVP 性能优化（[023-02] 决议 D.2 / [027-B] 收紧到 10s）：fetchSubscriptionSources 走 in-memory cache。
 * 后续接入 SWR 替代（cross-tab 同步）。
 */
'use server'

import { TimeboxTemplateRepository, type TimeboxTemplateInput, type TimeboxTemplate } from '@/lib/db/repositories/timebox-template'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { TaskRepository } from '@/domains/tasks/repository/task'
import { ThreadRepository } from '@/domains/tasks/repository/thread'
import { addMinutesToHHMM } from '@/domains/timebox/lib/template-row-helpers'
import type { USOM_ID } from '@/usom/types/primitives'

/** MVP 用户 ID（临时使用，与 activity-archetype.ts 一致） */
// [023] A2 QA hot-fix: 'use server' file 禁止 export const/string（Next.js: 只能 export async function）
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as USOM_ID

/** 操作结果 */
export interface TimeboxTemplateActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

/** 订阅源汇总（[023-02]：habit 多带 start/end；tasks/threads 仅 id+title。[027-B]：habits/tasks 补带 activityArchetypeId，供编辑器按来源派生） */
export interface SubscriptionSources {
  habits: Array<{ id: string; title: string; start: string; end: string; activityArchetypeId?: string | null }>
  tasks: Array<{ id: string; title: string; activityArchetypeId?: string | null }>
  threads: Array<{ id: string; title: string }>
}

/** 10s in-memory cache（[023-02] 决议 D.2，[027-B] 防御性收紧：MVP 单租户 UX 在 archetype 编辑后不宜 60s 过期） */
let _sourcesCache: { at: number; data: SubscriptionSources } | null = null
const SOURCES_CACHE_TTL_MS = 10_000

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

/** 拉取当前用户全部时间盒模板（供 GrowthMenu 入口的内联渲染首次加载用） */
export async function fetchTimeboxTemplates(): Promise<TimeboxTemplateActionResult<TimeboxTemplate[]>> {
  try {
    const repo = new TimeboxTemplateRepository()
    const data = await repo.findByUser(MVP_USER_ID)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '拉取时间盒模板失败' }
  }
}

// ─── 订阅源 ──────────────────────────────────────────────────────

/**
 * 拉取当前用户可选订阅的 habits/tasks/threads：
 * - habits: status='active'；返回中带 start（habit.defaultTime）+ end（start + defaultDuration）
 *   用于编辑器行 source='habit' 时锁定起止时间。
 * - tasks: status='todo' 或 'planned' 或 'in_progress'（活跃任务）
 * - threads: status='active'
 *
 * 10s in-memory cache（决议 D.2；[027-B] 防御性收紧到 10s 以缩短 archetype 编辑后的感知延迟）；MVP 用，后续接 SWR 替代。
 */
export async function fetchSubscriptionSources(): Promise<TimeboxTemplateActionResult<SubscriptionSources>> {
  try {
    if (_sourcesCache && Date.now() - _sourcesCache.at < SOURCES_CACHE_TTL_MS) {
      return { success: true, data: _sourcesCache.data }
    }

    const [habits, tasks, threads] = await Promise.all([
      new HabitRepository().findByUserId(MVP_USER_ID, { status: 'active' }),
      new TaskRepository().findByUserId(MVP_USER_ID, { status: ['todo', 'planned', 'in_progress'] }),
      new ThreadRepository().findByUserId(MVP_USER_ID, { status: 'active' }),
    ])
    const data: SubscriptionSources = {
      habits: habits.map((h) => ({
        id: h.id,
        title: h.title,
        start: h.defaultTime,
        end: addMinutesToHHMM(h.defaultTime, h.defaultDuration),
        activityArchetypeId: h.activityArchetypeId ?? null,
      })),
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, activityArchetypeId: t.activityArchetypeId ?? null })),
      threads: threads.map((th) => ({ id: th.id, title: th.name })),
    }
    _sourcesCache = { at: Date.now(), data }
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '拉取订阅源失败' }
  }
}

/** [PLR] F-12 测试钩子：清空 sources in-memory cache（仅测试用，prod 不调）
 * [QA] 必须 async — 'use server' 文件 Next.js 要求所有 export 是 async function
 */
export async function __resetForTesting(): Promise<void> {
  _sourcesCache = null
}