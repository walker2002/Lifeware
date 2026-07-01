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
      let drafts = (intentFields?.drafts as any[]) ?? []
      // [023-01+] 无 drafts → 初始化单条空白 draft 让用户填表
      //   场景：/createTimebox 单独无输入（chat 路径 line 564 openCnuiSurface 不传 intentFields）
      //   之前：空数组 → CreateTimebox.tsx:36 渲染"未识别到时间盒"
      //   现在：1 个 uuid + 当前时间 + 1h 区间的空白 draft，用户可直接填
      if (drafts.length === 0) {
        const now = new Date()
        const startIso = now.toISOString()
        const endIso = new Date(now.getTime() + 60 * 60 * 1000).toISOString()
        drafts = [{ id: crypto.randomUUID(), title: '', startTime: startIso, endTime: endIso }]
      }
      return {
        content: drafts.every(d => d.title === '') ? '请填写时间盒信息' : '请确认要创建的时间盒',
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

    // [023] A2.7 — logTimebox CNUI surface 打开：查询当日 ended 时间盒
    // 若 intentFields.targetId 指向某条，则置顶
    if (action === 'logTimebox') {
      const todayBoxes = await getTodayTimeboxes()
      const ended = todayBoxes.filter(t => t.status === 'ended')
      const targetId = (intentFields?.targetId as string | undefined) ?? null
      const items = ended.map(t => ({
        id: t.id,
        title: t.title,
        startTime: t.startTime,
        endTime: t.endTime,
      }))
      if (targetId) {
        const idx = items.findIndex(i => i.id === targetId)
        if (idx > 0) {
          const [picked] = items.splice(idx, 1)
          items.unshift(picked)
        }
      }
      return {
        content: ended.length === 0 ? '今日没有已结束的时间盒需要打卡' : `请为 ${ended.length} 个已结束时间盒打卡`,
        dataSnapshot: { items },
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

    // [023] A2.7 — logTimebox CNUI surface 提交：逐条 log，跳过 state='skipped' 或无 state 的项
    // completionStatus: 'completed'|'partial'，notes 透传
    if (action === 'logTimebox') {
      const { submitDynamicIntent } = await import('@/app/actions/intent')
      const items = (fields.items as any[]) ?? []
      const logged = items.filter(i => i.state && i.state !== 'skipped')
      for (const it of items) {
        if (!it.state || it.state === 'skipped') continue
        try {
          const r = await submitDynamicIntent('timebox', 'logTimebox', {
            objectId: it.id,
            completionStatus: it.state === 'completed' ? 'completed' : 'partial',
            notes: it.notes,
          })
          if (!r.success) return { success: false, error: r.error ?? `${it.title} 打卡失败` }
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : `${it.title} 打卡失败` }
        }
      }
      return { success: true, data: { count: logged.length } }
    }

    return { success: false, error: `Unknown CN-UI action: timebox/${action}` }
  },
}

/**
 * 所有 timebox domain 的 CNUI surface handler 映射
 *
 * manifest 区块 K 声明的每个 cnui_surface 都须在此登记一个 entry，
 * key = surface 名（intent_triggers.cnui_surface / generation_actions.cnui_surface_type），
 * 由 intent.ts 的 CNUI_HANDLERS 合并后供 openCnuiSurface 按 surfaceType 查找。
 * 单个 timeboxCnuiHandler 内部按 action 分支处理，故 4 个 surface 共用同一 handler。
 */
export const surfaceHandlers: Record<string, CnuiSurfaceHandler> = {
  'timebox-list': timeboxCnuiHandler,
  'create-timebox': timeboxCnuiHandler,
  'log-timebox': timeboxCnuiHandler,
  'adjust-schedule': timeboxCnuiHandler,
}
