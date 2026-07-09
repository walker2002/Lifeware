---
id: TD-030
title: "[026.02.4] post-T2 review — timebox.ts createAppointment adapter 仍有 truthy-check bug pattern (line 333/337/344)"
status: 新建
created: 2026-07-09
last_updated: 2026-07-09
---

# TD-030: timebox.ts createAppointment adapter 3-state asymmetry

> 摘要: [026.02.4] T2 (commit 8fdbb2c) 把 3-state (undefined/null/string) 扩展到 `cnui/handlers.ts:638` 的 createAppointment mapper（symmetry intent），但 `app/actions/timebox.ts:333/344` 的 server-side createAppointment adapter 仍是 `string` + truthy-check。**当前无 UI 触发 path**，但若未来 AI parse path 或新 UI 传 null 进 createAppointment，line 344 的 `?(input.activityArchetypeId ? {...} : {})` 三态折叠会复现 bug。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium (server-side latent bug, 无当前触发 path) |
| 类别 | 行为退化 / 类型 drift |
| 领域 | lifeware-timebox |
| 录入版本 | [026.02.4] (T2 post-review) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 下次涉及 createAppointment 的 session |
| 关联 PR | [026.02.4] (即将 ship, T2 已 ship) |

## Site

`frontend/src/app/actions/timebox.ts:333, 337, 344`:
- Line 333 type: `activityArchetypeId?: string` (should be `string | null`)
- Line 337 type: `activityArchetypeId?: string` (same)
- Line 344: `activityArchetypeId: input.activityArchetypeId ? {...} : {}` (truthy collapse)

## 修复路径

下次涉及 createAppointment session：
1. type widen: `string | null`
2. 改 truthy check: `input.activityArchetypeId !== undefined ? { activityArchetypeId: input.activityArchetypeId } : {}`
3. 加 IRON RULE test: 验证 null (clear) / undefined (skip) / string (set) 三态均正确
4. 删除本 TD

## 关联

- 同 drift class: TD-022 #6 (archetype clearing 真实 UX bug, 已修 edit path)
- 同 pattern: TD-029 (EditAppointment 'in_progress' literals, planning 发现 out-of-scope)
- 修复时序: 建议与下次 createAppointment 改动一起