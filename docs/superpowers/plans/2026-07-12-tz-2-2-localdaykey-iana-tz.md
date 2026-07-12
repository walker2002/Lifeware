# [TZ-2.2] localDayKey 接受 IANA TZ — 实施计划

## Plan SSOT

- Spec: `docs/superpowers/specs/2026-07-12-tz-2-2-localdaykey-iana-tz-design.md`
- Branch: `fix/tz-2-2-localdaykey-iana-tz`（从 origin/main 拉）

## 任务清单（5 tasks, 1 commit）

### T1. lib/tz.ts 新增 3 个 Intl-based helper

**文件**：`frontend/src/lib/tz.ts`

**新增**（按 `getUserTzHour/Minute` 模式对称）：

```ts
/**
 * [TZ-2.2] 取 Date 对象在 tz 下的 year 分量
 */
export function getUserTzYear(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
  }).formatToParts(date)
  return Number(parts.find(p => p.type === 'year')?.value ?? '0')
}

/**
 * [TZ-2.2] 取 Date 对象在 tz 下的 month 分量（1-12）
 */
export function getUserTzMonth(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: '2-digit',
  }).formatToParts(date)
  return Number(parts.find(p => p.type === 'month')?.value ?? '0')
}

/**
 * [TZ-2.2] 取 Date 对象在 tz 下的 day-of-month 分量（1-31）
 */
export function getUserTzDate(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    day: '2-digit',
  }).formatToParts(date)
  return Number(parts.find(p => p.type === 'day')?.value ?? '0')
}
```

**TDD**：
- 在 `src/lib/__tests__/tz.test.ts` 加 3 个 helper 测试（与 `getUserTzHour` 同 fixture 模式）

### T2. `derive-display-status.ts` 加 tz 参数

**文件**：`frontend/src/domains/timebox/status/derive-display-status.ts`

**改动**：
- import `getUserTzYear/Month/Date` from `@/lib/tz`
- `localDayKey(d: Date, tz: string)` 用 3 helper
- `deriveAppointmentDisplayStatus` 加 `tz: string` 必传（第 4 参）

**TDD 步骤**：
- 先改签名 → tsc 报错 → 改测试 → 测试通过
- 新增「跨 TZ 跨日界」3 cases（见 spec fixture）
- 现有 4 cases 加 `'Asia/Shanghai'` 参数

### T3. `reconcile-appointment.ts` 加 tz 参数

**文件**：`frontend/src/domains/timebox/status/reconcile-appointment.ts`

**改动**：
- import `getUserTzYear/Month/Date`
- `localDayKey(d: Date, tz: string)` 同 T2
- `deriveAppointmentBadges` / `findExpiredAppointmentIds` / `findInProgressAppointmentIds` 加 `tz: string` 必传

**TDD 步骤**：
- 现有 11 cases 加 `'Asia/Shanghai'` 参数
- 现有 7 cases (tz.test.ts) 加 tz 参数
- 新增 3 cases「跨 TZ 跨日界 list batch」

### T4. `appointment-locked-card.tsx` 透传 tz

**文件**：`frontend/src/domains/timebox/components/appointment-locked-card.tsx`

**改动**（line 85）：
```diff
- const displayStatus = deriveAppointmentDisplayStatus(appointment.status, appointment.startTime, now);
+ const displayStatus = deriveAppointmentDisplayStatus(appointment.status, appointment.startTime, now, tz);
```

**验证**：现有 `timebox-list.regression.test.tsx` 用 `renderWithTz(...)` 默认 `Asia/Shanghai`，fixture 用 Shanghai 本地时刻，无新增 test。

### T5. CHANGELOG + memory + docs 同步

**文件**：
- `frontend/CHANGELOG.md` — 追加 `[TZ-2.2]` section（与 [TZ-2.3] 同模板）
- 暂不写 memory，等 merge 后写 `project-tz-2-2-localdaykey-iana-tz.md`
- 不动 USOM/DB 设计文档（无 schema 变更）

## 验证（CLAUDE.md Change Gate）

| Gate | 命令 | 期望 |
|---|---|---|
| vitest tz helpers | `npx vitest run src/lib/__tests__/tz.test.ts` | +3 cases pass |
| vitest status | `npx vitest run src/domains/timebox/status` | 11 + 7 + 7 = 25+ cases pass（含新增 6 跨 TZ cases）|
| vitest 全 timebox | `npx vitest run src/domains/timebox` | 0 净回归（baseline 失败集不变）|
| vitest 全量 | `npx vitest run` | 0 净回归 |
| tsc | `npx tsc --noEmit` | 0 新增错误（强制必传 tz 暴露的遗忘点需登记后续 ticket）|
| pre-push | `npm run validate:manifest && npm run validate:structure` | 0 errors |
| dev server | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/timeboxes` | 200 |

## Commit 边界

**1 个 fix commit**：

```
fix(timezone): [TZ-2.2] localDayKey 接受 IANA TZ

- lib/tz.ts 新增 getUserTzYear/Month/Date 三个 Intl-based helper
  （与已有 getUserTzHour/Minute 对称）
- derive-display-status.ts: localDayKey(d, tz) 必传 tz;
  deriveAppointmentDisplayStatus 加 tz: string 必传
- reconcile-appointment.ts: localDayKey(d, tz) 同上;
  deriveAppointmentBadges/findExpiredAppointmentIds/findInProgressAppointmentIds
  加 tz: string 必传
- appointment-locked-card.tsx:85 透传 useUserTz().tz 给派生函数
  （修 [TZ-2] 漏改的边角）
- 测试：3 文件更新 + 6 cases「跨 TZ 跨日界」新增
- CHANGELOG [TZ-2.2] section

[026] OQ-6 defer 收口 —— TZ 全链路最后一块拼图
```

**预期 diff stat**：
- `frontend/src/lib/tz.ts` — +45 行（3 helper + JSDoc）
- `frontend/src/lib/__tests__/tz.test.ts` — +20 行（3 测试 cases）
- `frontend/src/domains/timebox/status/derive-display-status.ts` — +5/-3 行
- `frontend/src/domains/timebox/status/reconcile-appointment.ts` — +8/-3 行
- `frontend/src/domains/timebox/status/__tests__/derive-display-status.test.ts` — +25 行（3 跨 TZ cases）
- `frontend/src/domains/timebox/status/__tests__/reconcile-appointment.test.ts` — 11 处加 `'Asia/Shanghai'` 参数（0/+11 行）
- `frontend/src/domains/timebox/status/__tests__/reconcile-appointment-tz.test.ts` — 7 处加参数 + 3 cases 新增（+30/-0 行）
- `frontend/src/domains/timebox/components/appointment-locked-card.tsx` — +1/-1 行
- `frontend/CHANGELOG.md` — +30 行（[TZ-2.2] section）

合计：~10 文件 / +175 行 / -7 行

## 实施顺序

1. **T1** 先加 helper（独立，最小风险）
2. **T2 + T3** 改 status 两个文件 + 测试（TDD：先改签名 → 改测试 → 测试通过）
3. **T4** 改 appointment-locked-card.tsx（解锁 tsc 错误）
4. **T5** CHANGELOG
5. 全量验证（vitest + tsc + dev server）

## 风险与缓解

- **强制必传 tz 暴露其他遗忘点**：grep `deriveAppointmentDisplayStatus|deriveAppointmentBadges|findExpiredAppointmentIds|findInProgressAppointmentIds` callers 已确认只 1 生产 callsite (`appointment-locked-card.tsx`)，无遗漏
- **跨 TZ 测试用 ISO UTC 时刻**：与 TZ-1 已有 fixture 模式一致，不依赖 process.env.TZ 切换（更稳定）
- **MVP Shanghai-only 巧合**：dev/CI runner TZ=Asia/Shanghai 时新代码与旧代码行为一致，无行为回归

## 后续 defer（明确登记）

- `appointment-filter-bar.tsx:33,36,43,44` 的 `setDate/getFullYear/getMonth` 算日期范围 —— 与本 spec 范围不同（filter range 而非 calendar day 派生），MVP Shanghai-only 巧合 OK，登记后续 ticket
- `appointment-mini-calendar.tsx:36-37,49,94`、`appointment-month-view.tsx:26-27,36,85` 的 `currentDate.getFullYear/getMonth/getDate` UI 显示 —— 当前按 currentDate（absolute moment）渲染，本质是显示当前选中日期，与 user_tz 解耦，登记后续 ticket
- `timebox-drawer.tsx:86`、`lib/appointment-date-utils.ts:20` 的 `ymdKey` formatter —— UI 显示日期字符串，TZ-2 范围不动，登记后续 ticket

## SSOT

- Spec: `docs/superpowers/specs/2026-07-12-tz-2-2-localdaykey-iana-tz-design.md`
- Plan: `docs/superpowers/plans/2026-07-12-tz-2-2-localdaykey-iana-tz.md`（本文件）
- 上游 TZ 链路：
  - TZ-1: origin/main @ `42d6e36`（PR !12）
  - TZ-2: origin/main @ `d283dbd`（PR !13）
  - TZ-2.1: origin/main @ `62aebf3`（PR #16）
  - TZ-2.3: origin/main @ `62aebf3`（PR #16）

## 合并纪律

[[feedback_no-self-merge]] — 不自动 merge。Claude 提交 PR 后用户在 gitee 网页手动 merge。