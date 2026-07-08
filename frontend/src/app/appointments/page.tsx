/**
 * @file page
 * @brief /appointments 独立页面路由（[026] A3 / [023.05] PR2 T9 itinerary→appointment）
 *
 * 手写 Next.js page route（不走 codegen）。h-screen 锚定视口，避免内层
 * overflow-y-auto 因缺高度天花板失效（参 app/timeboxes/page.tsx 同款约束）。
 *
 * [023.12] T5: 3 态收敛后无 reconcile 写库路径——server component 仅调
 * getAppointmentsByRange 加载数据；约定显示状态 badge（in_progress / expired）
 * 由客户端读 appointments + now 派生（status/derive-display-status.ts）。
 */
import { getAppointmentsByRange } from '@/app/actions/intent'
import { AppointmentWorkspace } from '@/domains/timebox/components/appointment-workspace'

export default async function AppointmentsPage() {
  // 查询窗口：过去 90 天 + 未来 90 天（[026.02] T10：7→90 扩窗以支持 Month 视图 90 天回看，
  //   与 AppointmentWorkspace reload 窗口一致，避免 reload 后数据丢失）
  const start = new Date()
  start.setDate(start.getDate() - 90)
  const end = new Date()
  end.setDate(end.getDate() + 90)
  const items = await getAppointmentsByRange(start, end)

  return (
    <div className="h-screen flex flex-col">
      <AppointmentWorkspace initialItems={items} />
    </div>
  )
}
