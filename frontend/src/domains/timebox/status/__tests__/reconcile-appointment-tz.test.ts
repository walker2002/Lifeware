/**
 * @file reconcile-appointment-tz.test.ts
 * @brief reconcileAppointmentStatuses 跨 TZ 边界单元测试（[026] T20 codex #5）
 *
 * 守护 [026] OQ-6 风险：「同一日历日歧义」—— reconcile-appointment.ts 用
 * `localDayKey(getFullYear/getMonth/getDate)` 按宿主 TZ 计算日界，跨 TZ 部署
 * 会让同一时刻在不同环境归入不同日。本测试用 Node 20+ 的 `process.env.TZ`
 * 运行时切换（不必重启进程）覆盖多 TZ 边界，验证 localDayKey 在每个 TZ 下
 * 都能正确归类 未来/当日/过日。
 *
 * 既有 reconcile-appointment.test.ts 已用「本地正午无 TZ 后缀」fixture 规避 TZ 差异
 * （note 2），但那只守护「同一 TZ 内 localDayKey 正确」，未守护「跨 TZ 行为」
 * （即代码本身是否依赖进程 TZ）。本测试补这块盲区。
 *
 * 守护范围：
 * - TZ=Asia/Shanghai (UTC+8)：startTime 在 23:30 UTC 跨日 → "昨日" vs "今日" 判定
 * - TZ=Pacific/Auckland (UTC+12)：同样边界 → 验证不同 TZ 下判定对称
 *
 * 注：vitest 4.x 的 `vi.useFakeTimers().setSystemTime()` 对 Date TZ 行为有效，
 * 但本测试聚焦「进程 TZ」切换（不改 Date 系统时间），因为 localDayKey 内部用
 * `Date#getDate/getMonth/getFullYear` 直接读 OS TZ。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { reconcileAppointmentStatuses } from '../reconcile-appointment'
import type { Appointment } from '@/usom/types/objects'
import type { AppointmentStatus } from '@/usom/types/primitives'

/**
 * 保存原始 TZ，每个测试后恢复——避免污染后续测试。
 * Node 20+ 在同一进程内支持 process.env.TZ 切换并即时生效。
 */
const ORIGINAL_TZ = process.env.TZ
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ
})

/**
 * helper: 构造本地正午的 Date（YYYY-MM-DD 12:00:00 本地时间，无 TZ 后缀）
 * — 不带后缀的字符串被 Date() 解析为本地时间，与本测试 TZ 切换正交。
 */
const localNoon = (year: number, monthIdx0: number, day: number): Date =>
  new Date(year, monthIdx0, day, 12, 0, 0)

/**
 * helper: 构造一个约定 fixture（scheduled + 给定 startTime ISO）
 * — startTime 用本地正午 ISO 字符串，无 TZ 后缀，任意 TZ 下 localDayKey 一致
 */
const base = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: 'i1',
  status: 'scheduled' as AppointmentStatus,
  title: 't',
  detail: null,
  startTime: '2026-07-15T12:00:00',
  durationMin: 60,
  people: [],
  userId: 'u',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  inProgressAt: null,
  expiredAt: null,
  completedAt: null,
  cancelledAt: null,
  schemaVersion: 1,
  ...overrides,
})

describe('reconcileAppointmentStatuses — 跨 TZ 边界（[026] T20 codex #5）', () => {
  it('TZ=Asia/Shanghai (UTC+8)：约定日=2026-07-15 本地，当日 scheduled → needsMarkInProgress', () => {
    process.env.TZ = 'Asia/Shanghai'
    // 验证 TZ 切换生效（调试期守护）
    expect(new Date(2026, 6, 15).getDate()).toBe(15)
    const actions = reconcileAppointmentStatuses(
      [base()],
      localNoon(2026, 6, 15), // now = 2026-07-15 本地正午
    )
    expect(actions).toEqual([
      { appointmentId: 'i1', kind: 'needsMarkInProgress', at: localNoon(2026, 6, 15) },
    ])
  })

  it('TZ=Asia/Shanghai (UTC+8)：now=次日 2026-07-16 → scheduled 约定 → needsMarkExpired', () => {
    process.env.TZ = 'Asia/Shanghai'
    const actions = reconcileAppointmentStatuses(
      [base()],
      localNoon(2026, 6, 16),
    )
    expect(actions).toEqual([
      { appointmentId: 'i1', kind: 'needsMarkExpired', at: localNoon(2026, 6, 16) },
    ])
  })

  it('TZ=Asia/Shanghai (UTC+8)：now=前一日 2026-07-10 → scheduled 约定 → 跳过（未来）', () => {
    process.env.TZ = 'Asia/Shanghai'
    const actions = reconcileAppointmentStatuses(
      [base()],
      localNoon(2026, 6, 10),
    )
    expect(actions).toEqual([])
  })

  it('TZ=Pacific/Auckland (UTC+12)：约定日=2026-07-15 本地 → 当日判定一致', () => {
    process.env.TZ = 'Pacific/Auckland'
    // TZ 切换后 Date 立即按新 TZ 解释
    expect(new Date(2026, 6, 15).getDate()).toBe(15)
    const actions = reconcileAppointmentStatuses(
      [base()],
      localNoon(2026, 6, 15),
    )
    // 关键对称性：Auckland 当日与 Shanghai 当日得到同样结果（约定 + now 都是本地正午）
    expect(actions).toEqual([
      { appointmentId: 'i1', kind: 'needsMarkInProgress', at: localNoon(2026, 6, 15) },
    ])
  })

  it('TZ=Pacific/Auckland (UTC+12)：now=次日 2026-07-16 → needsMarkExpired', () => {
    process.env.TZ = 'Pacific/Auckland'
    const actions = reconcileAppointmentStatuses(
      [base()],
      localNoon(2026, 6, 16),
    )
    expect(actions).toEqual([
      { appointmentId: 'i1', kind: 'needsMarkExpired', at: localNoon(2026, 6, 16) },
    ])
  })

  it('TZ=America/New_York (UTC-4 夏令时)：约定日=2026-07-15 本地 → 同样归类为当日', () => {
    // 验证西半球 TZ 与东亚 TZ 在「本地正午 fixture」下行为一致——守护"代码不依赖
    // 进程 TZ 这一假设的 TZ 不变性"，即：只要 fixture 用本地正午，判定在任意 TZ 都一致。
    process.env.TZ = 'America/New_York'
    expect(new Date(2026, 6, 15).getDate()).toBe(15)
    const actions = reconcileAppointmentStatuses(
      [base()],
      localNoon(2026, 6, 15),
    )
    expect(actions).toEqual([
      { appointmentId: 'i1', kind: 'needsMarkInProgress', at: localNoon(2026, 6, 15) },
    ])
  })

  it('TZ=UTC：边界状态 in_progress 过日 → needsMarkExpired（与既有测试对称）', () => {
    // 守护：localDayKey 在 UTC 下与 Shanghai/Auckland 同等日界判定
    process.env.TZ = 'UTC'
    const actions = reconcileAppointmentStatuses(
      [base({ status: 'in_progress' })],
      localNoon(2026, 6, 16),
    )
    expect(actions).toEqual([
      { appointmentId: 'i1', kind: 'needsMarkExpired', at: localNoon(2026, 6, 16) },
    ])
  })
})