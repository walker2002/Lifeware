/**
 * @file handlers
 * @brief Timebox CNUI Surface 处理器
 * 
 * 实现 CN-UI 协议的 Surface Handler，处理时间盒相关的打开、提交事件
 */

import type { CnuiSurfaceHandler, CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'
import { TimeboxRepository, ItineraryRepository } from '@/domains/timebox/repository'
import { TaskRepository } from '@/domains/tasks/repository'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { HabitLogRepository } from '@/domains/habits/repository/habit-log'
import type { Timebox, Task, Habit } from '@/usom/types/objects'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import { hhmmToIso } from './surfaces/time-input-helpers'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * 获取今日日期字符串
 *
 * [023.04] I-1 follow-up：使用 Asia/Shanghai 时区取 todayStr，
 *   避免 now.toISOString().split('T')[0] 在 0:00-4:00 CST 时段跨日漂移
 *   （CST=UTC+8，若 now=2026-07-04T01:00 CST → ISO=2026-07-03T17:00Z → '2026-07-03'，
 *   而用户实际是 7-4 早上，按 ISO 切会拿到前日）
 *
 * @returns ISO 日期字符串 (YYYY-MM-DD)
 */
async function getTodayDate(): Promise<string> {
  // en-CA locale 输出格式稳定为 YYYY-MM-DD，符合本函数契约
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
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
      //   现在：1 个 uuid + 下一个整点开始 + 1h 区间的空白 draft，用户可直接填
      // [023-01+] RC-C：startTime 默认 = 下一个整点（next round hour）
      //   原因：原版本 startTime = now.toISOString()，用户填好 title 提交时已过几分钟
      //   → StartTimeInFutureRule（timebox.ts:142）触发 "startTime 在过去" warning
      //   → 所有空白 CNUI 创建的 timebox 都失败（即使 title 有填）
      //   修复：startTime 推到下一个整点（HH:00），endTime = startTime + 1h，
      //   保证任何时候提交都通过 StartTimeInFutureRule
      if (drafts.length === 0) {
        const now = new Date()
        const nextRound = new Date(now)
        nextRound.setHours(now.getHours() + 1, 0, 0, 0)  // HH:00:00.000（下一个整点）
        const startIso = nextRound.toISOString()
        const endIso = new Date(nextRound.getTime() + 60 * 60 * 1000).toISOString()
        drafts = [{ id: crypto.randomUUID(), title: '', startTime: startIso, endTime: endIso }]
      }
      return {
        content: drafts.every(d => d.title === '') ? '请填写时间盒信息' : '请确认要创建的时间盒',
        dataSnapshot: { items: drafts },
      }
    }

    if (action === 'createSmartTimeboxes') {
      const [timeboxes, tasks, habits] = await Promise.all([
        getTodayTimeboxes(),
        getActiveTasks(),
        getPendingHabits(),
      ])

      return {
        content: '智能编排时间盒 — 根据您的任务、习惯和能量曲线，AI 将自动生成今日时间盒方案',
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
      // [023.07] #5 — dedupe by id：SM 重复推进（reconcile）或时区边界可能让
      // getTodayTimeboxes() 返回同 id 副本，UI 会显示重复卡片 + submit 走两次导致
      // 第二次 SM 拒绝返幽灵错误。按 id 保留首次出现项（显式 helper 版本以匹配本文件
      // 其他 filter 的显式 predicate 风格）。
      const seenIds = new Set<string>()
      const ended = todayBoxes.filter(t => {
        if (t.status !== 'ended') return false
        if (seenIds.has(t.id)) return false
        seenIds.add(t.id)
        return true
      })
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

    if (action === 'adjustRemainingTimeboxes') {
      const [timeboxes, tasks] = await Promise.all([
        getTodayTimeboxes(),
        getActiveTasks(),
      ])

      const remainingTasks = tasks.filter(t =>
        !timeboxes.some(tb => (tb.taskIds ?? []).includes(t.id))
      )

      return {
        content: '调整剩余时间盒 — 根据已完成项目重新安排今日剩余时间',
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

    // [026] A2.5 — 行程 3 surface open 分支（D2 reversal：列表筛 {scheduled, in_progress}）
    if (action === 'createItinerary') {
      let drafts = (intentFields?.drafts as any[]) ?? []
      // 无 drafts → 初始化单条空白 draft（默认明日 9:00 + 1h）。用户填表直接走。
      if (drafts.length === 0) {
        const now = new Date()
        const nextRound = new Date(now)
        nextRound.setDate(now.getDate() + 1)
        nextRound.setHours(9, 0, 0, 0)
        const startIso = nextRound.toISOString()
        drafts = [{ id: crypto.randomUUID(), title: '', startTime: startIso, durationMin: 60, people: [], detail: null }]
      }
      // D2 reversal：列表筛 {scheduled, in_progress}（用 findActive，已 T4 实现）
      const all = await new ItineraryRepository().findActive(MVP_USER_ID as USOM_ID)
      return {
        content: drafts.every(d => d.title === '') ? '请填写行程信息' : '请确认要创建的行程',
        dataSnapshot: {
          items: drafts,
          existing: all.map(i => ({ id: i.id, title: i.title, startTime: i.startTime, status: i.status })),
        },
      }
    }

    if (action === 'editItinerary') {
      // D2 reversal：列表筛 {scheduled, in_progress}，终态自然不在列表
      const all = await new ItineraryRepository().findActive(MVP_USER_ID as USOM_ID)
      return {
        content: '请选择要修改的计划/执行中行程',
        dataSnapshot: { items: all.map(i => ({
          id: i.id, title: i.title, startTime: i.startTime,
          durationMin: i.durationMin, detail: i.detail, people: i.people, status: i.status,
        })) },
      }
    }

    if (action === 'deleteItinerary') {
      // D2 reversal：列表筛 {scheduled, in_progress}，终态自然不在列表
      const all = await new ItineraryRepository().findActive(MVP_USER_ID as USOM_ID)
      return {
        content: '请选择要删除的计划/执行中行程（可多选）',
        dataSnapshot: { items: all.map(i => ({ id: i.id, title: i.title, startTime: i.startTime, status: i.status })) },
      }
    }

    // [023.04]：editTimeboxes — 解析优先模式（解析成功 → editing + prefill；失败 → selecting + 当日列表）
    if (action === 'editTimeboxes') {
      const prompt = (intentFields?.prompt as string | undefined) ?? ''
      const { parseTimeboxesIntent } = await import('@/domains/timebox/cnui/parse-timeboxes')
      const todayBoxes = await getTodayTimeboxes()
      const todaySummaries = todayBoxes.map(t => ({
        id: t.id,
        title: t.title,
        startTime: t.startTime,
        endTime: t.endTime,
        status: t.status,
        taskIds: t.taskIds ?? [],
        habitIds: t.habitIds ?? [],
      }))
      const parsed = await parseTimeboxesIntent(prompt, todaySummaries as never)

      // [023.04] I-7 polish: T-eng-6 confidence<0.5 → 强制降级 selecting,
      //   即使 parsed.kind==='edit' 也不直接进 editing(prefill 用 prefill 字段,但 mode=selecting
      //   让用户在 selecting 模式用 reason 提示 prompt 补充具体小时)
      const confidenceGate =
        parsed.kind === 'edit' && parsed.confidence < 0.5
          ? { kind: 'unsure' as const, reason: '未识别到具体时间,请补充如「改到 14:00」' }
          : parsed

      if (confidenceGate.kind === 'edit' || confidenceGate.kind === 'cancel') {
        const target = todayBoxes.find(t => t.id === confidenceGate.timeboxId)
        // [023.04] T-eng-8 safe-default：parsed.timeboxId 命中但不在 todayBoxes（race：
        //   用户开的瞬间该 timebox 被外部删/改期）→ silent fallback selecting，不 crash
        if (target) {
          const prefill: Record<string, unknown> = {
            title: target.title,
            startTime: target.startTime,
            endTime: target.endTime,
            ...(parsed.kind === 'edit' && parsed.newStartTime ? { startTime: parsed.newStartTime } : {}),
            ...(parsed.kind === 'edit' && parsed.newEndTime ? { endTime: parsed.newEndTime } : {}),
            ...(target.activityArchetypeId ? { activityArchetypeId: target.activityArchetypeId } : {}),
          }
          return {
            content: parsed.kind === 'cancel' ? `确认要取消「${target.title}」？` : `请确认修改「${target.title}」`,
            dataSnapshot: {
              mode: 'editing',
              selectedId: target.id,
              prefill,
              status: target.status,
              items: todaySummaries,
              readOnly: false,
            },
          }
        }
      }

      // 解析失败 / 不确定 / 命中无 target → selecting 模式（兜底）
      return {
        content: '请选择要操作的时间盒',
        dataSnapshot: {
          mode: 'selecting',
          items: todaySummaries,
          readOnly: false,
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
          // [023.08] T2: ISO 时间 convert — orchestration proposal 发 HH:MM + date,
          // server action 接收时显式 convert 为 ISO UTC,落库前规范化
          const normalized: Record<string, unknown> = { ...it }
          if (typeof it.startTime === 'string' && /^\d{2}:\d{2}$/.test(it.startTime) && typeof it.date === 'string') {
            normalized.startTime = hhmmToIso(it.startTime, it.date)
          }
          if (typeof it.endTime === 'string' && /^\d{2}:\d{2}$/.test(it.endTime) && typeof it.date === 'string') {
            normalized.endTime = hhmmToIso(it.endTime, it.date)
          }
          const r = await submitDynamicIntent('timebox', 'createTimebox', normalized)
          if (r.success) succeeded.push((r.object as any)?.id ?? it.title)
          else failed.push({ title: it.title ?? '未命名', error: r.error ?? '创建失败' })
        } catch (e) {
          // [023] A2.5 review fix: 异常路径仍走 C3 succeeded/failed，不破坏「不回滚」契约
          failed.push({ title: it.title ?? '未命名', error: e instanceof Error ? e.message : '创建失败' })
        }
      }
      return {
        success: failed.length === 0,
        // [023-01+] RC-B 修复：error 字符串拼接 failed[i].error（具体原因）+ title（兜底）
        //   之前："1 条失败："（title 空 → 用户完全看不到原因）
        //   现在："1 条失败：未命名（缺少必需字段: title）"（用户能直接看到错误原因）
        error: failed.length
          ? `${failed.length} 条失败：${failed.map(f => `${f.title || '未命名'}（${f.error}）`).join('；')}`
          : undefined,
        data: { count: succeeded.length, succeeded, failed },
      }
    }

    // [023] A2.6 — adjustSchedule CNUI surface 提交：仅写 diff 项，字段走 updateTimebox 直调、
    // cancel 走 deleteTimebox（OV#8 状态守卫），非死调 submitDynamicIntent
    // （manifest 无 updateTimebox/cancelTimebox intent_trigger，路径不同）。
    if (action === 'adjustRemainingTimeboxes') {
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

    if (action === 'createSmartTimeboxes') {
      // 这里应该调用 AI scheduling handler
      // 暂时返回成功，实际实现需要调用 orchestration-handler
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

    // [026] A2.5 — 行程 3 surface submit 分支
    // 写入口：createItinerary 经 submitDynamicIntent（intention 流水线），
    //         editItinerary / deleteItinerary 经 T7 server actions（mutationService / SM）。
    // SM 自动拒终态（terminal_states: expired/cancelled/completed），handler 不预校验。

    if (action === 'createItinerary') {
      const { submitDynamicIntent } = await import('@/app/actions/intent')
      const items = (fields.items as any[]) ?? []
      const succeeded: string[] = []
      const failed: { title: string; error: string }[] = []
      for (const it of items) {
        try {
          const r = await submitDynamicIntent('timebox', 'createItinerary', {
            title: it.title, startTime: it.startTime, durationMin: it.durationMin,
            ...(it.detail ? { detail: it.detail } : {}),
            ...(it.people?.length ? { people: it.people } : {}),
          })
          if (r.success) succeeded.push((r.object as any)?.id ?? it.title)
          else failed.push({ title: it.title ?? '未命名', error: r.error ?? '创建失败' })
        } catch (e) {
          failed.push({ title: it.title ?? '未命名', error: e instanceof Error ? e.message : '创建失败' })
        }
      }
      return {
        success: failed.length === 0,
        error: failed.length
          ? `${failed.length} 条失败：${failed.map(f => `${f.title || '未命名'}（${f.error}）`).join('；')}`
          : undefined,
        data: { count: succeeded.length, succeeded, failed },
      }
    }

    if (action === 'editItinerary') {
      // surface onConfirm 透传 { ..., selected: ItineraryDraftFields & { status } }，取 selected 提交
      const sel = fields.selected as {
        id: string; title: string; startTime: string; durationMin: number
        detail?: string | null; people: string[]; status?: string
      }
      if (!sel?.id) return { success: false, error: '未选择行程' }
      const { updateItinerary } = await import('@/app/actions/timebox')
      try {
        await updateItinerary(sel.id as any, {
          title: sel.title, startTime: sel.startTime, durationMin: sel.durationMin,
          detail: sel.detail ?? null, people: sel.people,
        })
        return { success: true, data: { id: sel.id } }
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : '更新失败' }
      }
    }

    if (action === 'deleteItinerary') {
      // SM 自动拒终态（expired/cancelled/completed），由 catch 兜底（handler 不预校验）
      const ids = (fields.selectedIds as string[]) ?? []
      const { deleteItinerary } = await import('@/app/actions/timebox')
      const failed: string[] = []
      for (const id of ids) {
        try { await deleteItinerary(id as any) }
        catch (e) { failed.push(`${id}（${e instanceof Error ? e.message : '删除失败'}）`) }
      }
      return {
        success: failed.length === 0,
        error: failed.length ? `${failed.length} 条删除失败：${failed.join('；')}` : undefined,
        data: { count: ids.length - failed.length },
      }
    }

    // [023.04]：editTimeboxes — 直调 updateTimebox / deleteTimebox（不走 submitDynamicIntent）
    if (action === 'editTimeboxes') {
      const selectedId = (fields as { selectedId?: string }).selectedId
      // [023.04] T-eng-R：selectedId 缺失 → 未选择时间盒错误
      if (!selectedId) return { success: false, error: '未选择时间盒' }

      const op = (fields as { operation?: string }).operation

      if (op === 'delete') {
        const { deleteTimebox } = await import('@/app/actions/timebox')
        try {
          await deleteTimebox(selectedId)
          return { success: true, data: { id: selectedId } }
        } catch (e) {
          // OV#8 守卫透传（service reject 必须出 surface error，不静默）
          return { success: false, error: e instanceof Error ? e.message : '删除失败' }
        }
      }

      // op === 'update' 默认路径（含 op 缺失也走 update）
      const { updateTimebox } = await import('@/app/actions/timebox')
      const patch = (fields as { fields?: Record<string, unknown> }).fields ?? {}
      // [023.04] T-eng-1：Edit 路径显式调 createTimeOverlapRule evaluate（C1 双保险）
      //   当前 updateTimebox 不走 rule engine（直写字段），但 plan C1 双保险要求
      //   Edit 路径同样执行重叠检测：成功 → update；冲突 → surface 透传 message
      //   （让 EditTimeboxes surface 端 AlertDialog 二次确认 UI 接入）
      try {
        const repo = new TimeboxRepository()
        const { createTimeOverlapRule } = await import('@/nexus/core/rule-engine/rules/timebox-overlap')
        const rule = createTimeOverlapRule(repo, MVP_USER_ID as USOM_ID)
        const synthesizedIntent = {
          id: crypto.randomUUID() as USOM_ID,
          intentionId: crypto.randomUUID() as USOM_ID,
          targetDomain: 'timebox',
          action: 'update_timebox',
          fields: { ...patch },  // [023.04] I-5 polish: rule 不读 fields.id,不必把 selectedId 塞进去
          confidence: 1,
          resolvedBy: 'cnui_surface' as const,
          createdAt: new Date().toISOString() as Timestamp,
        }
        const ruleResult = await rule.evaluate(synthesizedIntent as never, {} as never)
        if (ruleResult.severity === 'confirm') {
          return { success: false, error: ruleResult.message ?? '与已有时间盒冲突' }
        }
      } catch (e) {
        // rule 引擎异常不阻断主路径：透传为 success（让 write 路径自我兜底）
        console.warn('[timeboxCnuiHandler] createTimeOverlapRule evaluate 异常，继续 update:', e)
      }

      try {
        const r = await updateTimebox(selectedId, patch)
        if (r.status === 'needs_confirm') return { success: false, error: r.message }
        return { success: true, data: { id: selectedId } }
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : '更新失败' }
      }
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
  'adjust-timeboxes': timeboxCnuiHandler,
  // [026] A2.5 — 行程 3 surface 共用 timeboxCnuiHandler（按 action 分支）
  'create-itinerary': timeboxCnuiHandler,
  'edit-itinerary': timeboxCnuiHandler,
  'delete-itinerary': timeboxCnuiHandler,
  // [023.04]：editTimeboxes 三合一（修改/取消/删除）
  'edit-timeboxes': timeboxCnuiHandler,
}
