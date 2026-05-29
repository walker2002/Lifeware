import type { CnuiSurfaceHandler, CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'
import { TimeboxRepository } from '@/domains/timebox/repository'
import { TaskRepository } from '@/domains/tasks/repository'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { HabitLogRepository } from '@/domains/habits/repository/habit-log'
import type { Timebox, Task, Habit } from '@/usom/types/objects'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

async function getTodayDate(): Promise<string> {
  return new Date().toISOString().split('T')[0]
}

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
    return repo.findByStatus('active', MVP_USER_ID)
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
  async open(action): Promise<CnuiSurfaceOpenResult> {
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
    if (action === 'createSmartSchedule' || action === 'adjustRemainingSchedule') {
      // 这里应该调用 AI scheduling handler
      // 暂时返回成功，实际实现需要调用 scheduling-handler
      return { success: true }
    }

    return { success: false, error: `Unknown CN-UI action: timebox/${action}` }
  },
}
