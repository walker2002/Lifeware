---
id: TD-041
title: USOM Timebox rename 迁移债（mapper 用 row 列名，TS 4 errors baseline）
status: 登记
created: 2026-07-14
last_updated: 2026-07-14
---

# TD-041: USOM Timebox rename 迁移债（mapper 用 row 列名，TS 4 errors baseline）

> 摘要：`timeboxRowToUSOM` mapper (mappers.ts:374) + `timeboxUSOMToRow` (mappers.ts:400-402) 仍使用 row 列名 `startedAt`/`overtimeAt`/`endedAt`，但 USOM `Timebox` 接口已 rename（按 [[TD-003]] T6 AM6 文档约定），TS 2353/2339 4 个错误 baseline pre-existing，CI 长期忽略。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟠 High |
| 类别 | 数据 |
| 领域 | `lifeware-timebox` |
| 录入版本 | v0.X.X ([TD-003] follow-up) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | N/A（pre-existing baseline） |
| 关联 Constitution 条款 | N/A |

## 现象（What）

`cd frontend && npx tsc --noEmit` baseline 报 4 个 pre-existing 错误（与 mapper occVersion 修复无关）：

```
src/lib/db/repositories/mappers.ts(374,5): error TS2353: Object literal may only specify known properties, and 'startedAt' does not exist in type 'Timebox'.
src/lib/db/repositories/mappers.ts(400,31): error TS2339: Property 'startedAt' does not exist on type 'Timebox'.
src/lib/db/repositories/mappers.ts(401,32): error TS2339: Property 'overtimeAt' does not exist on type 'Timebox'.
src/lib/db/repositories/mappers.ts(402,29): error TS2339: Property 'endedAt' does not exist on type 'Timebox'.
```

`Timebox` USOM 接口（objects.ts:615）当前已不含 `startedAt/overtimeAt/endedAt` 字段（仅保留 `loggedAt`），但 mapper 函数体仍 spread 这些字段。

## 根因（Why）

[TD-003] T6 AM6 已约定 USOM TS 字段 rename（startedAt→approvedAt、endedAt→finishedAt）但 mapper 实际 key 未迁移；AM1 注释明确写："AM1 不在 T6 scope"。后续 4 commits (T2 updateFields / T4 OCC / T5 archive / I-4 re-read) 均未触及 mapper TS 字段迁移。

mappers.ts:374 mapper 函数体 `startedAt: toISO(row.startedAt)` — 错配 USOM
mappers.ts:400-402 `timeboxUSOMToRow` spread 同样错配
DB schema 列名仍是 `started_at`/`ended_at`（T1b 才改）

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 隐藏 — 运行时正常（drizzle 自动 snake→camel 列名映射不依赖 mapper TS 类型） |
| 用户 | 无直接影响 |
| 技术 | tsc baseline 永远不干净；CI lint 守护漂移；后续改动若真触及 USOM Timebox TS 字段可能踩坑 |
| 范围 | `frontend/src/lib/db/repositories/mappers.ts` 4 处 + USOM 类型一致性 |
| 严重性依据 | 持续阻塞 TS baseline / rename 半完成状态 / 后续修复成本递增 |

## 触发场景（When）

- 触发条件：任何 tsc --noEmit / IDE TS check / pre-push hook
- 复现步骤：`cd frontend && npx tsc --noEmit | grep "mappers.ts"`
- 出现频率：100%（每次 tsc 都报）

## 临时方案（Workaround）

- 无 — 已知 baseline 错误被忽略
- 已在 baseline-check scripts 中容忍（不强 fail）

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：mapper 同步 USOM TS rename — mapper 函数体改为 `approvedAt: toISO(row.startedAt), finishedAt: toISO(row.endedAt), ...`（DB 列仍留旧名 `started_at`，仅 mapper USOM 端 rename）；同时评估是否 T1b 同步 DB 列 rename
- **方案 B**：回滚 USOM rename 把 `startedAt/overtimeAt/endedAt` 加回 `Timebox` 接口，保留旧命名（向后退一步，等后续统一 rename）

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 0.5 人日（仅 mapper + 类型同步） |
| 风险 | 中（需核对 Timebox 全链路 startedAt 用法是否真有 rename 影响） |
| 依赖 | T6 AM6 rename 是否已被下游消费验证 |

## 关联债

- 上游约束：[TD-003] T6 AM6 USOM TS 字段 rename 文档
- 同类债：TD-008 (lifecycle-configs require multikey)、TD-018 (pre-existing write entry chain)