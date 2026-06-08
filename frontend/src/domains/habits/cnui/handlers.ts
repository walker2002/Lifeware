/**
 * @file handlers
 * @brief Habits CNUI Surface 处理器
 * 
 * 实现 CN-UI 协议的 Surface Handler，处理习惯相关的打开、提交事件
 */

import type { CnuiSurfaceHandler, CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { HabitLogRepository } from '@/domains/habits/repository/habit-log'
import type { USOM_ID } from '@/usom/types/primitives'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/** 生命周期状态映射 */
const LIFECYCLE_STATUS_MAP: Record<string, string> = {
  activateHabit: 'draft',
  suspendHabit: 'active',
  archiveHabit: 'suspended',
  reactivateHabit: 'suspended',
}

/** 生命周期状态机动作映射 */
const LIFECYCLE_SM_ACTION: Record<string, string> = {
  activateHabit: 'activate',
  suspendHabit: 'suspend',
  archiveHabit: 'archive',
  reactivateHabit: 'reactivate',
}

/**
 * 获取中文动作标签
 * 
 * @param action - 动作名称
 * @returns 中文标签
 */
function getChineseActionLabel(action: string): string {
  const labels: Record<string, string> = {
    activate: '激活',
    suspend: '暂停',
    reactivate: '恢复',
    archive: '归档',
  }
  return labels[action] ?? action
}

/**
 * 根据状态获取习惯列表
 * 
 * @param status - 习惯状态
 * @returns 习惯列表
 */
async function getItemsByStatus(status: string): Promise<Record<string, unknown>[]> {
  try {
    const repo = new HabitRepository()
    const habits = await repo.findByUserId(MVP_USER_ID)
    return habits
      .filter(h => h.status === status)
      .map(h => ({
        id: h.id,
        title: h.title,
        defaultTime: h.defaultTime,
        streak: h.streak,
        frequencyType: h.frequency.type,
        status: h.status,
      }))
  } catch (e) {
    console.error(`[habitCnuiHandler] 查询 habits (status=${status}) 失败:`, e)
    return []
  }
}

async function getTrackableHabits(): Promise<Record<string, unknown>[]> {
  try {
    const repo = new HabitRepository()
    const logRepo = new HabitLogRepository()
    const habits = await repo.findByUserId(MVP_USER_ID)
    const today = new Date().toISOString().slice(0, 10)
    const todayLogs = await logRepo.findByUserAndDate(today as any, MVP_USER_ID)
    const loggedIds = new Set(todayLogs.map(l => l.habitId))
    return habits
      .filter(h => h.status === 'active' && h.trackable)
      .map(h => ({
        id: h.id,
        title: h.title,
        defaultTime: h.defaultTime,
        defaultDuration: h.defaultDuration,
        streak: h.streak,
        todayLogged: loggedIds.has(h.id),
      }))
  } catch (e) {
    console.error('[habitCnuiHandler] 查询可打卡 habits 失败:', e)
    return []
  }
}

export const habitCnuiHandler: CnuiSurfaceHandler = {
  async open(action): Promise<CnuiSurfaceOpenResult> {
    if (action === 'createHabit') {
      return { content: '请填写习惯信息', dataSnapshot: { startDate: new Date().toISOString().slice(0, 10) } }
    }

    if (action === 'logHabit') {
      const pending = await getTrackableHabits()
      return {
        content: '请选择要打卡的习惯',
        dataSnapshot: { items: pending },
      }
    }

    if (action in LIFECYCLE_STATUS_MAP) {
      const status = LIFECYCLE_STATUS_MAP[action]
      const items = await getItemsByStatus(status)
      const smAction = LIFECYCLE_SM_ACTION[action]

      return {
        content: `请选择要${getChineseActionLabel(smAction)}的习惯`,
        dataSnapshot: { action: smAction, items },
      }
    }

    return { content: '请填写信息', dataSnapshot: {} }
  },

  async submit(action, fields): Promise<CnuiSurfaceSubmitResult> {
    try {
      const { submitDynamicIntent } = await import('@/app/actions/intent')
      const result = await submitDynamicIntent('habits', action, fields)
      return { success: result.success, error: result.error }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败'
      return { success: false, error: msg }
    }
  },
}

/** 所有 habits domain 的 CNUI surface handler 映射 */
export const surfaceHandlers: Record<string, CnuiSurfaceHandler> = {
  'habit-action-panel': habitCnuiHandler,
  'habit-checkin-panel': habitCnuiHandler,
  'habit-creation-card': habitCnuiHandler,
}
