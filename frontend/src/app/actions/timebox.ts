/**
 * @file timebox actions
 * @brief Timebox 域 server actions（[023] A2，[025] 判别联合 + NeedConfirm 范式，[026] 约定）
 *
 * 所有写操作经 submitDynamicIntent → Orchestrator → createTimeboxMutationService，
 * 保留原子写 + cascade check。返回 TimeboxActionResult 判别联合，
 * needs_confirm 由客户端弹窗（参 CascadeConfirmDialog）二次确认后重提 confirmed=true。
 *
 * [023.12] T5: 约定（appointment）server actions：
 * - createAppointment / updateAppointment / deleteAppointment
 * - completeAppointment / revertAppointment（取代原 markInProgress / markExpired）
 * 写入口经 submitDynamicIntent（intention 流水线）或
 * createAppointmentMutationService()（字段直写）。返回 AppointmentActionResult 判别联合。
 * in_progress / expired 状态不再持久化——读时由 status/derive-display-status.ts 派生。
 */

'use server'

import { submitDynamicIntent } from '@/app/actions/intent'
import { createTimeboxMutationService, createAppointmentMutationService } from './timebox/mutation-service'
import { TimeboxRepository, AppointmentRepository } from '@/domains/timebox/repository'
import { ActivityArchetypeRepository } from '@/lib/db/repositories/activity-archetype.repository'
// [TD-003] T4-fix：保留 ConflictError 实例 + name 透传给 T5 drawer matcher
import { ConflictError } from '@/domains/timebox/errors/occ-conflict-error'
import type { Timebox, Appointment } from '@/usom/types/objects'
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

/**
 * [026.01] appointment 更新字段白名单（仿 timebox UPDATE_ALLOWED_FIELDS）。
 *
 * 字段白名单防绕过状态机——拒绝 status / completedAt / cancelledAt / inProgressAt /
 * expiredAt 等生命周期列，状态转换必须走 cancelAppointment / completeAppointment（SM）。
 * 允许：title / startTime / durationMin / detail / people / activityArchetypeId
 */
const APPOINTMENT_UPDATE_ALLOWED_FIELDS = new Set([
  'title',
  'startTime',
  'durationMin',
  'detail',
  'people',
  'activityArchetypeId', // [026.01]
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
  // [026.02.4-r2] I-1: widen to string | null — 3-state semantics 对齐 edit path
  //   undefined=skip(保留), null=clear(显式清除), string=set
  activityArchetypeId?: string | null
  // [029] 显式 logical_day 归属（粘性，优先于 date(startTime,tz) 默认）
  logicalDayLabel?: string // YYYY-MM-DD
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
  // A3 owner-check：archetype 归属校验（FK 只证存在）— 仅 string 时校验
  if (typeof input.activityArchetypeId === 'string') await assertArchetypeOwned(input.activityArchetypeId)
  const confirmFields: Record<string, unknown> = {
    title: input.title,
    startTime: input.startTime,
    endTime: input.endTime,
    // [029] 显式 logical_day 归属（在场时短路 tz 读，D2 注入点用）
    ...(input.logicalDayLabel ? { logicalDayLabel: input.logicalDayLabel } : {}),
    // [026.02.4-r2] I-1: 3-state mapper (undefined=skip, null=clear, string=set)
    // 原 ?(input.activityArchetypeId ? {...} : {}) 用真值判断，会把 null 折叠成「skip」
    // ——picker 清除的语义永远不达 DB。改为显式 !== undefined 区分 null vs undefined。
    ...(input.activityArchetypeId !== undefined
      ? { activityArchetypeId: input.activityArchetypeId }
      : {}),
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
  // [TD-017] 2026-07-12: 收窄为 'cancel' | 'log'。'start'/'end' 已从 manifest lifecycle
  //   删除 (commit 2ddd223 codex review 删 startTimebox/endTimebox intent_trigger),
  //   start/end 在 server action 层是 dead code — dispatch 到 manifest 会静默失败。
  //   'overtime' 不在此 union: use-auto-trigger.ts 内部用 onTransition(签名自定义),不走 transitionTimebox。
  action: 'cancel' | 'log',
  payload: Record<string, unknown> = {},
  confirmed?: boolean,
): Promise<TimeboxActionResult> {
  const ACTION_TO_INTENT: Record<string, string> = {
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
 * 回退：{logged, cancelled} → planned（[023.12] T4，[023.13] T5 P3 确认清空分支）
 *
 * 走 Nexus：submitDynamicIntent('timebox', 'revertTimebox', { id }) →
 * Orchestrator → resolveObjectType('timebox', 'revertTimebox') → 'timebox' →
 * SM revert transition → 状态='planned'。
 * buildActionMap 把 `revertTimebox` 拆成 SM action `revert`（与 manifest
 * lifecycle.transitions.action 一致）。
 *
 * [AM7] executionRecord 守卫：logged 状态下 executionRecord 必有值（archive
 * 路径写入），直接 revert 会让已记录的执行结果「悬空」。守卫语义：若
 * executionRecord != null 且调用方未显式确认清空，抛错「请先清理执行记录
 * 再回退」——强制调用方先显式清记录。cancelled 状态 executionRecord 恒为
 * null，可直接 revert。
 *
 * [023.13] P3 确认清空分支：UI 弹窗（logged 卡点回退 → AlertDialog「将清除
 * 执行记录，实际时长/专注/能量/详情不可恢复」）确认后传
 * `opts.clearExecutionRecord=true`：
 * - 复用通用 repo.updateFields(id, { executionRecord: null }, userId)（[AM3]
 *   精化：与持久化修复 [AM1] 同通道，单条 UPDATE + T-02 userId 过滤，
 *   不引入 clearExecutionRecord repo 抽象 → DRY）。
 * - 清空后才走 SM revert（同事务外顺序调用，updateFields 已落库）。
 *
 * 设计决策（[023.12] plan-eng-review 用户表决 B，[023.13] 保留 + 增显式入口）：
 * - 默认路径（opts 未传 / false）抛 AM7——「回退悄悄丢数据」仍禁止
 * - 显式 opts.clearExecutionRecord=true 才允许清记录——明示丢
 *
 * @param timeboxId - 目标时间盒 ID
 * @param opts.clearExecutionRecord - logged + executionRecord 时是否先清空记录
 */
export async function revertTimebox(
  timeboxId: string,
  opts?: { clearExecutionRecord?: boolean },
): Promise<TimeboxActionResult> {
  // [AM7] ownership + executionRecord 守卫
  const repo = new TimeboxRepository()
  const tb = await repo.findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
  if (!tb) throw new Error(`Timebox ${timeboxId} not found`)
  // [023.13] P3：确认清空分支——UI 弹窗确认后传 clearExecutionRecord=true
  if (opts?.clearExecutionRecord) {
    // AM3 复用 updateFields：单条 UPDATE，T-02 userId 过滤，与持久化修复同通道
    // [TD-003] T2 OCC 必填：clearExecutionRecord 走 updateFields 原子 UPDATE WHERE
    // occ_version = tb.occVersion；0 rows → 抛 ConflictError（drawer toast + reload）。
    // **stale-read limitation（second-opinion review Important #1）**：此处 `tb.occVersion`
    // 是函数入口 read 的，与下面 submitDynamicIntent('revertTimebox') 之间存在小窗口
    // （同 process 串行同步代码，μs 级），如果用户其他 tab 在该窗口改 row，第二个 SM
    // revert 会抛 ConflictError——已通过 outer catch 兜底转通用「保存失败」toast。
    // Future fix: 把 read+clearExecutionRecord+revert 包到单 transaction + 单一 OCC 校验。
    await repo.updateFields(
      timeboxId as USOM_ID,
      { executionRecord: null },
      MVP_USER_ID as USOM_ID,
      tb.occVersion ?? 0,
    )
  } else if (tb.executionRecord != null) {
    // [AM7] 守卫保留（默认路径不变）
    throw new Error('请先清理执行记录再回退')
  }
  // 走 SM revert transition；cancelled→planned / logged(已守卫或已清空)→planned
  const result = await submitDynamicIntent('timebox', 'revertTimebox', { objectId: timeboxId })
  if (!result.success) {
    // SM 兜底：极端 case（数据库与 SM 不一致）下抛错
    throw new Error(result.error ?? '回退时间盒失败')
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
 * [TD-003] T4 OCC 透传：本函数入口先读 current `occVersion`，attach 到每个
 * field step 的 `expectedOccVersion` 字段。`field-executor.executeBatch`
 * （参 @/nexus/field-executor/index.ts）会读取 step.expectedOccVersion 优先
 * 透传给 `repo.updateFields(... expectedOccVersion ...)`，WHERE 谓词失败
 * 时抛 ConflictError（详见 @/domains/timebox/errors/occ-conflict-error.ts）。
 *
 * 透传场景：
 *  - drawer 持有的 current occVersion（避免 field-executor 内部 findById 读 current
 *    引入 read-then-write race window）；
 *  - 3-tab 并发：3 个 update 起点都从同一 occVersion 读，OCC 谓词保证仅 1 win。
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

    // [TD-003] T4 OCC 透传：先读 current occVersion（drawer 持有的版本号）。
    // Repository.findById 返回完整 row（含 occVersion 列，T1 schema 加列）。
    // 跨 tab 并发场景：3 个 updateTimebox 入口可能同时 read 到同一 occVersion=1，
    // 后续 mutation service.execute 在事务内调 repo.updateFields(..., 1, ...) →
    // WHERE occ_version=1 仅 1 row 命中 → 后续 2 个 0 rows → 抛 ConflictError。
    const tbRepo = new TimeboxRepository()
    const currentTb = await tbRepo.findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
    if (!currentTb) throw new Error(`Timebox ${timeboxId} not found`)
    // USOM Timebox.type.occVersion（T2 起加入字段定义）。未声明时（防御性）回退 0
    // ——timebox 仓储的 WHERE occ_version=0 必 0 rows，生产环境不会发生。
    const currentOccVersion = (currentTb as { occVersion?: number }).occVersion ?? 0
    // 把 expectedOccVersion attach 到每个 field step（field-executor.executeBatch
    // 内部优先读 step.expectedOccVersion，再 fallback 到 repo.findById）。
    const fieldStepsWithOcc = fieldSteps.map(step => ({
      ...step,
      expectedOccVersion: currentOccVersion,
    }))

    const service = createTimeboxMutationService()
    const res = await service.execute(
      {
        id: crypto.randomUUID() as USOM_ID,
        domainId: 'timebox',
        objectType: 'timebox',
        targetId: timeboxId as USOM_ID,
        steps: fieldStepsWithOcc,
      },
      MVP_USER_ID as USOM_ID,
    )
    if (!res.success) throw new Error(res.error ?? '更新时间盒失败')

    // 纯 field steps 下 res.object 为 undefined（execute 仅在 state step 设 lastObject），
    // 兜底用 findById 读回更新后的时间盒。
    if (res.object) return { status: 'ok', timebox: res.object as Timebox }
    const tb = await tbRepo.findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
    if (!tb) throw new Error(`Timebox ${timeboxId} not found`)
    return { status: 'ok', timebox: tb }
  } catch (err) {
    // [TD-003] T4-fix：ConflictError 必须原样抛——T5 UI drawer matcher
    //   `err.name === 'ConflictError'` 才能命中，触发 reload + toast。
    //   若用 generic `new Error(err.message)` 会丢 name + currentOccVersion。
    if (err instanceof ConflictError) throw err
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
    // [026.02.4] TD-028: 'running' 不持久化（[023.12] 读时派生），无 status='running' 行。
    // 删除 'running' 分支——CANCELABLE_STATUSES 仅允许 planned，其余 status 均为「已结束」。
    throw new Error(`该时间盒${tb.status === 'logged' ? '已记录' : '已结束'}，不可删除（仅未开始可取消）`)
  }
  return transitionTimebox(timeboxId, 'cancel', {})
}

/** 按 id 读完整 Timebox（编辑 Drawer 需要 activityArchetypeId/notes 等 summary 缺失字段） */
export async function getTimeboxById(timeboxId: string): Promise<Timebox | null> {
  return new TimeboxRepository().findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
}

// ─── 约定 Server Actions（[026] D2 reversal）──────────────────────────

/** 约定写操作结果（判别联合，与 TimeboxActionResult 同形） */
export type AppointmentActionResult =
  | { status: 'ok'; appointment: Appointment }
  | { status: 'needs_confirm'; message: string; confirmAction: string; confirmFields: Record<string, unknown> }

/** createAppointment 表单输入 */
export interface CreateAppointmentInput {
  title: string
  startTime: string // ISO
  durationMin: number
  detail?: string | null
  people?: string[]
}

/**
 * 创建约定（[026] A1.7）
 *
 * 走 Nexus：submitDynamicIntent('timebox', 'createAppointment') → Orchestrator →
 * resolveObjectType 路由到 'appointment'（PascalCase "Appointment" 匹配）→
 * SM create transition → emit AppointmentCreated。
 */
export async function createAppointment(
  // [026.02.4-r2] I-1: widen activityArchetypeId to string | null (3-state semantics)
  input: CreateAppointmentInput & { activityArchetypeId?: string | null },
  confirmed?: boolean,
): Promise<AppointmentActionResult> {
  // [026.01] archetype owner-check（FK 不验租户隔离，防跨用户 archetype 落库）— 仅 string 时校验
  if (typeof input.activityArchetypeId === 'string') await assertArchetypeOwned(input.activityArchetypeId)
  const confirmFields: Record<string, unknown> = {
    title: input.title,
    startTime: input.startTime,
    durationMin: input.durationMin,
    ...(input.detail != null ? { detail: input.detail } : {}),
    ...(input.people?.length ? { people: input.people } : {}),
    // [026.02.4-r2] I-1: 3-state mapper (undefined=skip, null=clear, string=set)
    // 原 ?(input.activityArchetypeId ? {...} : {}) 用真值判断，把 null 折叠成「skip」
    // ——picker 清除的语义永远不达 DB。改为 !== undefined 区分 null vs undefined。
    ...(input.activityArchetypeId !== undefined
      ? { activityArchetypeId: input.activityArchetypeId }
      : {}), // [026.01]
  }
  const result = await submitDynamicIntent('timebox', 'createAppointment', confirmFields, confirmed)
  if (!result.success) {
    if (result.needsConfirmation) {
      return {
        status: 'needs_confirm',
        message: result.confirmationMessage ?? '需确认',
        confirmAction: 'createAppointment',
        confirmFields,
      }
    }
    throw new Error(result.error ?? '创建约定失败')
  }
  return { status: 'ok', appointment: result.object as Appointment }
}

/**
 * 字段更新（编辑标题/时间/明细/关系人）— 直调 createAppointmentMutationService
 *
 * [026] D2 reversal 决议 A：拆双 service。updateAppointment 走 appointment service
 * （fieldUpdatedEventType = AppointmentFieldUpdated），不发 TimeboxFieldUpdated。
 *
 * 字段白名单（[026] A1.7 §Step 2 防绕过状态机）：
 * - 允许：title / startTime / durationMin / detail / people
 * - 拒绝：status / inProgressAt / expiredAt / completedAt / cancelledAt / 任何生命周期列
 * status / 时间戳必须走 mark* action / cancel（SM transition），不允许 RPC 直写。
 */
export async function updateAppointment(
  appointmentId: USOM_ID,
  patch: {
    title?: string
    startTime?: string
    durationMin?: number
    detail?: string | null
    people?: string[]
    // [026.02.4] TD-022 #6: 3-state (undefined=skip, null=clear, string=set)
    activityArchetypeId?: string | null
  },
): Promise<AppointmentActionResult> {
  try {
    // [026.01] archetype owner-check（FK 不验租户隔离）— 仅当要设置 string 值时校验
    if (typeof patch.activityArchetypeId === 'string') await assertArchetypeOwned(patch.activityArchetypeId)
    // [026.02.4] TD-022 #6: 字段迭代 3-state 语义
    //   undefined → 跳过（不改字段）
    //   null      → 透传 → Drizzle 写 SQL NULL（显式清除）
    //   string    → 透传 → Drizzle 设置值
    const fieldSteps: Array<{ kind: 'field'; field: string; value: unknown }> = []
    for (const [field, value] of Object.entries(patch)) {
      if (value === undefined) continue
      if (!APPOINTMENT_UPDATE_ALLOWED_FIELDS.has(field)) continue
      fieldSteps.push({ kind: 'field' as const, field, value })
    }

    // 无字段可写：直接读回当前约定返回（保持契约——成功且有 appointment）
    if (fieldSteps.length === 0) {
      const it = await new AppointmentRepository().findById(appointmentId, MVP_USER_ID as USOM_ID)
      if (!it) throw new Error(`Appointment ${appointmentId} not found`)
      return { status: 'ok', appointment: it }
    }

    // [026] D2 reversal: 拆双服务（A1.4 决议）— updateAppointment 用 appointment service
    const service = createAppointmentMutationService()
    const res = await service.execute(
      {
        id: crypto.randomUUID() as USOM_ID,
        domainId: 'timebox',
        objectType: 'appointment',
        targetId: appointmentId,
        steps: fieldSteps,
      },
      MVP_USER_ID as USOM_ID,
    )
    if (!res.success) throw new Error(res.error ?? '更新约定失败')

    // 纯 field steps 下 res.object 为 undefined（execute 仅在 state step 设 lastObject），
    // 兜底：用 findById 读回更新后的约定。
    if (res.object) return { status: 'ok', appointment: res.object as Appointment }
    const appt = await new AppointmentRepository().findById(appointmentId, MVP_USER_ID as USOM_ID)
    if (!appt) throw new Error(`Appointment ${appointmentId} not found`)
    return { status: 'ok', appointment: appt }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : '更新约定失败')
  }
}

	/**
	 * 删除约定（[026] A1.7，soft-cancel）
	 *
	 * [026] C1 修复：走 Nexus submitDynamicIntent('timebox', 'cancelAppointment', ...)。
	 * resolveObjectType('timebox', 'cancelAppointment') 因 action 含 "Appointment"
	 * 字符串匹配，分派到 'appointment' → SM cancel transition（lifecycle 登记）。
	 *
	 * 原用 'deleteAppointment' 经 buildActionMap intent_triggers 分支映射为短 action
	 * 'delete'，但 manifest lifecycle 只登记了 action: cancel（cancelAppointment→cancel），
	 * 导致 SM 找不到对应 transition。改用 'cancelAppointment' 复用 lifecycle 映射。
	 *
	 * SM 自动拒绝：from ∈ {expired, cancelled, completed}（terminal state）。
	 * 已过期/已取消/已完成的约定删除会被 SM 拒（success: false），错误透传 throw。
	 */
export async function deleteAppointment(
  appointmentId: USOM_ID,
  confirmed?: boolean,
): Promise<AppointmentActionResult> {
  // [026] C1 修复：用 'cancelAppointment' 而非 'deleteAppointment'
  // buildActionMap 从 lifecycle transitions（action: cancel）生成 cancelAppointment→cancel；
  // 原 'deleteAppointment' 仅从 intent_triggers 生成 deleteAppointment→delete，无对应 SM transition。
  const result = await submitDynamicIntent('timebox', 'cancelAppointment', { objectId: appointmentId }, confirmed)
  if (!result.success) {
    if (result.needsConfirmation) {
      return {
        status: 'needs_confirm',
        message: result.confirmationMessage ?? '需确认',
        confirmAction: 'cancelAppointment',
        confirmFields: { objectId: appointmentId },
      }
    }
    throw new Error(result.error ?? '删除约定失败')
  }
  return { status: 'ok', appointment: result.object as Appointment }
}

/**
 * 约定状态推进：scheduled → completed（[023.12] T5）
 *
 * 走 Nexus：submitDynamicIntent('timebox', 'completeAppointment') →
 * resolveObjectType 因 action 名含 "Appointment"，分派到 'appointment' →
 * SM complete transition → emit AppointmentCompleted。
 *
 * SM 守门：仅 from=scheduled 合法；cancelled/completed 直接 SM 拒绝。
 *
 * [OQ-1] 任务/习惯关联守卫：当前无 junction 表达 appointment ↔ task/habit 关系，
 * 按钮无条件放行。T10 UI 实现 // TODO [027]: appointment task/habit guard。
 */
export async function completeAppointment(
  appointmentId: USOM_ID,
): Promise<AppointmentActionResult> {
  const result = await submitDynamicIntent(
    'timebox',
    'completeAppointment',
    { objectId: appointmentId },
  )
  if (!result.success) {
    if (result.needsConfirmation) {
      return {
        status: 'needs_confirm',
        message: result.confirmationMessage ?? '需确认',
        confirmAction: 'completeAppointment',
        confirmFields: { objectId: appointmentId },
      }
    }
    throw new Error(result.error ?? '完成约定失败')
  }
  return { status: 'ok', appointment: result.object as Appointment }
}

/**
 * 约定状态回退：{cancelled, completed} → scheduled（[023.12] T5）
 *
 * 走 Nexus：submitDynamicIntent('timebox', 'revertAppointment') →
 * resolveObjectType 因 action 名含 "Appointment"，分派到 'appointment' →
 * SM revert transition → emit AppointmentReverted。
 *
 * SM 守门：仅 from ∈ {cancelled, completed} 合法；scheduled 直接 SM 拒绝（同态）。
 *
 * 与 timebox.revertTimebox 对称的设计：调用方需确认「cancelled / completed 数据
 * 痕迹要清空」语义（仓库 revert 方法清掉 cancelledAt / completedAt）。UI 弹窗提示
 * 用户「回退将清除完成/取消时间戳，是否继续」——T10 实现。
 */
export async function revertAppointment(
  appointmentId: USOM_ID,
): Promise<AppointmentActionResult> {
  const result = await submitDynamicIntent(
    'timebox',
    'revertAppointment',
    { objectId: appointmentId },
  )
  if (!result.success) {
    if (result.needsConfirmation) {
      return {
        status: 'needs_confirm',
        message: result.confirmationMessage ?? '需确认',
        confirmAction: 'revertAppointment',
        confirmFields: { objectId: appointmentId },
      }
    }
    throw new Error(result.error ?? '回退约定失败')
  }
  return { status: 'ok', appointment: result.object as Appointment }
}
