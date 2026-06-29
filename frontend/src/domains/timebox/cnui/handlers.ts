/**
 * @file handlers
 * @brief Timebox CNUI Surface 处理器
 * 
 * 实现 CN-UI 协议的 Surface Handler，处理时间盒相关的打开、提交事件
 */

import type { CnuiSurfaceHandler, CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'
import { TimeboxRepository } from '@/domains/timebox/repository'
import { TaskRepository } from '@/domains/tasks/repository'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { HabitLogRepository } from '@/domains/habits/repository/habit-log'
import type { Timebox, Task, Habit } from '@/usom/types/objects'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * 获取今日日期字符串
 * 
 * @returns ISO 日期字符串 (YYYY-MM-DD)
 */
async function getTodayDate(): Promise<string> {
  return new Date().toISOString().split('T')[0]
}

/**
 * 获取今日时间盒列表
 * 
 * @returns 今日时间盒数组
 */
async function getTodayTimeboxes(): Promise<Timebox[]> {
  try {
    const repo = new TimeboxRepository()
    const today = await getTodayDate()
    const startOfDay = new Date(today + 'T00:00:00').toISOString() as Timestamp
    const endOfDay = new Date(today + 'T23:59:59').toISOString() as Timestamp
    return repo.findByDateRange(startOfDay, endOfDay, MVP_USER_ID)
  } catch (e) {
    console.error('[timeboxCnuiHandler] 查询今日 timeboxes 失败:', e)
    return []
  }
}

async function getActiveTasks(): Promise<Task[]> {
  try {
    const repo = new TaskRepository()
    return repo.findByStatus('todo', MVP_USER_ID)
  } catch (e) {
    console.error('[timeboxCnuiHandler] 查询活跃任务失败:', e)
    return []
  }
}

async function getPendingHabits(): Promise<Habit[]> {
  try {
    const habitRepo = new HabitRepository()
    const logRepo = new HabitLogRepository()
    const today = await getTodayDate()

    const activeHabits = await habitRepo.findByUserId(MVP_USER_ID, { status: 'active', trackable: true })
    const loggedIds = new Set((await logRepo.findByUserAndDate(today as USOM_ID, MVP_USER_ID)).map(l => l.habitId))

    return activeHabits.filter(h => !loggedIds.has(h.id))
  } catch (e) {
    console.error('[timeboxCnuiHandler] 查询待打卡习惯失败:', e)
    return []
  }
}

export const timeboxCnuiHandler: CnuiSurfaceHandler = {
  async open(action, intentFields): Promise<CnuiSurfaceOpenResult> {
    // [023] A2.5 — AI 助手解析多条 timebox 草稿后透传 drafts
    if (action === 'createTimebox') {
      const drafts = (intentFields?.drafts as any[]) ?? []
      return {
        content: '请确认要创建的时间盒',
        dataSnapshot: { items: drafts },
      }
    }

    if (action === 'createSmartSchedule') {
      const [timeboxes, tasks, habits] = await Promise.all([
        getTodayTimeboxes(),
        getActiveTasks(),
        getPendingHabits(),
      ])

      return {
        content: '智能编排日程 — 根据您的任务、习惯和能量曲线，AI 将自动生成今日时间盒方案',
        dataSnapshot: {
          existingTimeboxes: timeboxes.map(t => ({
            id: t.id,
            title: t.title,
            startTime: t.startTime,
            endTime: t.endTime,
            status: t.status,
          })),
          activeTasks: tasks.map(t => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            estimatedDuration: t.estimatedDuration,
          })),
          pendingHabits: habits.map(h => ({
            id: h.id,
            title: h.title,
            defaultTime: h.defaultTime,
            defaultDuration: h.defaultDuration,
          })),
        },
      }
    }

    if (action === 'adjustRemainingSchedule') {
      const [timeboxes, tasks] = await Promise.all([
        getTodayTimeboxes(),
        getActiveTasks(),
      ])

      const remainingTasks = tasks.filter(t =>
        !timeboxes.some(tb => (tb.taskIds ?? []).includes(t.id))
      )

      return {
        content: '调整剩余日程 — 根据已完成项目重新安排今日剩余时间',
        dataSnapshot: {
          existingTimeboxes: timeboxes.map(t => ({
            id: t.id,
            title: t.title,
            startTime: t.startTime,
            endTime: t.endTime,
            status: t.status,
          })),
          // [023] A2 OV#P2-#3：open 时注入 _origTitle/_origStart/_origEnd 初始快照，
          // submit 比对（无改动不触发 updateTimebox，避免「重写整行」语义损失）。
          items: timeboxes.map(t => ({
            id: t.id,
            title: t.title,
            startTime: t.startTime,
            endTime: t.endTime,
            status: t.status,
            _origTitle: t.title,
            _origStart: t.startTime,
            _origEnd: t.endTime,
          })),
          remainingTasks: remainingTasks.map(t => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            estimatedDuration: t.estimatedDuration,
          })),
        },
      }
    }

    return { content: '请填写信息', dataSnapshot: {} }
  },

  async submit(action, fields): Promise<CnuiSurfaceSubmitResult> {
    // [023] A2.5 — 多条 timebox 草稿逐条走 Nexus
    if (action === 'createTimebox') {
      const { submitDynamicIntent } = await import('@/app/actions/intent')
      const items = (fields.items as any[]) ?? []
      // C3：逐条提交不回滚，收集 succeeded/failed 明细
      const succeeded: string[] = []
      const failed: { title: string; error: string }[] = []
      for (const it of items) {
        try {
          const r = await submitDynamicIntent('timebox', 'createTimebox', it)
          if (r.success) succeeded.push((r.object as any)?.id ?? it.title)
          else failed.push({ title: it.title ?? '未命名', error: r.error ?? '创建失败' })
        } catch (e) {
          // [023] A2.5 review fix: 异常路径仍走 C3 succeeded/failed，不破坏「不回滚」契约
          failed.push({ title: it.title ?? '未命名', error: e instanceof Error ? e.message : '创建失败' })
        }
      }
      return {
        success: failed.length === 0,
        error: failed.length ? `${failed.length} 条失败：${failed.map(f => f.title).join('、')}` : undefined,
        data: { count: succeeded.length, succeeded, failed },
      }
    }

    // [023] A2.6 — adjustSchedule CNUI surface 提交：仅写 diff 项，字段走 updateTimebox 直调、
    // cancel 走 deleteTimebox（OV#8 状态守卫），非死调 submitDynamicIntent
    // （manifest 无 updateTimebox/cancelTimebox intent_trigger，路径不同）。
    if (action === 'adjustRemainingSchedule') {
      const { updateTimebox, deleteTimebox } = await import('@/app/actions/timebox')
      const items = (fields.items as any[]) ?? []
      for (const it of items) {
        if (it.cancel) {
          // cancel 走 deleteTimebox（=cancel + OV#8 状态守卫），非 raw submitDynamicIntent
          try {
            await deleteTimebox(it.id)
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : '取消失败' }
          }
        } else if (it.title !== it._origTitle || it.startTime !== it._origStart || it.endTime !== it._origEnd) {
          // 字段写直调 updateTimebox（mutation service.execute，OV-T2）
          try {
            await updateTimebox(it.id, { title: it.title, startTime: it.startTime, endTime: it.endTime })
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : '更新失败' }
          }
        }
        // else: 无改动跳过（diff 守护，OV#P2-#3）
      }
      return { success: true, data: { count: items.length } }
    }

    if (action === 'createSmartSchedule') {
      // 这里应该调用 AI scheduling handler
      // 暂时返回成功，实际实现需要调用 scheduling-handler
      return { success: true }
    }

    return { success: false, error: `Unknown CN-UI action: timebox/${action}` }
  },
}

/** 所有 timebox domain 的 CNUI surface handler 映射 */
export const surfaceHandlers: Record<string, CnuiSurfaceHandler> = {
  'timebox-list': timeboxCnuiHandler,
}
