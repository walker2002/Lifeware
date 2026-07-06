---
id: TD-010
title: I-1 synthesized action 'update_timebox' 不在 manifest lifecycle
status: 登记
created: 2026-07-06
last_updated: 2026-07-06
---

# TD-010: I-1 synthesized action 'update_timebox' 不在 manifest lifecycle

> 摘要：`update_timebox` 是 rule engine 在某路径下合成的 action,但不在 manifest 声明的 lifecycle 状态机内。rule 不读无害,但非 SSOT。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟢 Low |
| 类别 | 架构 |
| 领域 | `lifeware-timebox` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | N/A |
| 关联 Constitution 条款 | C-NN(USOM manifest SSOT) |

## 现象（What）

`rules-registry.ts` 中某 rule 触发时合成 `update_timebox` action 推送给 orchestrator,但 `manifest.yaml` 的 `timebox.lifecycle.actions` 列表未声明该 action。rule 自身有判断 `if (!isRegistered) return`,所以不执行,但 SSOT 视角下这是"幽灵 action"。

## 根因（Why）

- [023.04] timebox CNUI 优化期间,某条 rule 临时合成该 action 测试,后未清理
- [023.04] 整体 ship 时未把该 action 正式入 manifest
- rule 的容错(`if (!isRegistered) return`)掩盖了 SSOT 漂移

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 无用户影响(rule 不触发该 action) |
| 用户 | 无 |
| 技术 | SSOT 漂移,后续维护者难判断该 action 是否应被支持 |
| 范围 | `frontend/src/nexus/rules-registry.ts` + `manifest.yaml` |
| 严重性依据 | 仅为 SSOT 一致性问题 |

## 触发场景（When）

- 触发条件：阅读 manifest 或 rules-registry 试图理解 action 全集
- 复现步骤：grep `update_timebox` 在两文件中,对比
- 出现频率：人工排查时

## 临时方案（Workaround）

- rule 容错已兜底

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：从 rules-registry 中删除该合成 action(若不再需要)
- **方案 B**：补入 manifest(若确实需要)
- **方案 C**：维持现状,加注释说明

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 0.2 人日 |
| 风险 | 低(单文件改动,rule 容错兜底) |
| 前置依赖 | 确认是否需要该 action |
| 是否跨域 | 否 |
| 是否影响 manifest | 是 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否 |

## 验收标准（Done Criteria）

- [ ] grep `update_timebox` 在 rules-registry 与 manifest 一致(都存在或都不存在)
- [ ] validate:manifest 0 errors
- [ ] vitest 回归通过

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目,源自 [023.04] plan-eng-review 的 21 findings I-1

## 关联

- 相关 PR：[023.04] commit `581809b`
- 相关 spec/plan：`docs/superpowers/plans/2026-07-04-023-05-1-timebox-schedule-cleanup.md` 收尾段
- 相关 memory：`[[project-023-04-cnui-optimization]]`(I-1 defer)