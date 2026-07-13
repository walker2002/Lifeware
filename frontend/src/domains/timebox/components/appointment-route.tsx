/**
 * @file appointment-route
 * @brief 约定管理独立路由 domain 入口（async server component）
 *
 * 从 app/appointments/page.tsx 抽出：server 预取 ±90 天约定 → 传 AppointmentWorkspace。
 * 与 client wrapper pages/AppointmentPage.tsx（ActionView 嵌入用）区分：
 *   - 本组件（route）= 独立 /appointments URL 的 server 入口，RSC 预取
 *   - pages/AppointmentPage.tsx = AppShell ActionView 内嵌，client 懒加载
 * h-screen 容器由本入口拥有（D4/F2：AppointmentWorkspace root 保持 h-full 不动）。
 * [TD-039] 跨 RSC boundary 传 AppointmentSummary（startTime 为 ISO string，非 Date ——
 *   usom/types/primitives.ts:18 Timestamp=string + mapper toISOString，已 verify）。
 */
import { loadAppointmentsForPage } from '@/domains/timebox/lib/server/load-appointments'
import { AppointmentWorkspace } from '@/domains/timebox/components/appointment-workspace'

export async function AppointmentRoute() {
  const items = await loadAppointmentsForPage()
  return (
    <div className="h-screen flex flex-col">
      <AppointmentWorkspace initialItems={items} />
    </div>
  )
}
