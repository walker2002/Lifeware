---
id: TD-021
title: "[026.01] 假定 appointment.status 5 态已 stale:[023.12] narrow 到 3 态后,EditAppointment/handler 注释残留 in_progress literal"
status: 新建
created: 2026-07-07
last_updated: 2026-07-07
---

# TD-021: [026.01] 假定 appointment.status 5 态已 stale

> 摘要:[026.01] spec 起草时(2026-07-06)appointment.status 仍是 5 态存储(`scheduled | in_progress | expired | cancelled | completed`)。[023.12] lifecycle-simplify(2026-07-07 ship,commit 8c63361+32d4533)将 appointment.status narrow 到 3 持久态(`scheduled | cancelled | completed`),`in_progress`/`expired` 改为 derived-display-only (由页面 server component reconcile 时计算),不落库。[026.01] 已 ship 5 commits(ccaa18a→5ea9a37),期间未感知 [023.12] 改动。**Whole-branch review 在 ship 后发现**:`EditAppointment.tsx:61/68/140` 三处对 `raw AppointmentStatus` 引用 `in_progress` literal 是死代码,UI「执行中/计划」badge 永远显示「计划」(UX regression vs [023.12] derived-display 承诺);`handlers.ts:235/247/331` 三处注释保留 `{scheduled, in_progress}` stale 描述与实际 3 态 enum 矛盾。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium ([026.01] 已 ship;`canDelete` 行为正确(只 match scheduled,死代码部分无害);UI badge 永远显示「计划」是 UX 缺憾但非 functional bug;问题出现在跨 task 设计不同步,非 ship-blocker) |
| 类别 | 跨 session 设计同步 / UX |
| 领域 | `lifeware-timebox` (timebox + appointment 跨域) |
| 录入版本 | v0.X.X ([026.01] ship 后 whole-branch review 发现) |
| 负责人 | 暂未指派（建议 [023.13] neat-sync session owner） |
| 修复目标版本 | 下次跨任务设计同步 session(优先 [023.13] neat-sync) |
| 关联 PR/分支 | main（[026.01] 已 ship,5 commits ahead origin/main） |
| 关联 Constitution 条款 | N/A |

## 复现

```bash
# 1. 验证 USOM 实际状态
grep -nE "export type AppointmentStatus" /home/walker/lifeware/frontend/src/usom/types/primitives.ts
# 期望输出:235:export type AppointmentStatus = 'scheduled' | 'cancelled' | 'completed'

# 2. 验证 stale 引用
grep -nE "in_progress" /home/walker/lifeware/frontend/src/domains/timebox/cnui/surfaces/EditAppointment.tsx
# 期望输出:3 行 (line 61 / 68 / 140)
grep -nE "scheduled, in_progress" /home/walker/lifeware/frontend/src/domains/timebox/cnui/handlers.ts
# 期望输出:3 行注释 (line 235 / 247 / 331)
```

## 实际行为分析

| 位置 | 现状行为 | [023.12] 期望行为 | 影响 |
|---|---|---|---|
| `EditAppointment.tsx:61` `canDelete` | 仅 `scheduled` 显示删除 (`\|\| 'in_progress'` 死分支) | `scheduled` 显示删除(✓ 实际行为正确,只是 dead code) | 无功能影响 |
| `EditAppointment.tsx:68` editing 标题 badge | 永远「计划」 | 应在 `in_progress` 显示「执行中」(`derive-display-status(inProgressAt, ...)`) | **UX 缺憾**:进行中的约定编辑时看不到「执行中」标记 |
| `EditAppointment.tsx:140` selecting 列表 status badge | 永远「计划」 | 应在 `in_progress` 显示「执行中」 | **UX 缺憾** |
| `handlers.ts:235/247/331` 注释 | 描述 `{scheduled, in_progress}`(stale)| 实际数据是 `{scheduled}`(in_progress 不落库) | 仅文档/代码评论债,不影响运行 |

**核心根因**:[026.01] spec 起草日(2026-07-06)早于 [023.12] ship(2026-07-07),spec §1.2.2 描述 `5 态全部存储(Cancelled 终态...)` 但 [023.12] 把这假设改写。spec §3.3 / §5.2 的 `findActive` 假设{scheduled, in_progress}也已 stale — 但幸好 `findActive` 现实现只 filter `status === 'scheduled'`,所以 inactive row 仍隐藏(行为正确)。

**为什么 ship 检验没抓到**:T1-T5 task reviews 各自 only check spec compliance with spec (已假定 5 态),没人 cross-verify 与 [023.12] 实际 USOM 是否一致。**Fix 建议**:`/plan-eng-review` skill 显式要求「check production codebase latest state vs spec assumptions」。

## 建议修复方案

[023.13] neat-sync session 集中清理:

```ts
// 1. helpers/derive-display-status.ts(新建或增强 existing):
export function deriveDisplayStatus(
  appt: Appointment,
  now: Date = new Date()
): 'in_progress' | 'expired' | 'scheduled' | 'cancelled' | 'completed' {
  // [023.12] derived-display 算法,参照 reconcile-appointment.ts:49
  if (appt.status === 'cancelled') return 'cancelled'
  if (appt.status === 'completed') return 'completed'
  // status === 'scheduled' → derive:
  // 如果 startTime 已到, endTime 未到 → 'in_progress'
  // 如果 endTime 已过 → 'expired'
  // 否则 → 'scheduled'
  ...
}

// 2. EditAppointment.tsx 修 useState 派生 status:
// const displayStatus = useMemo(() => deriveDisplayStatus(target, new Date()), [target])
// const canDelete = displayStatus === 'scheduled' || displayStatus === 'in_progress'
// editing 标题: 编辑约定（{displayStatus === 'in_progress' ? '执行中' : '计划'}）;
// selecting 列表:同样使用 displayStatus

// 3. handlers.ts:清理 3 处注释:'{scheduled, in_progress}' → '{scheduled}' (and in_progress 由 derive-display 处理)

// 4. AppointmentSummary 加 displayStatus?: string(聚合 service 计算)
// 或每个 caller 自行 derive
```

**预防建议**:`/plan-eng-review` skill 显式要求 plan-eng-reviewer 读取「最近 N 天 design/handover docs」(如 [project-026-01-appointment-archetype-design.md] 等) check spec-assumed-5-states 是否被同周其他 task 推翻。同时 `lifeware-neat` 加「`AppointmentStatus` enum consistency check」(`grep` + schema 三方对齐)。

## 状态

- [x] 列入 tech-debt ledger
- [x] whole-branch review 在 [026.01] ship 后发现
- [x] 不阻塞 [026.01] ship(已 ship)
- [x] 不修改 main 代码(等下次 neat-sync)
- [ ] [023.13] 集中清理 — 下次 session
- [ ] plan-eng-review skill 加 cross-session 假设验证 — follow-up
- [ ] `lifeware-neat` skill 加 USOM enum consistency check — follow-up

## 关联

- Whole-branch review: `/home/walker/.superpowers/sdd/review-9ee4206..5ea9a37.whole-branch.md`
- Memory: `project-026-01-appointment-archetype-design.md`
- 导致根源: [023.12] lifecycle simplify (8c63361+32d4533),spanned 主分支 commit 27a6448 (从 [023.12] design 2026-07-04 起)
- 同期类似债: TD-020 docs merge conflict markers(同源 — neat-sync 跨任务不一致)
