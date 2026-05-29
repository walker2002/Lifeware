import type { CnuiSurfaceHandler, CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { HabitLogRepository } from '@/domains/habits/repository/habit-log'
import { SystemEventRepository } from '@/lib/db/repositories/system-event.repository'
import { validateHabitFields } from '@/domains/habits/validation'
import { findTransition } from '@/domains/habits/transitions'
import type { CreateHabitInput } from '@/usom/interfaces/irepository'
import type { Habit, HabitFrequency } from '@/usom/types/objects'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { SystemEvent, SystemEventType } from '@/usom/types/process'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

const LIFECYCLE_STATUS_MAP: Record<string, string> = {
  activateHabit: 'draft',
  suspendHabit: 'active',
  archiveHabit: 'suspended',
  reactivateHabit: 'suspended',
}

const LIFECYCLE_SM_ACTION: Record<string, string> = {
  activateHabit: 'activate',
  suspendHabit: 'suspend',
  archiveHabit: 'archive',
  reactivateHabit: 'reactivate',
}

function getChineseActionLabel(action: string): string {
  const labels: Record<string, string> = {
    activate: '激活',
    suspend: '暂停',
    reactivate: '恢复',
    archive: '归档',
  }
  return labels[action] ?? action
}

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
    const habits = await repo.findByUserId(MVP_USER_ID)
    return habits
      .filter(h => h.status === 'active' && h.trackable)
      .map(h => ({
        id: h.id,
        title: h.title,
        defaultTime: h.defaultTime,
        defaultDuration: h.defaultDuration,
        streak: h.streak,
        todayLogged: false,
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
    // createHabit: 服务端校验 + 直接调用 repository
    if (action === 'createHabit') {
      const result = validateHabitFields(fields, 'createHabit')
      if (!result.valid) {
        return { success: false, error: result.errors.join('；') }
      }

      try {
        const habitRepo = new HabitRepository()
        const eventRepo = new SystemEventRepository()
        const now = new Date().toISOString() as Timestamp

        const input = fields as CreateHabitInput
        const habit = await habitRepo.create(input, MVP_USER_ID)

        // 创建系统事件
        const transition = findTransition('habits', 'habit', null, 'create')
        if (transition) {
          const event: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: transition.eventType as SystemEventType,
            occurredAt: now,
            triggeredBy: 'cnui_handler',
            payload: { habitId: habit.id, toStatus: transition.to },
            snapshotId: '' as USOM_ID,
          }
          await eventRepo.append(event, MVP_USER_ID)
        }

        return { success: true, data: { habit } }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '创建习惯失败'
        return { success: false, error: msg }
      }
    }

    // lifecycle actions
    if (action in LIFECYCLE_SM_ACTION) {
      const selectedIds = fields['selectedIds'] as string[]
      if (!selectedIds || selectedIds.length === 0) {
        return { success: false, error: '未选择任何习惯' }
      }

      const smAction = (fields['action'] as string ?? LIFECYCLE_SM_ACTION[action]) as 'activate' | 'suspend' | 'reactivate' | 'archive'

      try {
        const habitRepo = new HabitRepository()
        const eventRepo = new SystemEventRepository()
        const now = new Date().toISOString() as Timestamp
        let lastError: string | undefined

        for (const habitId of selectedIds) {
          const existing = await habitRepo.findById(habitId, MVP_USER_ID)
          if (!existing) {
            lastError = `习惯不存在: ${habitId}`
            continue
          }

          const transition = findTransition('habits', 'habit', existing.status, smAction)
          if (!transition) {
            lastError = `非法状态转换: action="${smAction}", fromState="${existing.status}"`
            continue
          }

          await habitRepo.updateStatus(habitId, transition.to, MVP_USER_ID)

          const event: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: transition.eventType as SystemEventType,
            occurredAt: now,
            triggeredBy: 'cnui_handler',
            payload: { habitId, fromStatus: existing.status, toStatus: transition.to },
            snapshotId: '' as USOM_ID,
          }
          await eventRepo.append(event, MVP_USER_ID)
        }

        if (lastError) return { success: false, error: lastError }
        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '状态更新失败'
        return { success: false, error: msg }
      }
    }

    // logHabit
    if (action === 'logHabit') {
      const selectedIds = fields['selectedIds'] as string[]
      const detailFields = (fields['detailFields'] ?? {}) as Record<string, Record<string, unknown>>

      if (!selectedIds || selectedIds.length === 0) {
        return { success: false, error: '未选择任何习惯' }
      }

      try {
        const habitLogRepo = new HabitLogRepository()
        const habitRepo = new HabitRepository()
        const eventRepo = new SystemEventRepository()
        const now = new Date().toISOString() as Timestamp
        let lastError: string | undefined

        for (const habitId of selectedIds) {
          const habit = await habitRepo.findById(habitId, MVP_USER_ID)
          if (!habit) {
            lastError = `习惯不存在: ${habitId}`
            continue
          }

          const itemFields = detailFields[habitId] as {
            actualDuration?: number
            completionRating?: number
            energyLevel?: number
            note?: string
          } | undefined

          await habitLogRepo.create({
            habitId,
            logDate: now.split('T')[0] as USOM_ID,
            actualDuration: itemFields?.actualDuration ?? habit.defaultDuration,
            completionRating: itemFields?.completionRating,
            energyLevel: itemFields?.energyLevel,
            note: itemFields?.note,
          }, MVP_USER_ID)

          // 更新 streak（简化版，实际应该调用 streak calculator）
          const transition = findTransition('habits', 'habit_log', null, 'create')
          if (transition) {
            const event: SystemEvent = {
              id: crypto.randomUUID() as USOM_ID,
              type: transition.eventType as SystemEventType,
              occurredAt: now,
              triggeredBy: 'cnui_handler',
              payload: { habitId, logDate: now.split('T')[0] },
              snapshotId: '' as USOM_ID,
            }
            await eventRepo.append(event, MVP_USER_ID)
          }
        }

        if (lastError) return { success: false, error: lastError }
        return { success: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '打卡失败'
        return { success: false, error: msg }
      }
    }

    return { success: false, error: `Unknown CN-UI action: habits/${action}` }
  },
}
