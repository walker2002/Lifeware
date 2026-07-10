---
id: TD-031
title: "[026.02.4] post-T5 review — use-auto-trigger.ts 双分支 planned gate 可能同时 fire start + overtime"
status: 已修复
created: 2026-07-09
last_updated: 2026-07-09
---

# TD-031: use-auto-trigger 双分支 planned gate 同 cycle 双 fire 风险 ✅ 已修复

> 摘要: [026.02.4] T5 (commit 825ec6b) 把 `use-auto-trigger.ts:53` 的 `tb.status === "running"` 改为 `tb.status === "planned"`（TD-028 Site 2 修复）。但文件内另一分支（line ~44 附近）也是 `tb.status === "planned"` 守卫的 `onTransition(tb.id, "start")`。结果：对一个 `planned` 且 `startTime` + `endTime` 都已过期的 overdue 时间盒，同 cycle 内 `start` 和 `overtime` 两个 transition 可能都触发。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium (state machine 可能拒绝第二次 transition, 但语义错误: 用户期望「过期 → overtime」而非「未启动 → 自动 start → 立即 overtime」) |
| 类别 | 行为退化 / state machine misuse |
| 领域 | lifeware-timebox |
| 录入版本 | [026.02.4] post-T5 review |
| 负责人 | 暂未指派 |
| 修复目标版本 | 下次涉及 use-auto-trigger 的 session |
| 关联 PR | [026.02.4] (即将 ship, T5 已 ship) |
| 关联 TD | TD-028 (Site 2 已修, 此 TD 是 Site 2 修复的副作用) |

## Site

`frontend/src/hooks/use-auto-trigger.ts:44-62` (post-T5):
- Branch 1 (~line 44): `if (tb.status === "planned") { onTransition(tb.id, "start") }`
- Branch 2 (line 56): `if (tb.status === "planned" && endTime <= now) { onTransition(tb.id, "overtime") }`

Pre-TD-028: branch 2 was `tb.status === "running"`, impossible to fire from `planned` state. Post-TD-028: both branches share `planned` gate, both can fire same cycle.

## 修复路径

下次涉及 session：
1. 选项 A: 改为 `else if` 互斥 — 分支顺序决定优先级（先 start 后 overtime 不合理，应反过来先 overtime 后 start，但 overtime 本身要求先 started — state machine 可能拒绝）
2. 选项 B: gate branch 2 on `endTime <= now && startTime <= now`（TB 真的过期了，不是「未启动」）— 保持「overdue 真实场景」语义
3. 选项 C: 加 dedup 逻辑 — 同 cycle 内只 fire 一个 transition per timebox

推荐选项 B，语义最清晰。

## 关联

- TD-028 Site 2: `use-auto-trigger.ts:53` 修复从 `running` 改 `planned` 后暴露本 TD
- 同 pattern: TD-029 (planning 发现 out-of-scope), TD-030 (post-T2 review asymmetry)