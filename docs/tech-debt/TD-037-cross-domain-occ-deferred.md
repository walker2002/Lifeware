---
id: TD-037
title: 5 域 cross-domain OCC deferred (lifecycle writes + update() 路径)
status: 登记
created: 2026-07-12
last_updated: 2026-07-12
---

# TD-037: 5 域 cross-domain OCC deferred (lifecycle writes + update() 路径)

> 摘要：[TD-003] POC 仅 timebox 1 域 Repository OCC ship，5 域 lifecycle writes（cancel/log/revert via SM）+ 5 域 update() 单字段写路径 OCC deferred。已知兑现路径：batch fields + single atomic UPDATE pattern（[TD-003] T3 已 ship）+ ConflictError 域归属（timebox-local）。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟠 High |
| 类别 | 架构 |
| 领域 | cross-domain (5 域) |
| 录入版本 | v0.X.X ([TD-003]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | N/A（[TD-003] 已 ship 后 follow-up） |
| 关联 Constitution 条款 | N/A |

## 现象（What）

[TD-003] POC 完成 timebox 1 域 OCC 防护（Repository `updateFields` 加 `expectedOccVersion` + WHERE 谓词 + field-executor batch OCC），但跨域 5 域（habits/tasks/appointments/cycles/okrs）相关写入路径 OCC 仍缺位：

1. **5 域 lifecycle writes**：`repo.updateStatus` / `repo.save` / `repo.updateFields`（不传 `expectedOccVersion` 调用）—— 走 SM lifecycle write 不经 [TD-003] OCC 防护。
2. **5 域 `update()` 单字段写路径**：`nexus/domain-mutation-service/index.ts` `update()` 直接 `repo.updateFields(id, { [field]: value }, userId)` 不经 Repository OCC 谓词。
3. **writer boundary gap**：state-machine 直接调 `repo.updateFields` / `repo.updateStatus` / `repo.save` 不经过 OCC 校验。
4. **ConflictError 域归属**：当前 timebox-local（`domains/timebox/errors/occ-conflict-error.ts`），未来 5 域实施 OCC 时是各自实现一个还是抽到 USOM 共享？

## 根因（Why）

[TD-003] POC scope 是「timebox 1 域 Repository OCC ship」，其他 5 域未实施：

- 5 域 lifecycle writes 是 MVP 常见路径（用户点 cancel / log / revert 按钮），并发概率低（<1/1000），但仍可静默覆盖
- 5 域 `update()` 单字段写路径用于字段级校验场景（单字段 fact mutation），并发触发概率同 lifecycle writes
- 设计原因：[TD-003] P1 reversal 选择 1 域 POC 验证可行性，避免 scope 扩张到 5-7 人日跨域 OCC

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 5 域 lifecycle + update() 路径并发仍可静默覆盖（罕见） |
| 用户 | 数据丢失风险（一旦发生无法挽回） |
| 技术 | writer boundary gap 仍存：lifecycle writes 与 field writes 用不同写入口 |
| 范围 | `frontend/src/nexus/domain-mutation-service/` + 5 域 `repository/` + 5 域 `state-machine/` 集成 |
| 严重性依据 | MVP 单用户并发触发概率低，但 [TD-003] 已 ship 后若不跟进，技术债扩散 |

## 触发场景（When）

- 触发条件：5 域 lifecycle writes 或 update() 路径在同一 row 两 tab/设备并发
- 复现路径：tab A 改 habit 名称 + save（走 lifecycle write），tab B 同时改 habit 完成次数 + save（走 update() 路径），B 静默覆盖 A 的名称
- 出现频率：罕见（<1/1000），但单用户场景下 1-2 次/季度

## 临时方案（Workaround）

- 用户需手动 reload 后再编辑
- 暂无兜底（[TD-003] 仅 timebox 域防护）

## 理想修复（Ideal Fix）

**已知兑现路径**（[TD-003] T3 已 ship pattern）：

1. **5 域 `updateFields` 接口加 `expectedOccVersion`**：所有 `ITimeboxRepository` / `IHabitRepository` / 等 interface 加参数
2. **5 域 lifecycle writes 透传 expectedOccVersion**：`state-machine` 内部调 `repo.updateStatus`/`repo.save`/`repo.updateFields` 前先 read current occVersion 透传
3. **5 域 `update()` 单字段写路径 OCC**：`nexus/domain-mutation-service/update()` 接受 optional `expectedOccVersion`，透传到 field-executor.batch
4. **5 域 update() 路径的 callsite 同步**：`updateHabit`/`updateTask`/`updateAppointment`/`updateObjective` 等 5 域 action 加 read+透传
5. **ConflictError 跨域归属决策**：(a) 各域各自实现一个 + USOM 共享 interface；(b) 抽到 USOM 共享 class；(c) 抽到 nexus 层
6. **failure mode**：OCC 抛 ConflictError 时 lifecycle 写入口降级为 generic error → UX 兜底 toast + reload（同 [TD-003] T5 drawer 模式）

预计 effort：M (5-7 人日，5 域 + 2 path + 1 ConflictError 决策)

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 5-7 人日（5 域 × 2 path + ConflictError 决策，每 path ~1-1.5 人日） |
| 风险 | 中-高（writer boundary gap 跨 nexus + per-domain state-machine） |
| 前置依赖 | [TD-003] POC 已 ship + 1+ 季度真实并发数据 |
| 是否跨域 | 是（5 域 + nexus state-machine） |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 是（5 表各加 `occ_version` 列，复用 [TD-003] T1 pattern） |
| 是否需要宪章修订 | 否（OCC 是实现细节） |

## 验收标准（Done Criteria）

- [ ] 5 表（habits/tasks/appointments/cycles/okrs）各加 `occ_version` 列 + migration
- [ ] 5 域 `updateFields` 接口加 `expectedOccVersion` 参数 + WHERE 谓词 + ConflictError（[TD-003] T2 pattern）
- [ ] 5 域 `update()` 单字段写路径 OCC（[TD-003] T3 pattern）
- [ ] 5 域 lifecycle writes（cancel/log/revert via SM）透传 expectedOccVersion
- [ ] 5 域 UI 拦截 ConflictError + reload + toast（[TD-003] T5 pattern）
- [ ] ConflictError 跨域归属决策落地
- [ ] vitest 5 域各 4 测试（串行 OK / stale conflict / 3-tab 并发 / 老 row migration OK）
- [ ] docs/database-design.md 5 表 schema 说明加 occ_version 字段

## 跟踪记录（History）

- 2026-07-12 · [TD-003] · 创建条目，源自 plan-eng-review Codex P1.4 writer boundary gap
  - **触发场景**：plan-eng-review Codex cold read 抓 writer boundary gap（5 域 lifecycle writes via SM bypass execute()）
  - **scope 决策**：[TD-003] P1 reversal 选择 1 域 POC，本债 P6 follow-up 登记 5 域剩余
  - **已知兑现路径**：[TD-003] T3 field-executor batch OCC pattern 复用
  - **commit 关系**：[TD-003] T6 commit（`fix/td-003-occ-version` branch）
  - **pre-push hooks**：`validate:manifest` 0 errors + `validate:domain-structure` ✓

## 关联

- 相关技术债：[[TD-003]]（[TD-003] 已 ship，本债 P6 follow-up）
- 相关 memory：`[[project-TD-003-plan-eng-review]]`（Codex 简化方案 + writer boundary gap 发现）
- 相关 design：`walker-main-design-20260712-TD-003-timebox-occ-poc.md`
- 相关 plan：`docs/superpowers/plans/2026-07-12-TD-003-timebox-occ-poc.md`