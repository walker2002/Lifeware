/**
 * @file page
 * @brief /appointments 独立页面路由（[026] A3 / [023.05] PR2 T9 itinerary→appointment）
 *
 * 手写 Next.js page route（不走 codegen）。h-screen 锚定视口，避免内层
 * overflow-y-auto 因缺高度天花板失效（参 app/timeboxes/page.tsx 同款约束）。
 *
 * [026] D2 reversal: server component 加载时调 reconcileAndAdvanceAppointments
 *   推进非终态约定。零 cron、零后台 job —— reconcile 是 page-level caller
 *   显式触发的入口（参 actions/reconcile-appointments.ts 注释）。
 */
import { reconcileAndAdvanceAppointments } from '@/app/actions/reconcile-appointments'
import { getAppointmentsByRange } from '@/app/actions/intent'
import { AppointmentWorkspace } from '@/domains/timebox/components/appointment-workspace'

// 多租户 T-02: MVP 阶段单用户占位（与 __tests__/seed-mvp-user.test.ts 同源）
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as const

export default async function AppointmentsPage() {
  // [026] D2 reversal: lazy reconcile 在 server component 加载时触发
  await reconcileAndAdvanceAppointments(MVP_USER_ID)

  // 查询窗口：过去 7 天 + 未来 90 天（A3.1 范式，brief §Step 1 明确）
  const start = new Date()
  start.setDate(start.getDate() - 7)
  const end = new Date()
  end.setDate(end.getDate() + 90)
  const items = await getAppointmentsByRange(start, end)

  return (
    <div className="h-screen flex flex-col">
      <AppointmentWorkspace initialItems={items} />
    </div>
  )
}
