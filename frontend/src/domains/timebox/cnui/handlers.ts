/**
 * @file handlers
 * @brief Timebox CNUI Surface 处理器
 * 
 * 实现 CN-UI 协议的 Surface Handler，处理时间盒相关的打开、提交事件
 */

import type { CnuiSurfaceHandler, CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'
import { TimeboxRepository, AppointmentRepository } from '@/domains/timebox/repository'
import { TaskRepository } from '@/domains/tasks/repository'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { HabitLogRepository } from '@/domains/habits/repository/habit-log'
import type { Timebox, Task, Habit } from '@/usom/types/objects'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import { hhmmToIso } from './surfaces/time-input-helpers'
// [023.08] T4 — batch undo：AI session state 记录 + revert（revertSmartTimeboxes action）
import { recordBatchProposals, revertBatchProposals, getRevertableBatches } from '@/nexus/ai-runtime/memory/batch-proposals'

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

      // [023.08] T4 — 列当前 session 5 分钟内可 revert 的 batches
      //  AI panel 据此显示「撤销刚才创建的 N 个时间盒」按钮
      const revertableBatches = await getRevertableBatches({
        sessionId: `timebox-${action}`,
        userId: MVP_USER_ID,
        windowMs: 5 * 60 * 1000,
      }).catch(() => [])

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
          revertableBatches: revertableBatches.map(b => ({
            batchId: b.batchId,
            acceptedAt: b.acceptedAt,
            count: b.proposals.length,
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
      // [023.12] T13 (AM3) — 'ended' 不再是合法 TimeboxStatus（[023.12] T6 4 态收敛后）。
      //   原 guard 防止对 'ended' 行重复 log；新 model 下 'planned' 之外的状态（logged/cancelled）
      //   都是终态，不可 log，故等价改写为「仅 planned 列入」。
      const ended = todayBoxes.filter(t => {
        if (t.status !== 'planned') return false
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
        // [023.13] Fix #2 — 传 activityArchetypeId 让 LogTimebox 拿到 archetype 详情,
        // 然后 ExecutionDetailFields 才能调 getDefaultEnergyActual 显示能量均值。
        activityArchetypeId: t.activityArchetypeId,
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

    // [026][023.05] A2.5 — 约定 3 surface open 分支（D2 reversal：列表筛 {scheduled, in_progress}）
    if (action === 'createAppointment') {
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
      const all = await new AppointmentRepository().findActive(MVP_USER_ID as USOM_ID)
      return {
        content: drafts.every(d => d.title === '') ? '请填写约定信息' : '请确认要创建的约定',
        dataSnapshot: {
          items: drafts,
          existing: all.map(i => ({ id: i.id, title: i.title, startTime: i.startTime, status: i.status })),
        },
      }
    }

    if (action === 'editAppointment') {
      // [026.01] 对齐 /editTimeboxes 范式（解析优先 + selecting 降级）
      const prompt = (intentFields?.prompt as string | undefined) ?? ''
      const { parseAppointmentIntent } = await import('@/domains/timebox/cnui/parse-appointments')

      // 候选列表：{scheduled} 非终态约定（findActive 已 filter 终态）
      const all = await new AppointmentRepository().findActive(MVP_USER_ID as USOM_ID)
      // [026.02.3] 投射必须包含 AppointmentDraftFields 全部必填字段（people/detail/activityArchetypeId）。
      // 否则 EditAppointment selecting 模式点 item → setDraft({ ...it }) 浅拷贝漏字段 →
      // AppointmentFormFields.tsx:88 draft.people.join 抛 TypeError。
      // 历史 bug：曾只投射 5 字段，导致 selecting → editing 视图崩溃。
      const todayAppointments = all.map(i => ({
        id: i.id,
        title: i.title,
        startTime: i.startTime,
        durationMin: i.durationMin,
        status: i.status,
        detail: i.detail,
        people: i.people,
        activityArchetypeId: i.activityArchetypeId,
      }))

      // 调 AI 解析
      const { createAIRuntime } = await import('@/nexus/ai-runtime')
      const aiRuntime = createAIRuntime()
      const parsed = await parseAppointmentIntent(prompt, todayAppointments, aiRuntime)

      // 置信度 < 0.5 → 强制降级 selecting（与 editTimeboxes:295-298 一致）
      const confidenceGate =
        parsed.kind === 'edit' && parsed.confidence < 0.5
          ? { kind: 'unsure' as const, reason: '未识别到具体修改意图，请补充如「改到 14:00」' }
          : parsed

      if (confidenceGate.kind === 'edit') {
        const target = all.find(a => a.id === confidenceGate.appointmentId)
        // safe-default：解析命中但不在候选列表（race / 数据漂移）→ 降级 selecting
        if (target) {
          const prefill: Record<string, unknown> = {
            id: target.id,
            title: target.title,
            startTime: target.startTime,
            durationMin: target.durationMin,
            detail: target.detail,
            people: target.people,
            status: target.status,
            ...(confidenceGate.newStartTime ? { startTime: confidenceGate.newStartTime } : {}),
            ...(confidenceGate.newDurationMin ? { durationMin: confidenceGate.newDurationMin } : {}),
            ...(confidenceGate.newTitle ? { title: confidenceGate.newTitle } : {}),
            // [026.02.4-r2] I-1: 3-state mapper (undefined=skip, null=clear, string=set)
            // prefill 仍可能 undefined（target.activityArchetypeId 是 null）；避免空字段写。
            // picker 清除的语义通过显式 null → prefill.activityArchetypeId=null 透传。
            ...(target.activityArchetypeId !== undefined && target.activityArchetypeId !== null
              ? { activityArchetypeId: target.activityArchetypeId }
              : {}),
          }
          return {
            content: `请确认修改「${target.title}」`,
            dataSnapshot: {
              mode: 'editing',
              selectedId: target.id,
              prefill,
              status: target.status,
              items: todayAppointments,
              originalPrompt: prompt,
              parseReason: confidenceGate.confidence < 1 ? `匹配到「${target.title}」（置信度 ${confidenceGate.confidence}）` : '',
              readOnly: false,
            },
          }
        }
      }

      // 解析失败 / 不确定 / 命中无 target → selecting 模式（兜底）
      return {
        content: '请选择要修改的约定',
        dataSnapshot: {
          mode: 'selecting',
          items: todayAppointments,
          originalPrompt: prompt,
          parseReason: confidenceGate.kind === 'unsure' ? confidenceGate.reason : '',
          readOnly: false,
        },
      }
    }

    if (action === 'deleteAppointment') {
      // D2 reversal：列表筛 {scheduled, in_progress}，终态自然不在列表
      const all = await new AppointmentRepository().findActive(MVP_USER_ID as USOM_ID)
      return {
        content: '请选择要删除的计划/执行中约定（可多选）',
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
            // [026.02.4-r2] I-1: 3-state mapper (undefined=skip, null=clear, string=set)
            // 原 ?(target.activityArchetypeId ? {...} : {}) 把 null 折叠成「skip」
            // — prefill 永远不显式清除；与 TD-022 #6 同源 bug pattern。
            ...(target.activityArchetypeId !== undefined && target.activityArchetypeId !== null
              ? { activityArchetypeId: target.activityArchetypeId }
              : {}),
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
      const sourceTag = (fields._source as string | undefined) ?? ''
      // C3：逐条提交不回滚，收集 succeeded/failed 明细
      const succeeded: { timeboxId: string; title: string }[] = []
      const failed: { title: string; error: string }[] = []
      for (const it of items) {
        try {
          // [023.08] T2: ISO 时间 convert — orchestration proposal 发 HH:MM + date,
          // server action 接收时显式 convert 为 ISO UTC,落库前规范化
          const normalized: Record<string, unknown> = { ...it }
          delete (normalized as Record<string, unknown>)._source
          if (typeof it.startTime === 'string' && /^\d{2}:\d{2}$/.test(it.startTime) && typeof it.date === 'string') {
            normalized.startTime = hhmmToIso(it.startTime, it.date)
          }
          if (typeof it.endTime === 'string' && /^\d{2}:\d{2}$/.test(it.endTime) && typeof it.date === 'string') {
            normalized.endTime = hhmmToIso(it.endTime, it.date)
          }
          const r = await submitDynamicIntent('timebox', 'createTimebox', normalized)
          if (r.success) {
            const id = (r.object as any)?.id ?? ''
            succeeded.push({ timeboxId: id, title: it.title ?? '未命名' })
          } else {
            failed.push({ title: it.title ?? '未命名', error: r.error ?? '创建失败' })
          }
        } catch (e) {
          // [023] A2.5 review fix: 异常路径仍走 C3 succeeded/failed，不破坏「不回滚」契约
          failed.push({ title: it.title ?? '未命名', error: e instanceof Error ? e.message : '创建失败' })
        }
      }

      // [023.08] T5：_source === 'createSmartTimebox' → 把 succeeded 转 BatchProposalItem
      //   喂给 recordBatchProposals，取代 T4 placeholder proposals:[] 占位。
      //   batch 内建议每个 succeeded.timeboxId 都不为空（防御性 fallback 到标题 hash）
      let batchId: string | undefined
      if (sourceTag === 'createSmartTimebox' && succeeded.length > 0) {
        try {
          batchId = await recordBatchProposals({
            sessionId: 'timebox-createSmartTimebox',
            userId: MVP_USER_ID,
            proposals: succeeded.map(s => ({
              id: s.timeboxId || `proposal-${s.title}`,
              timeboxId: s.timeboxId || undefined,
              title: s.title,
            })),
          })
        } catch (e) {
          // [023.08] T5：recordBatchProposals 失败仅 warn，不阻断主流程返回 success
          console.warn('[timeboxCnuiHandler] recordBatchProposals 失败（不影响主流程）:', e)
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
        data: {
          count: succeeded.length,
          succeeded: succeeded.map(s => s.timeboxId),
          failed,
          ...(batchId ? { batchId } : {}),
        },
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
      // [023.08] T5：原 T4 placeholder 移除。
      //   原占位 proposals:[] 会让 getRevertableBatches 返 batchId 但 0 count，
      //   「撤销刚才创建的 N 个时间盒」按钮永远显示 0。
      //   真实 submit 路径在 createTimebox 分支：
      //   当 fields._source === 'createSmartTimebox' 时，循环内逐条成功后调
      //   recordBatchProposals({proposals: realTimeboxIds}) 取代空占位。
      //   本分支保持存在仅为兼容旧 manifest / 直调场景 — 不会真正被 create-smart-timebox
      //   surface 触达（surface 走 createTimebox action）。
      // [023.10] T5 — Codex #5 修订：保留 guard（不是死代码），改进 message。
      //   旧 message 指错 API（"createTimebox" 单字面量），新 message 显 surface + 正确 intent，
      //   避免下一个开发者找错 API。
      return {
        success: false,
        error:
          "createSmartTimeboxes intent 已弃用。改用 surface 'CreateSmartTimebox' + intent 'acceptProposals' + payload { items, date, _source: 'createSmartTimebox' }",
      }
    }

    // [023.08] T4 — revertSmartTimeboxes action：撤销最近一次 batch 创建
    //   走 revertBatchProposals（memory_episodes 持久化记录 + deleteTimebox 逐条删除 + 状态机容错）
    if (action === 'revertSmartTimeboxes') {
      const { batchId } = (fields ?? {}) as { batchId?: string }
      if (!batchId) return { success: false, error: 'batchId 必填' }

      const { deleteTimebox } = await import('@/app/actions/timebox')
      const result = await revertBatchProposals({
        batchId,
        userId: MVP_USER_ID,
        deleteTimebox: async (id) => {
          try {
            await deleteTimebox(id)
            return { success: true }
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : '删除失败' }
          }
        },
      })
      return {
        success: result.success,
        error: result.failed.length
          ? `${result.failed.length} 个 timebox 撤销失败：${result.failed.map(f => `${f.id}（${f.error}）`).join('；')}`
          : undefined,
        data: {
          batchId,
          succeededCount: result.succeeded.length,
          failedCount: result.failed.length,
        },
      }
    }

    // [023] A2.7 — logTimebox CNUI surface 提交：逐条 log，跳过 state='skipped' 或无 state 的项
    // [023.13] T0 AM1 — 把 flat fields 重组为 ExecutionRecord 对象（与 USOM 类型对齐），
    //   executionRecord 必填字段（actualDuration/plannedDuration/deviationMinutes/sourceType/loggedAt）
    //   走零值兜底保证列永不为 null。
    // [023.13] T8 §4 — item 展开 ExecutionDetailFields 时 detailed 字段并入 executionRecord：
    //   展开 → mode='detailed' + 注入 actualStart/End/focusMinutes/energyActual；未展开 → mode='simple'。
    //   notes 统一从 it.notes 走（与 T0 行为兼容；detailed.notes 字段不重复注入）。
    if (action === 'logTimebox') {
      const { submitDynamicIntent } = await import('@/app/actions/intent')
      const items = (fields.items as any[]) ?? []
      const logged = items.filter(i => i.state && i.state !== 'skipped')
      for (const it of items) {
        if (!it.state || it.state === 'skipped') continue
        // [023.12] T7 (AM3) — 仅 planned 可打卡（避免对 logged/cancelled 行触发 SM 错误）
        // open 路径已 filter t.status === 'ended'（L165），但批量场景下 user 可能在
        // open 后修改时间窗口让某条进入终态，故加 server-side 守护。
        if (it.status && it.status !== 'planned') continue
        try {
          // [023.13] T8 — detailed 字段注入：仅当 item 展开过（it.detailed 存在且任一字段有值）
          //   时升级 mode='detailed' 并注入 actualStart/End/focusMinutes/energyActual。
          //   notes 仍走 it.notes 通道（避免 detailed.notes 与 it.notes 重复注入同一字段）。
          const detailed: { actualStartTime?: string; actualEndTime?: string; focusMinutes?: number; energyActual?: number; notes?: string } = it.detailed ?? {}
          // [023.13] Fix #3 — notes 现在由 ExecutionDetailFields 完全 owns,source of truth = detailed.notes
          //   item.notes 已删除;hasDetailed 只需看 detailed 任一字段含值即可升级 detailed
          const hasDetailed = Boolean(
            detailed.actualStartTime || detailed.actualEndTime ||
            detailed.focusMinutes != null || detailed.energyActual != null ||
            detailed.notes,
          )
          const executionRecord = {
            mode: hasDetailed ? ('detailed' as const) : ('simple' as const),
            completionStatus: it.state === 'completed' ? 'completed' : 'partial',
            // base 必填字段（T0 兜底零值；T8 详细数据仅在 hasDetailed 时并入）
            actualDuration: 0,
            plannedDuration: 0,
            deviationMinutes: 0,
            sourceType: 'timebox' as const,
            loggedAt: new Date().toISOString() as Timestamp,
            // [023.13] Fix #3 — notes 从 detailed.notes 走 (单源: ExecutionDetailFields 完全 owns)
            ...(detailed.notes ? { notes: detailed.notes } : {}),
            // [023.13] T8 — 详细字段条件性注入
            ...(detailed.actualStartTime ? { actualStartTime: detailed.actualStartTime } : {}),
            ...(detailed.actualEndTime ? { actualEndTime: detailed.actualEndTime } : {}),
            ...(detailed.focusMinutes != null ? { focusMinutes: detailed.focusMinutes } : {}),
            ...(detailed.energyActual != null ? { energyActual: detailed.energyActual } : {}),
          }
          const r = await submitDynamicIntent('timebox', 'logTimebox', {
            objectId: it.id,
            executionRecord,
          })
          if (!r.success) return { success: false, error: r.error ?? `${it.title} 打卡失败` }
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : `${it.title} 打卡失败` }
        }
      }
      return { success: true, data: { count: logged.length } }
    }

    // [026][023.05] A2.5 — 约定 3 surface submit 分支
    // 写入口：createAppointment 经 submitDynamicIntent（intention 流水线），
    //         editAppointment / deleteAppointment 经 T6 server actions（mutationService / SM）。
    // SM 自动拒终态（terminal_states: expired/cancelled/completed），handler 不预校验。

    if (action === 'createAppointment') {
      const { submitDynamicIntent } = await import('@/app/actions/intent')
      const items = (fields.items as any[]) ?? []
      const succeeded: string[] = []
      const failed: { title: string; error: string }[] = []
      for (const it of items) {
        try {
          const r = await submitDynamicIntent('timebox', 'createAppointment', {
            title: it.title, startTime: it.startTime, durationMin: it.durationMin,
            ...(it.detail ? { detail: it.detail } : {}),
            ...(it.people?.length ? { people: it.people } : {}),
            // [026.02.4] TD-022 #6: 3-state mapper (undefined=skip, null=clear, string=set)
            // createAppointment 当前未走显式 null 路径，但语义对齐 editAppointment 保持一致
            ...(it.activityArchetypeId !== undefined
              ? { activityArchetypeId: it.activityArchetypeId }
              : {}),
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

    if (action === 'editAppointment') {
      // surface onConfirm 透传 { ..., selected: AppointmentDraftFields & { status } }，取 selected 提交
      const sel = fields.selected as {
        id: string; title: string; startTime: string; durationMin: number
        detail?: string | null; people: string[]; status?: string
        // [026.02.4] TD-022 #6: 3-state — undefined=skip, null=clear, string=set
        activityArchetypeId?: string | null
      }
      if (!sel?.id) return { success: false, error: '未选择约定' }

      const op = (fields as { operation?: string }).operation

      // [026.01] 删除分支（op === 'delete'）— 走 deleteAppointment，SM 自动拒终态
      if (op === 'delete') {
        const { deleteAppointment } = await import('@/app/actions/timebox')
        try {
          await deleteAppointment(sel.id as any)
          return { success: true, data: { id: sel.id, operation: 'delete' } }
        } catch (e) {
          // Global Constraint #8：handler 不预校验，失败错误透传 throw
          return { success: false, error: e instanceof Error ? e.message : '删除失败' }
        }
      }

      // update 分支（默认）
      const { updateAppointment } = await import('@/app/actions/timebox')
      try {
        await updateAppointment(sel.id as any, {
          title: sel.title, startTime: sel.startTime, durationMin: sel.durationMin,
          detail: sel.detail ?? null, people: sel.people,
          // [026.02.4] TD-022 #6: 3-state mapper (undefined=skip, null=clear, string=set)
          // 原 ?(sel.activityArchetypeId ? {...} : {}) 用真值判断，会把 null 折叠成「skip」
          // ——picker 清除的语义永远不达 DB。改为显式 !== undefined 区分 null vs undefined。
          ...(sel.activityArchetypeId !== undefined
            ? { activityArchetypeId: sel.activityArchetypeId }
            : {}),
        })
        return { success: true, data: { id: sel.id, operation: 'update' } }
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : '更新失败' }
      }
    }

    if (action === 'deleteAppointment') {
      // SM 自动拒终态（expired/cancelled/completed），由 catch 兜底（handler 不预校验）
      const ids = (fields.selectedIds as string[]) ?? []
      const { deleteAppointment } = await import('@/app/actions/timebox')
      const failed: string[] = []
      for (const id of ids) {
        try { await deleteAppointment(id as any) }
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

      // [023.12] T7 (AM8)：op === 'revert' 分派到 revertTimebox server action
      //   （Task 4 已建，含 executionRecord 守卫 + SM action 'revert'）。
      //   适用场景：用户对已 logged/cancelled 的 timebox 走 edit 路径，期望
      //   回到 planned 状态。SM 仅允许 from=logged/cancelled → to=planned。
      if (op === 'revert') {
        const { revertTimebox } = await import('@/app/actions/timebox')
        try {
          await revertTimebox(selectedId)
          return { success: true, data: { id: selectedId } }
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : '回退失败' }
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
  // [026][023.05] A2.5 — 约定 3 surface 共用 timeboxCnuiHandler（按 action 分支）
  'create-appointment': timeboxCnuiHandler,
  'edit-appointment': timeboxCnuiHandler,
  'delete-appointment': timeboxCnuiHandler,
  // [023.04]：editTimeboxes 三合一（修改/取消/删除）
  'edit-timeboxes': timeboxCnuiHandler,
  // [023.08] T5：createSmartTimeboxes 共用 timeboxCnuiHandler（按 action 分支，createSmartTimeboxes + revertSmartTimeboxes 双 action 均已实现）
  'create-smart-timebox': timeboxCnuiHandler,
}
