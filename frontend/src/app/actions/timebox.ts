/**
 * @file timebox actions
 * @brief Timebox 域 server actions（[023] A2，[025] 判别联合 + NeedConfirm 范式）
 *
 * 所有写操作经 submitDynamicIntent → Orchestrator → createTimeboxMutationService，
 * 保留原子写 + cascade check。返回 TimeboxActionResult 判别联合，
 * needs_confirm 由客户端弹窗（参 CascadeConfirmDialog）二次确认后重提 confirmed=true。
 */

'use server'

import { submitDynamicIntent } from '@/app/actions/intent'
import { createTimeboxMutationService } from './timebox/mutation-service'
import { TimeboxRepository } from '@/domains/timebox/repository'
import { ActivityArchetypeRepository } from '@/lib/db/repositories/activity-archetype.repository'
import type { Timebox } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'

/** MVP 固定用户 */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

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
    const fieldSteps = Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .map(([field, value]) => ({ kind: 'field' as const, field, value }))

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
 * [023] A2 OV#8 状态守卫：cancel 仅对 planned/running 合法。对 ended/logged/cancelled
 * 调 cancelTimebox 会触发 SM 非法转换错误（崩溃），故派发前显式拒绝并给清晰提示。
 */
const CANCELABLE_STATUSES = new Set(['planned', 'running'])

export async function deleteTimebox(timeboxId: string): Promise<TimeboxActionResult> {
  const tb = await new TimeboxRepository().findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
  if (!tb) throw new Error(`Timebox ${timeboxId} not found`)
  if (!CANCELABLE_STATUSES.has(tb.status)) {
    throw new Error(`该时间盒已${tb.status === 'logged' ? '记录' : '结束'}，不可删除（仅未开始/进行中可取消）`)
  }
  return transitionTimebox(timeboxId, 'cancel', {})
}

/** 按 id 读完整 Timebox（编辑 Drawer 需要 activityArchetypeId/notes 等 summary 缺失字段） */
export async function getTimeboxById(timeboxId: string): Promise<Timebox | null> {
  return new TimeboxRepository().findById(timeboxId as USOM_ID, MVP_USER_ID as USOM_ID)
}
