# [TZ-2.2] localDayKey 接受 IANA TZ — 设计

## Context

[TZ-2] / [TZ-2.1] / [TZ-2.3] 落地后，写路径 + handler internal + 显示端 + 范围查询 全部切 user_tz。但**约定日历日派生** `localDayKey`（`getFullYear/getMonth/getDate`）仍按 OS TZ 计算——是 TZ-2 范围最后一个边界遗漏。

**根因**：`appointment-locked-card.tsx:85` [TZ-2] 改造时切了 `formatTime(iso, tz)` 但漏了 `deriveAppointmentDisplayStatus(status, startTime, now)` —— 该函数内部 `localDayKey` 仍按浏览器/OS TZ 计算日历日。

**影响**：MVP Shanghai-only 下巧合 OK（同进程 TZ=Asia/Shanghai = user_tz）；Tokyo user 在 Shanghai 浏览器下，约定 startTime UTC 16:00（= Tokyo 7/13 01:00）vs now UTC 17:00（= Tokyo 7/13 02:00），`localDayKey` 用 Shanghai TZ 算：约定日 = 7/13 Shanghai（UTC 16:00 → Shanghai 7/13 00:00），now 日 = 7/13 Shanghai（UTC 17:00 → Shanghai 7/13 01:00）→ 巧合同日。但跨日/跨月边界（Tokyo 7/13 04:00 = Shanghai 7/13 03:00）开始分叉——与 TZ-1 写路径 8h 漂移同根因。

**SSOT defer**：本轮 [026] OQ-6 登记项「localDayKey reconcile 调度接受 IANA TZ」收口。

## Approach

最小侵入：把 tz 参数透传到 `localDayKey` 内部，不再依赖 OS TZ。

### 决策

- **D1** `tz: string` **必传**，不设 default（避免 MVP Shanghai-only 巧合隐藏 bug；与 TZ-1 `useUserTz()` 模式一致）
- **D2** `localDayKey` 在 `derive-display-status.ts` 与 `reconcile-appointment.ts` 各自保留一份（功能模块内聚），不复用 lib/tz.ts 的 helper
- **D3** lib/tz.ts 加 `getUserTzYear/Month/Date` 三个 Intl-based helper（与已有 `getUserTzHour/Minute` 同模式），供两个 `localDayKey` 调用
- **D4** `appointment-locked-card.tsx` `useUserTz()` 已存在；只需把 `tz` 透传给 `deriveAppointmentDisplayStatus`（最小 diff）

### 关键代码变更

#### 1. `src/lib/tz.ts` 新增 3 个 helper

```ts
export function getUserTzYear(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric',
  }).formatToParts(date)
  return Number(parts.find(p => p.type === 'year')?.value ?? '0')
}

export function getUserTzMonth(date: Date, tz: string): number {
  // 1-12 (与 Date.getMonth() 0-11 区分)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, month: '2-digit',
  }).formatToParts(date)
  return Number(parts.find(p => p.type === 'month')?.value ?? '0')
}

export function getUserTzDate(date: Date, tz: string): number {
  // 1-31
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, day: '2-digit',
  }).formatToParts(date)
  return Number(parts.find(p => p.type === 'day')?.value ?? '0')
}
```

#### 2. `src/domains/timebox/status/derive-display-status.ts`

```ts
// [TZ-2.2] tz 必传（替代 OS TZ）
function localDayKey(d: Date, tz: string): number {
  return getUserTzYear(d, tz) * 10000
       + getUserTzMonth(d, tz) * 100
       + getUserTzDate(d, tz)
}

export function deriveAppointmentDisplayStatus(
  status: AppointmentStatus,
  startTime: string,
  now: Date,
  tz: string,  // [TZ-2.2] 新增必传
): AppointmentDisplayStatus {
  if (status !== 'scheduled') return null
  const nowDay = localDayKey(now, tz)
  const startDay = localDayKey(new Date(startTime), tz)
  if (nowDay > startDay) return 'expired'
  if (nowDay === startDay) return 'in_progress'
  return null
}
```

#### 3. `src/domains/timebox/status/reconcile-appointment.ts`

```ts
// [TZ-2.2] tz 必传（与 derive-display-status 同语义）
function localDayKey(d: Date, tz: string): number {
  return getUserTzYear(d, tz) * 10000
       + getUserTzMonth(d, tz) * 100
       + getUserTzDate(d, tz)
}

export function deriveAppointmentBadges(
  appointments: ReadonlyArray<Appointment>,
  now: Date,
  tz: string,  // [TZ-2.2] 新增必传
): AppointmentBadge[] {
  return appointments.map(a => ({
    appointmentId: a.id as string,
    badge: deriveAppointmentDisplayStatus(a.status, a.startTime, now, tz),
  }))
}

export function findExpiredAppointmentIds(
  appointments: ReadonlyArray<Appointment>,
  now: Date,
  tz: string,
): string[] {
  return deriveAppointmentBadges(appointments, now, tz)
    .filter(b => b.badge === 'expired')
    .map(b => b.appointmentId)
}

export function findInProgressAppointmentIds(
  appointments: ReadonlyArray<Appointment>,
  now: Date,
  tz: string,
): string[] {
  return deriveAppointmentBadges(appointments, now, tz)
    .filter(b => b.badge === 'in_progress')
    .map(b => b.appointmentId)
}
```

#### 4. `src/domains/timebox/components/appointment-locked-card.tsx:85`

```diff
- const displayStatus = deriveAppointmentDisplayStatus(appointment.status, appointment.startTime, now);
+ const displayStatus = deriveAppointmentDisplayStatus(appointment.status, appointment.startTime, now, tz);
```

### 测试更新

| 文件 | 改动 |
|---|---|
| `__tests__/derive-display-status.test.ts` | 现有 4 cases 加 tz='Asia/Shanghai' 参数；新增「跨 TZ 跨日界」3 cases（Shanghai/Tokyo/NY）|
| `__tests__/reconcile-appointment.test.ts` | 现有 11 cases 加 tz='Asia/Shanghai' 参数 |
| `__tests__/reconcile-appointment-tz.test.ts` | 现有 7 cases 加 tz 参数；新增「跨 TZ 跨日界」3 cases |

### 关键 fixture 案例（跨 TZ 验证核心意图）

```ts
// [TZ-2.2] 跨 TZ 跨日界 — 不依赖 process.env.TZ，直接传 tz 参数
it('TZ=Asia/Tokyo：startTime UTC 16:00（Tokyo 7/13 01:00）+ now Tokyo 7/13 02:00 → 同日 in_progress', () => {
  const startTime = '2026-07-12T16:00:00.000Z'  // UTC 16:00 = Tokyo 7/13 01:00
  const now = new Date('2026-07-12T17:00:00.000Z')  // UTC 17:00 = Tokyo 7/13 02:00
  expect(deriveAppointmentDisplayStatus('scheduled', startTime, now, 'Asia/Tokyo'))
    .toBe('in_progress')
})

it('TZ=America/New_York：startTime UTC 12:00（NY 7/12 08:00）+ now UTC 13:00（NY 7/12 09:00）→ 同日', () => {
  const startTime = '2026-07-12T12:00:00.000Z'  // UTC 12:00 = NY 7/12 08:00 (EDT)
  const now = new Date('2026-07-12T13:00:00.000Z')  // UTC 13:00 = NY 7/12 09:00
  expect(deriveAppointmentDisplayStatus('scheduled', startTime, now, 'America/New_York'))
    .toBe('in_progress')
})

it('TZ=Asia/Tokyo vs America/New_York：同一 UTC 时刻 + 不同 tz → 可能跨日', () => {
  // UTC 16:00 = Tokyo 7/13 01:00; UTC 16:00 = NY 7/12 12:00
  // 与 now=UTC 17:00 比较：Tokyo 7/13 02:00（与 start 同日）vs NY 7/12 13:00（与 start 同日）
  // 两个 TZ 下都应该 in_progress（不依赖 OS TZ）
  const startTime = '2026-07-12T16:00:00.000Z'
  const now = new Date('2026-07-12T17:00:00.000Z')
  expect(deriveAppointmentDisplayStatus('scheduled', startTime, now, 'Asia/Tokyo'))
    .toBe('in_progress')
  expect(deriveAppointmentDisplayStatus('scheduled', startTime, now, 'America/New_York'))
    .toBe('in_progress')
})
```

## Verification

1. **Unit tests**:
   - `derive-display-status.test.ts` 4→7 cases（+3 跨 TZ）全 pass
   - `reconcile-appointment.test.ts` 11 cases 加 tz 参数全 pass
   - `reconcile-appointment-tz.test.ts` 7→10 cases（+3 跨 TZ）全 pass
2. **vitest base/head**: 0 净回归（TZ-2.2 +3 pass；剩余 failed = pre-existing handlers-edit-appointment + parse-appointment）
3. **tsc**: 0 新增错误（强制必传 tz 会暴露其他遗忘点——如有，未在本 spec 范围内登记为后续 ticket）
4. **dev server smoke**: `/timeboxes` HTTP 200, appointment locked card 派生徽章按 user_tz 显示
5. **[/browse] post-ship verification**: 验证 user_tz 切换（Tokyo/Shanghai）下约定派生徽章正确（[feedback_post-ship-review-meta-pattern] 第 N 次累积）
6. **CHANGELOG** `[TZ-2.2]` section + memory 记录

## Out of Scope (defer)

- 任何其他 `Date.getFullYear/getMonth/getDate` OS TZ 依赖点（grep `getFullYear\|getMonth\|getDate` in `src/domains/timebox/`，如有生产 callsite 登记后续 ticket）
- DB Schema 改 / 脏数据迁移：不动
- Layout server-side 拿 tz 路径：不动（已 OK）

## Commit Boundary

1 个 fix commit：`fix(timezone): [TZ-2.2] localDayKey 接受 IANA TZ`（含 lib/tz.ts 3 helper + 2 status 文件 tz 参数 + 1 card 透传 + 测试更新 + docs）

## Authority

- TZ 治本 SSOT：`.specify/memory/constitution.md`（业务事实写入口 / 跨域一致性）
- TZ-1 / TZ-2 / TZ-2.1 / TZ-2.3 已 merge origin/main @ `62aebf3`，本步骤是 TZ 全链路最后一块拼图
- 关联：[[project-tz-2-full-shipment]] memory