/**
 * @file derive-display-status.test.ts
 * @brief [023.12] + [TZ-2.2] deriveTimebox/AppointmentDisplayStatus 单元测试
 *
 * [TZ-2.2] deriveAppointmentDisplayStatus 加 tz: string 必传参数。
 *   测试覆盖：
 *   - 4 基础 cases（future/today/yesterday/cancelled）加 'Asia/Shanghai' tz
 *   - 3 跨 TZ cases（Tokyo/NY 跨日界判定）验证不依赖 OS TZ
 */

import { describe, it, expect } from 'vitest';
import { deriveTimeboxDisplayStatus, deriveAppointmentDisplayStatus } from '../derive-display-status';

describe('deriveTimeboxDisplayStatus', () => {
  const start = '2026-07-06T09:00:00+08:00';
  const end = '2026-07-06T10:00:00+08:00';

  it('planned 且 now 在区间内 → running', () => {
    expect(deriveTimeboxDisplayStatus('planned', start, end, new Date('2026-07-06T09:30:00+08:00'))).toBe('running');
  });
  it('planned 且 now > endTime → overtime', () => {
    expect(deriveTimeboxDisplayStatus('planned', start, end, new Date('2026-07-06T10:30:00+08:00'))).toBe('overtime');
  });
  it('planned 且 now < startTime → null（未开始）', () => {
    expect(deriveTimeboxDisplayStatus('planned', start, end, new Date('2026-07-06T08:00:00+08:00'))).toBeNull();
  });
  it('logged → null（终态不派生）', () => {
    expect(deriveTimeboxDisplayStatus('logged', start, end, new Date('2026-07-06T09:30:00+08:00'))).toBeNull();
  });
  it('cancelled → null', () => {
    expect(deriveTimeboxDisplayStatus('cancelled', start, end, new Date('2026-07-06T09:30:00+08:00'))).toBeNull();
  });
});

describe('deriveAppointmentDisplayStatus（[023.12] + [TZ-2.2]）', () => {
  // [TZ-2.2] tz: string 必传；默认测试用 Asia/Shanghai
  const TZ = 'Asia/Shanghai'

  it('scheduled 且 now 与 startTime 同日 → in_progress', () => {
    expect(
      deriveAppointmentDisplayStatus('scheduled', '2026-07-06T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'), TZ),
    ).toBe('in_progress');
  });
  it('scheduled 且 now 日历日 > startTime → expired', () => {
    expect(
      deriveAppointmentDisplayStatus('scheduled', '2026-07-05T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'), TZ),
    ).toBe('expired');
  });
  it('scheduled 且 now 日历日 < startTime → null（未来）', () => {
    expect(
      deriveAppointmentDisplayStatus('scheduled', '2026-07-07T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'), TZ),
    ).toBeNull();
  });
  it('cancelled/completed → null', () => {
    expect(
      deriveAppointmentDisplayStatus('cancelled', '2026-07-06T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'), TZ),
    ).toBeNull();
    expect(
      deriveAppointmentDisplayStatus('completed', '2026-07-06T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'), TZ),
    ).toBeNull();
  });

  // ── [TZ-2.2] 跨 TZ 跨日界 ──

  it('[TZ-2.2] TZ=Asia/Tokyo：startTime UTC 16:00（Tokyo 7/13 01:00）+ now Tokyo 7/13 02:00 → 同日 in_progress', () => {
    const startTime = '2026-07-12T16:00:00.000Z'  // UTC 16:00 = Tokyo 7/13 01:00
    const now = new Date('2026-07-12T17:00:00.000Z')  // UTC 17:00 = Tokyo 7/13 02:00
    expect(deriveAppointmentDisplayStatus('scheduled', startTime, now, 'Asia/Tokyo')).toBe('in_progress')
  })

  it('[TZ-2.2] TZ=America/New_York：startTime UTC 12:00（NY 7/12 08:00 EDT）+ now NY 7/12 09:00 → 同日 in_progress', () => {
    const startTime = '2026-07-12T12:00:00.000Z'  // UTC 12:00 = NY 7/12 08:00 (EDT, UTC-4)
    const now = new Date('2026-07-12T13:00:00.000Z')  // UTC 13:00 = NY 7/12 09:00
    expect(deriveAppointmentDisplayStatus('scheduled', startTime, now, 'America/New_York')).toBe('in_progress')
  })

  it('[TZ-2.2] 同一 UTC 时刻 + 不同 tz：Tokyo 与 NY 各自正确判定', () => {
    // UTC 16:00 = Tokyo 7/13 01:00 (UTC+9, 跨日)；UTC 16:00 = NY 7/12 12:00 (UTC-4, 同日)
    // 与 now=UTC 17:00 比较：Tokyo 7/13 02:00（与 start 同日）vs NY 7/12 13:00（与 start 同日）
    // 两个 TZ 下都应该 in_progress（不依赖 OS TZ）
    const startTime = '2026-07-12T16:00:00.000Z'
    const now = new Date('2026-07-12T17:00:00.000Z')
    expect(deriveAppointmentDisplayStatus('scheduled', startTime, now, 'Asia/Tokyo')).toBe('in_progress')
    expect(deriveAppointmentDisplayStatus('scheduled', startTime, now, 'America/New_York')).toBe('in_progress')
  })
});