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

describe('deriveAppointmentDisplayStatus', () => {
  // 日历日比较（与 reconcile-appointment.ts localDayKey 同语义）
  it('scheduled 且 now 与 startTime 同日 → in_progress', () => {
    expect(deriveAppointmentDisplayStatus('scheduled', '2026-07-06T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'))).toBe('in_progress');
  });
  it('scheduled 且 now 日历日 > startTime → expired', () => {
    expect(deriveAppointmentDisplayStatus('scheduled', '2026-07-05T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'))).toBe('expired');
  });
  it('scheduled 且 now 日历日 < startTime → null（未来）', () => {
    expect(deriveAppointmentDisplayStatus('scheduled', '2026-07-07T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'))).toBeNull();
  });
  it('cancelled/completed → null', () => {
    expect(deriveAppointmentDisplayStatus('cancelled', '2026-07-06T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'))).toBeNull();
    expect(deriveAppointmentDisplayStatus('completed', '2026-07-06T14:00:00+08:00', new Date('2026-07-06T08:00:00+08:00'))).toBeNull();
  });
});