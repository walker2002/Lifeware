/** @file appointments-provider @brief [028] T1 约定（appointment）上下文 provider — 作 Tier0 硬占用 */
import type { ContextProvider } from '@/usom/types/process'
// fold-in T1-fix：裸 class，非 IAppointmentRepository（不存在）
import { AppointmentRepository } from '@/domains/timebox/repository/appointment'
import type { USOM_ID } from '@/usom/types/primitives'

export class AppointmentsProvider implements ContextProvider {
  // 注：构造参类型用裸 class（T1-fix）。findByDateRange 已 inArray status=['scheduled']
  // 过滤（appointment.ts:100-109），provider 不再冗余 .filter(cancelled)。
  constructor(private readonly repo: InstanceType<typeof AppointmentRepository>) {}

  async provide(query: string, params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'appointments_for_date') return []
    const { date, userId } = params as { date: string; userId: USOM_ID }
    // 「当日」边界用 UTC（[023.09] TZ canonical）
    const dayStart = `${date}T00:00:00Z`
    const dayEnd = `${date}T23:59:59Z`
    const appts = await this.repo.findByDateRange(dayStart, dayEnd, userId)
    // Tier0 占用：startTime 原样透传（已是 ISO UTC string），durationMin 透传
    // 供 T2 buildTimeboxItems 派生 endTime = startTime + durationMin 槽位
    // （USOM Appointment 类型无 endTime 字段——[026] D2-A 仅持久化 startTime + durationMin）
    return appts.map(a => ({
      id: a.id, title: a.title,
      startTime: a.startTime, durationMin: a.durationMin, status: a.status,
    }))
  }
}