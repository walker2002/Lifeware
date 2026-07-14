---
id: TD-042
title: mapper ↔ USOM Type 字段对齐缺 lint 守护（TD-003 I-4 防御半成品）
status: 登记
created: 2026-07-14
last_updated: 2026-07-14
---

# TD-042: mapper ↔ USOM Type 字段对齐缺 lint 守护（TD-003 I-4 防御半成品）

> 摘要：[TD-003] whole-branch review (commit `44cfde4`, 2026-07-12) 加了 state-machine "I-4 防御性 re-read" 依赖 `timeboxRowToUSOM` mapper 携带 `occVersion`，但 mapper 当时没同步声明；本次 session 手动修复 mapper + execution-record-persistence test mocks。**无 CI lint 守护下次回归会再发**——属于 defense-in-depth 半成品 + process gap。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium |
| 类别 | 测试 / 流程 |
| 领域 | `cross-domain`（USOM ↔ mapper 治理） |
| 录入版本 | v0.X.X ([TD-003] follow-up) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | `fix/td-003-occ-version`（[TD-003] whole-branch review commit `44cfde4`） |
| 关联 Constitution 条款 | N/A |

## 现象（What）

[TD-003] whole-branch review I-4 提交时增加 `state-machine/index.ts:316-321` 防御性 re-read：

```typescript
const reRead = await repo.findById(objectId!, userId, tx)
const currentOccVersion = (reRead as { occVersion?: number } | null)?.occVersion ?? -1
if (currentOccVersion < 0) {
  throw new Error(`[TD-003 I-4] Timebox ${objectId} 找不到，logged transition 失败`)
}
```

该防御**假设** `timeboxRowToUSOM` 携带 `occVersion` 字段，但 mapper 当时没声明 `occVersion`，导致 baseline main 上：
- 用户实际行为：[TD-003 I-4] "Timebox 找不到" 错误提示 + DB status 实际变更（orchestrator.execute 路径无 tx 包装）
- 测试 baseline：`execution-record-persistence.test.ts` 2 个 case 已 RED 3 天（直到 2026-07-14 user 报障才发现）
- CI / pre-push hook：均未拦截

## 根因（Why）

1. **defense-in-depth 加固时未做 cross-path 数据验证**：I-4 加 re-read 时未确认 mapper 实际携带 `occVersion`，属于"加防御但未验证防御依赖"的常见反 pattern
2. **测试 mock 与 mapper 实现不同源**：测试用 `makeMockRepo` 手写 store，绕过 mapper；mock 不带 `occVersion` → re-read 拿到 undefined → 抛错 → 测试 RED。但 mock 改动未与 mapper 改动同步
3. **缺 lint/CI 守护**：无脚本验证 "state-machine 引用 USOM 字段 X ↔ mapper 携带字段 X ↔ DB schema 列 X" 三方对齐
4. **pre-push hook 不捕此类错误**：`validate:manifest` / 结构验证 / vitest 不一定跑全；pre-push 的 vitest 可能仅跑 touched files

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 用户在 /timeboxes 一键打卡报错（"操作失败：[TD-003 I-4] Timebox 找不到"）+ 状态实际变更（半成功），体验极差 |
| 用户 | 3 天延迟发现（[TD-003] merge 2026-07-12 → 用户报障 2026-07-14） |
| 技术 | defense-in-depth 半成品；同类隐患可能在 5 域 cross-domain OCC（[TD-037]）扩展时再次发生 |
| 范围 | mapper / state-machine / tests 三方需协同改动 |
| 严重性依据 | 已有先例 + 跨域扩展将放大 + 无守护机制 |

## 触发场景（When）

- 触发条件：任何 state-machine 新增依赖 USOM 字段 X 的防御 / re-read 逻辑
- 复现步骤：grep `reRead\.` `findById.*\?\?` 模式 vs `timeboxRowToUSOM` 字段列表 diff
- 出现频率：每次 state-machine 加防御 / cross-domain OCC 扩展（TD-037）必踩

## 临时方案（Workaround）

- 本次 session 手动同步修复 mapper + mock（commit pending）
- 后续 review pass 显式检查"defense-in-depth 改动 → mapper 字段同步"

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：写 lint 脚本 `scripts/lint/mapper-usom-alignment.ts`
  - 解析 `lib/db/repositories/mappers.ts` 所有 `*RowToUSOM` 函数体
  - 解析 `usom/types/objects.ts` 所有 `interface XXX`
  - diff 输出 "row 有 X 字段但 USOM 缺" / "USOM 有 X 字段但 row/mapper 缺"
  - 加进 pre-push hook（与 `validate:manifest` 并列）
- **方案 B**：vitest global setup 增加 "mapper ↔ schema" round-trip test，遍历所有 `*RowToUSOM` 验证至少每个 USOM 必填字段都能从 row 映射
- **方案 C（最小）**：本次 session 的 mapper occVersion 修复 + mock 修复合并 review pass 显式过 mapper/usom 对齐 check（一次性，但 TD-037 扩展时仍会漏）

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 1-2 人日（方案 A：脚本 + hook 集成 + 9 个 mapper 验证） |
| 风险 | 低（脚本只 lint 不改逻辑；初始阶段允许白名单） |
| 依赖 | 无；可独立 ship |

## 关联债

- 触发债：[TD-003] whole-branch review commit `44cfde4`（已 ship）
- 平行债：[TD-037] 5 域 cross-domain OCC deferred（同类隐患将在 5 域扩展时再次爆发）
- 平行债：[TD-041] USOM Timebox rename mapper migration debt（同类 mapper↔USOM 漂移）
- 同类历史债：[TD-018] pre-existing write entry chain debt