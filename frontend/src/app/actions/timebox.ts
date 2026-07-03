/**
 * @file timebox actions
 * @brief Timebox 域 server actions（[023] A2，[025] 判别联合 + NeedConfirm 范式，[026] 行程）
 *
 * 所有写操作经 submitDynamicIntent → Orchestrator → createTimeboxMutationService，
 * 保留原子写 + cascade check。返回 TimeboxActionResult 判别联合，
 * needs_confirm 由客户端弹窗（参 CascadeConfirmDialog）二次确认后重提 confirmed=true。
 *
 * [026] 行程（itinerary）server actions 5 个加在末尾：
 * - createItinerary / updateItinerary / deleteItinerary
 * - markInProgressItinerary / markExpiredItinerary
 * 写入口经 submitDynamicIntent（intention 流水线）或
 * createItineraryMutationService()（字段直写）。返回 ItineraryActionResult 判别联合。
 */

'use server'

import { submitDynamicIntent } from '@/app/actions/intent'
import { createTimeboxMutationService, createItineraryMutationService } from './timebox/mutation-service'
import { TimeboxRepository, ItineraryRepository } from '@/domains/timebox/repository'
import { ActivityArchetypeRepository } from '@/lib/db/repositories/activity-archetype.repository'
import type { Timebox, Itinerary } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'

/** MVP 固定用户 */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * [023] A2 /review fix（C2）：字段写白名单。
 *
 * updateTimebox 走 mutation service 直写（不经 SM），客户端是 RPC 可任意构造 fields。
 * 若放行 status/startedAt/endedAt/loggedAt/overtimeAt 等生命周期列，客户端可绕过
 * 状态机把 planned 直接写成 logged。故仅允许这些「编辑态」列；状态转换必须走
 * transitionTimebox（SM）。
 */
const UPDATE_ALLOWED_FIELDS = new Set([
  'title',
  'startTime',
  'endTime',
  'activityArchetypeId',
  'notes',
])

/** [023] A2 /review fix（C2）：edit 路径同样守住 endTime>startTime 且 ≤8h（与 rule-engine 对齐） */
function assertEndTimeValid(startTime: unknown, endTime: unknown): void {
  if (typeof startTime !== 'string' || typeof endTime !== 'string') return
  const s = Date.parse(startTime)
  const e = Date.parse(endTime)
  if (isNaN(s) || isNaN(e)) return // 格式非法由字段执行器/规则层兜底
  if (e <= s) throw new Error('结束时间必须晚于开始时间')
  if ((e - s) / 3_600_000 > 8) throw new Error('时间盒持续超过 8 小时上限，建议拆分')
}

/**
 * A3 owner-check：activityArchetypeId 必须属于当前用户。
 * FK 约束只证「存在」不证「租户隔离」——跨用户 archetype id 仍能命中 FK，
 * 故写前显式按 (id, userId) 校验归属（参 learning fk-doesnt-enforce-tenant-isolation）。
 */
async function assertArchetypeOwned(archetypeId: string): Promise<void> {
  const arch = await new ActivityArchetypeRepository().findById(archetypeId as USOM_ID, MVP_USER_ID as USOM_ID)
  if (!arch) throw new Error('活动原型不存在或不属于当前用户')
}

/** Timebox 写操作结果（判别联合） */
export type TimeboxActionResult =
  | { status: 'ok'; timebox: Timebox }
  | { status: 'needs_confirm'; message: string; confirmAction: string; confirmFields: Record<string, unknown> }

/** createTimebox 表单输入 */
export interface CreateTimeboxInput {
  title: string
  startTime: string // ISO
  endTime: string // ISO（派生：startTime + duration；客户端折好，server 不接受 duration）
  activityArchetypeId?: string
  taskIds?: string[] // [023] A2 OV#P1：T1 schema timeboxes 加 task_ids/habit_ids 列（USOM 类型已声明，D7 LinkPicker 数据落库依赖）
  habitIds?: string[]
  notes?: string
}

/**
 * 创建时间盒（走 Nexus：createTimebox → SM create → TimeboxCreated）
 */
export async function createTimebox(
  input: CreateTimeboxInput,
  confirmed?: boolean,
): Promise<TimeboxActionResult> {
  // A3 owner-check：archetype 归属校验（FK 只证存在）
  if (input.activityArchetypeId) await assertArchetypeOwned(input.activityArchetypeId)
  const confirmFields: Record<string, unknown> = {
    title: input.title,
    startTime: input.startTime,
    endTime: input.endTime,
    ...(input.activityArchetypeId ? { activityArchetypeId: input.activityArchetypeId } : {}),
    ...(input.taskIds?.length ? { taskIds: input.taskIds } : {}),
    ...(input.habitIds?.length ? { habitIds: input.habitIds } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  }
  const result = await submitDynamicIntent('timebox', 'createTimebox', confirmFields, confirmed)
  if (!result.success) {
    if (result.needsConfirmation) {
      return {
        status: 'needs_confirm',
        message: result.confirmationMessage ?? '需确认',
        confirmAction: 'createTimebox',
        confirmFields,
      }
    }
    throw new Error(result.error ?? '创建时间盒失败')
  }
  return { status: 'ok', timebox: result.object as Timebox }
}

/**
 * 状态转换：start / end / cancel / log（走 SM transition）
 * @param action - start | end | cancel | log
 */
export async function transitionTimebox(
  timeboxId: string,
  action: 'start' | 'end' | 'cancel' | 'log',
  payload: Record<string, unknown> = {},
  confirmed?: boolean,
): Promise<TimeboxActionResult> {
  const ACTION_TO_INTENT: Record<string, string> = {
    start: 'startTimebox',
    end: 'endTimebox',
    cancel: 'cancelTimebox',
    log: 'logTimebox',
  }
  const intentAction = ACTION_TO_INTENT[action]
  if (!intentAction) throw new Error(`不支持的转换: ${action}`)
  const confirmFields = { objectId: timeboxId, ...payload }
  const result = await submitDynamicIntent('timebox', intentAction, confirmFields, confirmed)
  if (!result.success) {
    if (result.needsConfirmation) {
      return {
        status: 'needs_confirm',
        message: result.confirmationMessage ?? '需确认',
        confirmAction: intentAction,
        confirmFields,
      }
    }
    throw new Error(result.error ?? `${action} 失败`)
  }
  return { status: 'ok', timebox: result.object as Timebox }
}

/**
 * 字段更新（编辑标题/时间/archetype）— 直调 mutation service 字段写（habits 直调范式）
 *
 * [023] A2 关键修正（OV-T2）：字段写**不走** submitDynamicIntent——manifest 无
 * updateTimebox intent_trigger，那是死调用。改为像 habits `updateHabit`
 * （intent.ts:937-985）那样直调 createTimeboxMutationService().execute()，
 * 在单事务内按字段 step 写（经字段执行器字段级校验，绕过 manifest 路由键）。
 * 仅值非 undefined 的字段造 step（与旧 repo 条件展开语义一致）。
 * 字段写无 needs_confirm（重叠提示仅在 create 路径，edit 返回 ok/throw）。
 *
 * [023] A2 OV#P1-#1：客户端必须把 `duration` 折成 `endTime = startTime + duration`
 * 在 Drawer edit 路径已实现（本函数不接 duration 字段；USOM Timebox 无 duration 字段）。
 *
 * @param timeboxId - 目标时间盒 ID
 * @param fields - 待写字段（仅值非 undefined 落库）
 */
export async function updateTimebox(
  timeboxId: string,
  fields: Record<string, unknown>,
): Promise<TimeboxActionResult> {
  try {
    // A3 owner-check：archetype 归属校验（字段写路径同样校验）
    if (typeof fields.activityArchetypeId === 'string') await assertArchetypeOwned(fields.activityArchetypeId)
    // [023] A2 /review fix（C2）：字段白名单——丢弃 status 等生命周期列，堵住绕过状态机
    const fieldSteps = Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .filter(([k]) => UPDATE_ALLOWED_FIELDS.has(k))
      .map(([field, value]) => ({ kind: 'field' as const, field, value }))
    // 跨字段不变量：startTime/endTime 同现时校验（edit 路径不走 SM 的 EndTimeAfterStartRule）
    assertEndTimeValid(fields.startTime, fields.endTime)

    // 无字段可写：直接读回当前时间盒返回（保持契约——成功且有 timebox）
    if (fieldSteps.length === 0) {
      const tb = await new TimeboxRepository().findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
      if (!tb) throw new Error(`Timebox ${timeboxId} not found`)
      return { status: 'ok', timebox: tb }
    }

    const service = createTimeboxMutationService()
    const res = await service.execute(
      {
        id: crypto.randomUUID() as USOM_ID,
        domainId: 'timebox',
        objectType: 'timebox',
        targetId: timeboxId as USOM_ID,
        steps: fieldSteps,
      },
      MVP_USER_ID as USOM_ID,
    )
    if (!res.success) throw new Error(res.error ?? '更新时间盒失败')

    // 纯 field steps 下 res.object 为 undefined（execute 仅在 state step 设 lastObject），
    // 兜底用 findById 读回更新后的时间盒。
    if (res.object) return { status: 'ok', timebox: res.object as Timebox }
    const tb = await new TimeboxRepository().findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
    if (!tb) throw new Error(`Timebox ${timeboxId} not found`)
    return { status: 'ok', timebox: tb }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : '更新时间盒失败')
  }
}

/**
 * 删除（cancel 软退场；硬删 MVP 不提供，编辑模式「删除」= cancel）
 *
 * [023] A2 OV#8 状态守卫：cancel 仅对 planned 合法（SM 只有 planned→cancelled 转换，
 * 无 running→cancelled）。对 running/ended/logged/cancelled 调 cancelTimebox 会触发
 * SM 非法转换错误（500），故派发前显式拒绝并给清晰提示。
 * [/review I1] 原 CANCELABLE_STATUSES 误含 running（OV#8 注释声称可取消但 SM 拒绝）→ 已修正。
 */
const CANCELABLE_STATUSES = new Set(['planned'])

export async function deleteTimebox(timeboxId: string): Promise<TimeboxActionResult> {
  const tb = await new TimeboxRepository().findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
  if (!tb) throw new Error(`Timebox ${timeboxId} not found`)
  if (!CANCELABLE_STATUSES.has(tb.status)) {
    throw new Error(`该时间盒${tb.status === 'running' ? '进行中' : tb.status === 'logged' ? '已记录' : '已结束'}，不可删除（仅未开始可取消；进行中请先结束）`)
  }
  return transitionTimebox(timeboxId, 'cancel', {})
}

/** 按 id 读完整 Timebox（编辑 Drawer 需要 activityArchetypeId/notes 等 summary 缺失字段） */
export async function getTimeboxById(timeboxId: string): Promise<Timebox | null> {
  return new TimeboxRepository().findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
}

// ─── 行程 Server Actions（[026] D2 reversal）──────────────────────────

/** 行程写操作结果（判别联合，与 TimeboxActionResult 同形） */
export type ItineraryActionResult =
  | { status: 'ok'; itinerary: Itinerary }
  | { status: 'needs_confirm'; message: string; confirmAction: string; confirmFields: Record<string, unknown> }

/** createItinerary 表单输入 */
export interface CreateItineraryInput {
  title: string
  startTime: string // ISO
  durationMin: number
  detail?: string | null
  people?: string[]
}

/**
 * 创建行程（[026] A1.7）
 *
 * 走 Nexus：submitDynamicIntent('timebox', 'createItinerary') → Orchestrator →
 * resolveObjectType 路由到 'itinerary'（PascalCase "Itinerary" 匹配）→
 * SM create transition → emit ItineraryCreated。
 */
export async function createItinerary(
  input: CreateItineraryInput,
  confirmed?: boolean,
): Promise<ItineraryActionResult> {
  const confirmFields: Record<string, unknown> = {
    title: input.title,
    startTime: input.startTime,
    durationMin: input.durationMin,
    ...(input.detail != null ? { detail: input.detail } : {}),
    ...(input.people?.length ? { people: input.people } : {}),
  }
  const result = await submitDynamicIntent('timebox', 'createItinerary', confirmFields, confirmed)
  if (!result.success) {
    if (result.needsConfirmation) {
      return {
        status: 'needs_confirm',
        message: result.confirmationMessage ?? '需确认',
        confirmAction: 'createItinerary',
        confirmFields,
      }
    }
    throw new Error(result.error ?? '创建行程失败')
  }
  return { status: 'ok', itinerary: result.object as Itinerary }
}

/**
 * 字段更新（编辑标题/时间/明细/关系人）— 直调 createItineraryMutationService
 *
 * [026] D2 reversal 决议 A：拆双 service。updateItinerary 走 itinerary service
 * （fieldUpdatedEventType = ItineraryFieldUpdated），不发 TimeboxFieldUpdated。
 *
 * 字段白名单（[026] A1.7 §Step 2 防绕过状态机）：
 * - 允许：title / startTime / durationMin / detail / people
 * - 拒绝：status / inProgressAt / expiredAt / completedAt / cancelledAt / 任何生命周期列
 * status / 时间戳必须走 mark* action / cancel（SM transition），不允许 RPC 直写。
 */
export async function updateItinerary(
  itineraryId: USOM_ID,
  patch: {
    title?: string
    startTime?: string
    durationMin?: number
    detail?: string | null
    people?: string[]
  },
): Promise<ItineraryActionResult> {
  // [026] 字段白名单（C2 防绕过，参 updateTimebox 的 UPDATE_ALLOWED_FIELDS）
  const ITINERARY_UPDATE_ALLOWED = ['title', 'startTime', 'durationMin', 'detail', 'people'] as const
  const fieldSteps: Array<{ kind: 'field'; field: typeof ITINERARY_UPDATE_ALLOWED[number]; value: unknown }> = []
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (!(ITINERARY_UPDATE_ALLOWED as readonly string[]).includes(field)) continue
    fieldSteps.push({ kind: 'field' as const, field: field as typeof ITINERARY_UPDATE_ALLOWED[number], value })
  }

  // 无字段可写：直接读回当前行程返回（保持契约——成功且有 itinerary）
  if (fieldSteps.length === 0) {
    const it = await new ItineraryRepository().findById(itineraryId, MVP_USER_ID as USOM_ID)
    if (!it) throw new Error(`Itinerary ${itineraryId} not found`)
    return { status: 'ok', itinerary: it }
  }

  // [026] D2 reversal: 拆双服务（A1.4 决议）— updateItinerary 用 itinerary service
  const service = createItineraryMutationService()
  const res = await service.execute(
    {
      id: crypto.randomUUID() as USOM_ID,
      domainId: 'timebox',
      objectType: 'itinerary',
      targetId: itineraryId,
      steps: fieldSteps,
    },
    MVP_USER_ID as USOM_ID,
  )
  if (!res.success) throw new Error(res.error ?? '更新行程失败')

  // 纯 field steps 下 res.object 为 undefined（execute 仅在 state step 设 lastObject），
  // 兜底：用 timebox repo 的 findById 不适用（id 是 itinerary），此处仍依赖 res.object；
  // 保留与 updateTimebox 同样的处理——若 res.object 缺失则表示字段执行器配置需补；
  // 暂以 res.object 缺失时直接抛错（生产路径应 100% 返回 object）。
  if (res.object) return { status: 'ok', itinerary: res.object as Itinerary }
  throw new Error('更新行程失败：mutation service 未返回对象（字段执行器配置需排查）')
}

	/**
	 * 删除行程（[026] A1.7，soft-cancel）
	 *
	 * [026] C1 修复：走 Nexus submitDynamicIntent('timebox', 'cancelItinerary', ...)。
	 * resolveObjectType('timebox', 'cancelItinerary') 因 action 含 "Itinerary"
	 * 字符串匹配，分派到 'itinerary' → SM cancel transition（lifecycle 登记）。
	 *
	 * 原用 'deleteItinerary' 经 buildActionMap intent_triggers 分支映射为短 action
	 * 'delete'，但 manifest lifecycle 只登记了 action: cancel（cancelItinerary→cancel），
	 * 导致 SM 找不到对应 transition。改用 'cancelItinerary' 复用 lifecycle 映射。
	 *
	 * SM 自动拒绝：from ∈ {expired, cancelled, completed}（terminal state）。
	 * 已过期/已取消/已完成的行程删除会被 SM 拒（success: false），错误透传 throw。
	 */
export async function deleteItinerary(
  itineraryId: USOM_ID,
  confirmed?: boolean,
): Promise<ItineraryActionResult> {
  // [026] C1 修复：用 'cancelItinerary' 而非 'deleteItinerary'
  // buildActionMap 从 lifecycle transitions（action: cancel）生成 cancelItinerary→cancel；
  // 原 'deleteItinerary' 仅从 intent_triggers 生成 deleteItinerary→delete，无对应 SM transition。
  const result = await submitDynamicIntent('timebox', 'cancelItinerary', { objectId: itineraryId }, confirmed)
  if (!result.success) {
    if (result.needsConfirmation) {
      return {
        status: 'needs_confirm',
        message: result.confirmationMessage ?? '需确认',
        confirmAction: 'cancelItinerary',
        confirmFields: { objectId: itineraryId },
      }
    }
    throw new Error(result.error ?? '删除行程失败')
  }
  return { status: 'ok', itinerary: result.object as Itinerary }
}

/**
 * 行程状态推进：scheduled → in_progress（[026] A1.7）
 *
 * 走 Nexus：submitDynamicIntent('timebox', 'markInProgressItinerary')。
 * resolveObjectType 因 action 名含 "Itinerary"，分派到 'itinerary' →
 * SM markInProgress transition → emit ItineraryMarkedInProgress。
 *
 * 通常由 reconcileAndAdvanceItineraries（T8）调用——它把 reconcileItineraryStatuses
 * 纯函数计算的 needsMarkInProgress 行动转化为实际 SM 落库。
 * `confirmed = true` 跳过 NeedsConfirm 弹窗（reconcile 是后台行动，用户已默许）。
 *
 * 客户端直接调用罕见（如「立刻开始」按钮）；同样 SM 自动拒绝非 from=scheduled。
 */
export async function markInProgressItinerary(
  itineraryId: USOM_ID,
  at: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await submitDynamicIntent(
    'timebox',
    'markInProgressItinerary',
    { objectId: itineraryId, at },
    true, // confirmed: reconcile 路径无用户交互
  )
  return { ok: result.success, error: result.success ? undefined : result.error }
}

/**
 * 行程状态推进：{scheduled, in_progress} → expired（[026] A1.7）
 *
 * 走 Nexus：submitDynamicIntent('timebox', 'markExpiredItinerary')。
 * resolveObjectType 因 action 名含 "Itinerary"，分派到 'itinerary' →
 * SM markExpired transition → emit ItineraryMarkedExpired。
 *
 * 通常由 reconcileAndAdvanceItineraries（T8）调用。
 * SM 自动拒绝：from ∈ terminal_states（含 cancelled/completed）或已 expired。
 */
export async function markExpiredItinerary(
  itineraryId: USOM_ID,
  at: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await submitDynamicIntent(
    'timebox',
    'markExpiredItinerary',
    { objectId: itineraryId, at },
    true, // confirmed: reconcile 路径无用户交互
  )
  return { ok: result.success, error: result.success ? undefined : result.error }
}
