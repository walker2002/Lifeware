---
id: TD-030
title: "[026.02.4] post-T2 review — timebox.ts createAppointment adapter 仍有 truthy-check bug pattern (line 333/337/344)"
status: 已修复
created: 2026-07-09
last_updated: 2026-07-09
---

# TD-030: timebox.ts createAppointment adapter 3-state asymmetry ✅ 已修复

> 摘要: [026.02.4] T2 (commit 8fdbb2c) 把 3-state (undefined/null/string) 扩展到 `cnui/handlers.ts:638` 的 createAppointment mapper（symmetry intent），但 `app/actions/timebox.ts:333/344` 的 server-side createAppointment adapter 仍是 `string` + truthy-check。**当前无 UI 触发 path**，但若未来 AI parse path 或新 UI 传 null 进 createAppointment，line 344 的 `?(input.activityArchetypeId ? {...} : {})` 三态折叠会复现 bug。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium → ✅ 已修复 |
| 类别 | 行为退化 / 类型 drift |
| 领域 | lifeware-timebox |
| 录入版本 | [026.02.4] (T2 post-review) |
| 负责人 | [026.02.4-r2] round 2 fix |
| 修复目标版本 | ✅ [026.02.4-r2] round 2 ship |
| 关联 PR | [026.02.4] (T2 已 ship) + [026.02.4-r2] round 2 |

## 修复记录

[026.02.4-r2] post-ship round 2 抓出：truthy-check 漂移类不止 TD-022 #6 已知 1 处，
覆盖 4 个 sites 全部要修（同 IRON RULE pattern：truthy fold 把 null 折叠成 skip）：

| Site | 文件:行 | 修法 |
|---|---|---|
| 1 | `app/actions/timebox.ts:110` (createTimebox) | type widen `string` → `string \| null` + `!== undefined` 检查 |
| 2 | `app/actions/timebox.ts:346` (createAppointment) | type widen + `!== undefined` 检查 |
| 3 | `domains/timebox/cnui/handlers.ts:309` (editAppointment prefill) | `!== undefined && !== null` |
| 4 | `domains/timebox/cnui/handlers.ts:384` (editTimeboxes prefill) | `!== undefined && !== null` |

所有 4 处从 `?(x ? {...} : {})` 改为 `!(x !== undefined ? {...} : {})` 或
`(x !== undefined && x !== null ? {...} : {})`，配合 `string | null` 类型 widening
确保 picker 清除语义（null）能透传到 DB。

## Site (历史)

`frontend/src/app/actions/timebox.ts:333, 337, 344`:
- Line 333 type: `activityArchetypeId?: string` (should be `string | null`)
- Line 337 type: `activityArchetypeId?: string` (same)
- Line 344: `activityArchetypeId: input.activityArchetypeId ? {...} : {}` (truthy collapse)

## 修复路径（已完成）

1. ✅ type widen: `string | null`（createTimebox + createAppointment）
2. ✅ 改 truthy check: `!== undefined` 或 `!== undefined && !== null`
3. ✅ 加注释引用本 TD（同 drift class 串连教育）

## 关联

- 同 drift class: TD-022 #6 (archetype clearing 真实 UX bug, 已修 edit path)
- 同 pattern: TD-029 (EditAppointment 'in_progress' literals, planning 发现 out-of-scope)
- 本 TD 由 [026.02.4-r2] round 2 抓出 — post-ship review 第二轮 second-opinion 抓的 drift 类。
