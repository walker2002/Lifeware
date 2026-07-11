/** @file appointments-provider.test @brief [028] T1 约定上下文 provider 测试 */
import { describe, it, expect, vi } from 'vitest'
import { AppointmentsProvider } from '../providers/appointments-provider'

describe('AppointmentsProvider', () => {
  it('query !== appointments_for_date 返回空数组', async () => {
    const provider = new AppointmentsProvider({} as any)
    const result = await provider.provide('other_query', { date: '2026-07-11', userId: 'u1' })
    expect(result).toEqual([])
  })

  it('返回当日约定（findByDateRange 已过滤 scheduled，作 Tier0 占用）', async () => {
    // fold-in T1-fix：findByDateRange 已 inArray status=['scheduled'] 过滤，
    // provider 不再冗余 .filter(cancelled)。返 startTime/durationMin/title。
    // [026] D2-A：USOM Appointment 无 endTime 字段（endTime = startTime + durationMin 派生）；
    // fixture 用 durationMin 镜像生产 shape，T2 buildTimeboxItems 派生 endTime 槽位。
    const repo = {
      findByDateRange: vi.fn().mockResolvedValue([
        { id: 'a1', title: '牙医', startTime: '2026-07-11T02:00:00Z', durationMin: 60, status: 'scheduled' },
      ]),
    } as any
    const provider = new AppointmentsProvider(repo)
    const result = await provider.provide('appointments_for_date', { date: '2026-07-11', userId: 'u1' })
    expect(repo.findByDateRange).toHaveBeenCalledOnce()
    const items = result as Array<Record<string, unknown>>
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'a1', title: '牙医', durationMin: 60 })
  })
})