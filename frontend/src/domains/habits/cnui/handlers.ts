import type { CnuiSurfaceHandler, CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { validateHabitFields } from '@/domains/habits/validation'

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
    // createHabit: 服务端校验 + 通过 orchestrator 提交
    if (action === 'createHabit') {
      const result = validateHabitFields(fields, 'createHabit')
      if (!result.valid) {
        return { success: false, error: result.errors.join('；') }
      }
      // 委托给 intent.ts 中已有的 submitHabitIntent
      const { submitHabitIntent } = await import('@/app/actions/intent')
      return submitHabitIntent(fields as any)
    }

    // lifecycle actions
    if (action in LIFECYCLE_SM_ACTION) {
      const selectedIds = fields['selectedIds'] as string[]
      if (!selectedIds || selectedIds.length === 0) {
        return { success: false, error: '未选择任何习惯' }
      }

      const smAction = (fields['action'] as string ?? LIFECYCLE_SM_ACTION[action]) as 'activate' | 'suspend' | 'reactivate' | 'archive'

      const { updateHabitStatus } = await import('@/app/actions/intent')
      let lastError: string | undefined
      for (const habitId of selectedIds) {
        const result = await updateHabitStatus(habitId, smAction)
        if (!result.success) lastError = result.error
      }
      if (lastError) return { success: false, error: lastError }
      return { success: true }
    }

    // logHabit
    if (action === 'logHabit') {
      const selectedIds = fields['selectedIds'] as string[]
      const detailFields = (fields['detailFields'] ?? {}) as Record<string, Record<string, unknown>>

      if (!selectedIds || selectedIds.length === 0) {
        return { success: false, error: '未选择任何习惯' }
      }

      const { batchLogHabits } = await import('@/app/actions/intent')
      const items = selectedIds.map(id => ({
        habitId: id,
        fields: detailFields[id] as {
          actualDuration?: number
          completionRating?: number
          energyLevel?: number
          note?: string
        } | undefined,
      }))
      return batchLogHabits(items)
    }

    return { success: false, error: `Unknown CN-UI action: habits/${action}` }
  },
}
