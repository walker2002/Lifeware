/**
 * @file reconcile-appointments
 * @brief 约定 lazy reconcile server action helper（[026] D2 reversal 收口）
 *
 * 对 userId 所有非终态约定跑 reconcileAppointmentStatuses，逐条走 SM transition。
 * 供 A3.1 (/itineraries server component) + A3.2 (/timeboxes loadDay) 显式调用。
 * 零 cron、零后台 job。
 *
 * [026] codex D5 决议（先于本任务落实于 T7）: getItinerariesByRange 是纯读函数，
 *   **不**内联 reconcile。helper 抽出来是 page-level caller 显式调用的入口。
 *
 * [026] codex D6 修复（落实于本任务）: 用 `act.kind` 判别（不是 SM action 名
 *   `action`）——避免 short SM action 名误传给 submitDynamicIntent 路由错到 timebox。
 *
 * [026] T8 架构决议：helper 走 `createAppointmentMutationService().execute({state})`
 *   而**不**经 `submitDynamicIntent`。原因：
 *   - submitDynamicIntent 走 submitDynamicIntent→Orchestrator→RuleEngine，
 *     RuleEngine 对 `markInProgressAppointment`/`markExpiredAppointment`（系统 reconcile
 *     调）要求 form 字段（title/startTime/duration）必填，但系统 reconcile 行动
 *     只传 {objectId, at}——会被规则引擎以「标题/时间/时长必填」拒绝。
 *   - mutation service 的 `execute({steps:[{kind:'state',action:'markInProgress'}]})`
 *     直调 SM（createGenericStateMachine.execute），绕过 RuleEngine 字段规则，
 *     但仍经 SM transition lookup + adapter.updateStatus（→ repo.markInProgress
 *     / markExpired）——满足「写入口经 SM，禁直 repo 写」约束。
 *   - 事务边界：mutation service.execute 顶层持有 db.transaction，所有 actions
 *     在同一事务内执行，任一抛错整体回滚——更安全。
 *   - T7 server actions（`markInProgressAppointment`/`markExpiredAppointment`）仍保留
 *     作**用户主动**「立即开始/立即过期」按钮的 CNUI 调用入口（不走 helper）。
 *
 * 多租户 T-02: 透传 userId 全部调用。
 *
 * 错误隔离: 单条 transition 抛错不阻断整批（catch + errors++），确保一条脏数据
 *   不阻塞其余约定推进。
 */
import { AppointmentRepository } from '@/domains/timebox/repository/appointment'
import { reconcileAppointmentStatuses } from '@/domains/timebox/status/reconcile-appointment'
import { createAppointmentMutationService } from './timebox/mutation-service'
import type { USOM_ID } from '@/usom/types/primitives'

export async function reconcileAndAdvanceAppointments(
  userId: USOM_ID,
): Promise<{ advanced: number; errors: number }> {
  const repo = new AppointmentRepository()
  const candidates = await repo.findNeedingReconcile(userId)
  // [026] 新 Date()，不注入 now——helper 是 page-level 调，运行时真实当前时间
  const actions = reconcileAppointmentStatuses(candidates, new Date())

  const service = createAppointmentMutationService()
  let advanced = 0
  let errors = 0
  for (const act of actions) {
    try {
      // [026] codex D6 修复：用 `kind` 判别（不是 SM action 名 `action`）
      // SM action 名（manifest lifecycle.transitions[].action）='markInProgress' / 'markExpired'
      const smAction = act.kind === 'needsMarkInProgress' ? 'markInProgress' : 'markExpired'
      const res = await service.execute(
        {
          id: crypto.randomUUID() as USOM_ID,
          domainId: 'timebox',
          objectType: 'appointment',
          targetId: act.appointmentId as USOM_ID,
          steps: [{ kind: 'state', action: smAction, targetId: act.appointmentId as USOM_ID }],
        },
        userId,
      )
      if (res.success) {
        advanced++
      } else {
        errors++
      }
    } catch {
      // [026] 错误隔离：单条 transition 抛错不阻断整批
      errors++
    }
  }
  return { advanced, errors }
}
