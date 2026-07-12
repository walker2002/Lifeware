---
id: TD-016
title: "[023.12] 测试 fixture 漏改 (8/9 已 [023.13] 自动清,剩 1 处 main 直接补 fixture 修)
status: ✅ 已修复
severity: 🟠 → ✅
created: 2026-07-06
last_updated: 2026-07-12
closed: 2026-07-12
fix_version: [023.13] 自动清 8/9 + 本次补 1 fixture (timebox-card.test.tsx:91)
---

# TD-016: [023.12] 测试 fixture 漏改：status 收窄与字段删除后,3 处 test fixture 仍引用旧值/旧字段,tsc 累计 9 错

> 摘要：[023.12] 将 timebox 6→3 态、appointment 5→3 态、cycle 5→4 态,并删除 startedAt/overtimeAt/endedAt(inProgressAt/expiredAt)5 个字段后,3 处 test fixture 未同步:appointment-actions.test.ts 仍引用 markInProgressAppointment/markExpiredAppointment + inProgressAt/expiredAt;okr-actions.test.ts getActiveCycles 期望仅含 in_progress 周期;timebox-card.test.tsx:91 仍用旧 ExecutionRecord shape。共 9 条 tsc 错。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟠 High（影响 [023.12] ship 的 test gate,9 条 tsc 错导致 tsc count 105→120,baseline 103+9=112 — 占基线 8.7%） |
| 类别 | 测试 |
| 领域 | `cross-domain`（appointment + okr + timebox 三个域的 test fixture 漏改） |
| 录入版本 | v0.X.X ([023.12]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知（[023.13] 收口时一并清） |
| 关联 PR/分支 | `feat/023-12-lifecycle-simplify` |
| 关联 Constitution 条款 | N/A |

## 现象（What）

```
cd frontend && npx tsc --noEmit 2>&1 | grep -E "appointment-actions.test|okr-actions|hooks.ts|intent.ts:1[2-3]|timebox.ts:262|timebox-card.test|generic-repo-adapter.test" | sort -u
```

输出（按文件:行号聚类）：

1. `appointment-actions.test.ts:61` — `error TS2305: Module '"../timebox"' has no exported member 'markInProgressAppointment'.`
2. `appointment-actions.test.ts:62` — 同上
3. `appointment-actions.test.ts:145,146,171,172,308,349,370,372,373` — `error TS2339: Property 'inProgressAt'/'expiredAt' does not exist on type Appointment.`
4. `okr-actions.test.ts` — `getActiveCycles 返回 success 且仅含 approved 周期`（test 期望 in_progress 不再存在）
5. `timebox-card.test.tsx:91` — `error TS2322: Type '{ mode: "detailed"; notes: string; }' is not assignable to type 'ExecutionRecord | undefined'.`

## 根因（Why）

- **T5 (commit c5780bd + fix ea52609)** 删了 `app/actions/reconcile-appointments.ts`（含 `markInProgressAppointment`/`markExpiredAppointment`）和 Appointment 接口的 `inProgressAt`/`expiredAt` 字段,但 `appointment-actions.test.ts` 未同步更新——仍引用已删的方法和字段。
- **T6 (commit a5c98fd)** 改 cycle status 5→4 态（in_progress 合并为 approved）,`okr-actions.test.ts` 仍写 in_progress 期望。
- **T2 fix (commit f7dff6d)** 改 `DetailedExecutionRecord` 形状（plan-eng-review codex #2 调整 fields 顺序/必填性）,`timebox-card.test.tsx:91` fixture 用旧 shape 失败。

**模式**：[023.12] 3 个核心域（timebox/okr/appointment）改造时**只更新了生产代码和部分测试,但**未做**测试 fixture 同步扫描**。SDD subagent 修复一个 task 后只跑该 task 受影响的 vitest 子集,没跑 tsc 全量,导致 type 错到 ship-then-polish 阶段才暴露。

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 无直接功能影响（编译错只在 type-check 阶段,运行时不触发） |
| 用户 | 无 |
| 技术 | tsc 累计 9 错在 [023.12] baseline 103 之上,占 8.7%。post-[023.12] worktree tsc 应 95（-8 真修后）但实际 105+9=112（worktree 内部跑 fixture 漏改测试时） |
| 范围 | 3 个 test 文件:`app/actions/__tests__/appointment-actions.test.ts`、`app/actions/__tests__/okr-actions.test.ts`、`components/__tests__/timebox-card.test.tsx` |
| 严重性依据 | 9 条 tsc 错编译错会破坏 CI 守门员（`tsc --noEmit` 在 CI 中必跑）；不修不能 [023.13] 收口 |

## 修复建议

```ts
// 1. appointment-actions.test.ts
//    - 删 markInProgressAppointment/markExpiredAppointment 测试
//    - 删 inProgressAt/expiredAt 字段引用（如 fixture 里有 mock 数据需要清）

// 2. okr-actions.test.ts
//    - getActiveCycles 期望改:fixture 用 status: 'approved' 替代 'in_progress'
//    - 断言:确认返回数组含 approved 状态周期,不再断言 in_progress

// 3. timebox-card.test.tsx:91
//    - fixture shape 同步 DetailedExecutionRecord 新 fields
//    - 查 usom/types/objects.ts ExecutionRecord 现状（实际为 plan + actualOutput + completionRating 等）,匹配 shape
```

## 预防

- **SDD subagent 完每个 task 后必跑 `npx tsc --noEmit` 全量**（不限受影响子集）,type 错暴露在早期。
- **plan-eng-review 应加一条**："测试 fixture 引用被删字段/状态时,必须同步,不允许'只改生产代码'。"纳入 §3 SDD 模式。

## 关联

- [[TD-018]] — 2（pre-existing）generic-repo-adapter 错同源（adapter 切写入口后的连锁）
- [[TD-017]] — 1（timebox.ts + intent.ts 漏跟 status）也同源
- [[memory/lifeware-dev-learnings]] — 后续 task 注意 test fixture 同步

## 关闭条件

- tsc 全量 0 新增（与 baseline 103 对齐）
- 3 个 test 文件 fixture 与新 status/字段 schema 对齐
- vitest 这 3 个文件 PASS
