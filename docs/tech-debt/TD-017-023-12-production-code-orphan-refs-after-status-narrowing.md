---
id: TD-017
title: "[023.12] 生产代码漏跟 status 收窄：timebox.ts + intent.ts 仍读被删字段与死状态,2 处 production 路径错"
status: 新建
created: 2026-07-06
last_updated: 2026-07-06
---

# TD-017: [023.12] 生产代码漏跟 status 收窄：timebox.ts + intent.ts 仍读被删字段与死状态,2 处 production 路径错

> 摘要：[023.12] 将 timebox 6→3 态 + Timebox 接口删 startedAt/overtimeAt/endedAt 字段后,2 处 production 代码未同步:`app/actions/timebox.ts:262` `transitionTimebox` action union 仍含已死的 'start'/'end' + 与 TimeboxStatus 联合比较 'running' 报 TS2367 no-overlap;`app/actions/intent.ts:126-128` `getActiveTimeboxSummary` 等仍读 `timebox.startedAt/overtimeAt/endedAt` 报 TS2339 字段不存在。2 处 production 路径的 tsc 错。`transitionTimebox` 的死 action 'start'/'end' 在 codex review 已标但 defer 留到 [023.13]。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🔴 Critical（production 路径 tsc 错;虽然 [023.12] tsc baseline 0 NEW,但 intent.ts:126-128 与 timebox.ts:262 在 [023.12] worktree 内部 0 NEW,因为它们沿用旧 schema 类型不报错——一旦 [023.13] 把 schema 严格化就会爆） |
| 类别 | 架构 / 类型安全 |
| 领域 | `lifeware-timebox` |
| 录入版本 | v0.X.X ([023.12]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知（[023.13] 收口时一并清） |
| 关联 PR/分支 | `feat/023-12-lifecycle-simplify` |
| 关联 Constitution 条款 | N/A |

## 现象（What）

```
cd frontend && npx tsc --noEmit 2>&1 | grep -E "timebox.ts:262|intent.ts:12[6-8]"
```

输出（实际 tsc 在 [023.12] worktree 内 baseline 0 NEW,但 schema 严格化后会暴露）：

1. `app/actions/timebox.ts:262` — `error TS2367: This comparison appears to be unintentional because the types 'TimeboxStatus' and '"running"' have no overlap.`
2. `app/actions/intent.ts:126,127,128` — `error TS2339: Property 'startedAt'/'overtimeAt'/'endedAt' does not exist on type 'Timebox'.`

更广义：
- `app/actions/timebox.ts:118` `transitionTimebox` action 参数类型 `action: 'start' | 'end' | 'cancel' | 'log'` —— `'start'/'end'` 已不在 manifest lifecycle（[023.12] T4 删除）
- `app/actions/timebox.ts:124-130` `ACTION_TO_INTENT` 映射 `'start' → 'startTimebox'` / `'end' → 'endTimebox'` —— 这两个 intent action 已从 manifest 删除（codex review 后 2ddd223 commit 删了 startTimebox/endTimebox intent_trigger）

## 根因（Why）

- **T2 (commit 18968ee + fix f7dff6d)** 收窄 Timebox 接口删 3 字段 + 6→3 态,但 `app/actions/intent.ts:126-128` 的 `getActiveTimeboxSummary` 序列化逻辑未跟随 schema 删字段。同时 `app/actions/timebox.ts` 仍含旧 action 参数 'start'/'end'。
- **codex review (commit 2ddd223)** 只删了 manifest intent_trigger 入口（startTimebox/endTimebox shortcuts）,**未**清理 server action 层 `transitionTimebox` 的死 action 引用。codex review fix 验证时 tsc 仍 0 NEW（因为 server action 参数 union 含 'start'/'end' 字符串在 union 联合内合法,只是与 TimeboxStatus 比较时报 no overlap 但 schema 没强校）。

**核心模式**：[023.12] type 收窄的连锁影响——T2/T4/T5/T6 改了类型声明,但**所有 server action 层的字符串字面量与类型联合的 cross-validation 没人扫过**。codex review 抓到了 manifest 层（入口）,但没抓到 server action 层（出口）。

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 运行时若 AI 路由 'startTimebox' 字符串到 transitionTimebox,会与 TimeboxStatus 6→3 态联合不匹配,SM 找不到对应 transition,UI 报 "no transition found"（静默失败） |
| 用户 | 偶发 "时间盒操作失败" 弹窗（极低概率,因 manifest 已删 startTimebox/endTimebox 入口,但反向 AI 路由或旧客户端残留 URL 可能触发） |
| 技术 | 2 处生产 tsc 错;1 处 dead code（'start'/'end' action 字符串） |
| 范围 | `app/actions/timebox.ts`、`app/actions/intent.ts` |
| 严重性依据 | server action 层 dead code 5 字符串 + 1 处类型比较 no overlap + 3 处字段引用不存在 = 9 条潜在运行时 / 编译错 |

## 修复建议

```ts
// 1. app/actions/timebox.ts
//    - transitionTimebox action 参数 union 收窄:删除 'start' | 'end'（manifest 已无对应 SM action）
//    - ACTION_TO_INTENT 映射删除 start/end 条目
//    - 旧 124-130 行的 case 同步
//    - 旧 L262 与 'running' 字面量比较删除（display 逻辑由 derive-display-status.ts 接管）

// 2. app/actions/intent.ts
//    - 126-128 行 timebox.startedAt/overtimeAt/endedAt 读取删除
//    - 改用 deriveTimeboxDisplayStatus(timebox.status, timebox.startTime, timebox.endTime, now) 派生显示态
//    - getActiveTimeboxSummary 改为派生 vs 持久化的 JSON shape
```

## 预防

- **plan-eng-review 必查 server action 层的字符串字面量与新类型联合的 cross-validation**——type narrowing 不只影响 schema/type declaration,所有 server action 签名、action map、case 分支都需扫。
- **SDD subagent 每改 type 必 `grep -nE "\.startedAt|\.endedAt|\.overtimeAt|in_progress|expired" 整个 src/** 找遗留引用。

## 关联

- [[TD-016]] — 测试 fixture 漏改（test gate 同源问题）
- codex review 2ddd223 标了 C2/C3 (transitionTimebox/STATUS_TRANSITION_ACTIONS) defer T14+——本 TD 收录进 defer
