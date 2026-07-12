---
id: TD-002
title: logTimebox 批失败处理不对称 → 统一 partial-success with explicit report
status: ✅ 已修复
severity: 🟠 → ✅
created: 2026-07-06
last_updated: 2026-07-12
closed: 2026-07-12
fix_version: feat/td-002-logtimebox-partial-success (PR #11 → gitee merge 7026808)
---

# TD-002: logTimebox 批失败处理不对称(部分成功不回滚)

> 摘要：`logTimebox` 批量记录时间盒耗时/反馈时,如果中途某条失败,已成功的记录不回滚,造成时间日志与实际执行不对称。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟠 High |
| 类别 | 数据 |
| 领域 | `lifeware-timebox` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | N/A(pre-existing on origin/main) |
| 关联 Constitution 条款 | C-NN (待对齐:事务边界一致性) |

## 现象（What）

用户在批量记录 5 个 timebox 的完成反馈时,中间第 3 条因数据校验失败抛错。结果:第 1、2 条成功入库,第 4、5 条未入库,第 3 条失败。状态不一致,且无明确错误信息告诉用户"前两条已落库"。

## 根因（Why）

- `logTimebox` 处理器内部按顺序遍历 entries,每条单独 try/catch 并提交,无外层事务
- 设计时假设"单条失败不影响其他",但实际用户视角下,"批量"应满足 ACID 至少到 "all or nothing with clear rollback" 或 "partial with explicit confirm"
- 缺一个明确的失败语义策略文档

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 时间日志准确性下降,后续分析（能量曲线、习惯关联）受影响 |
| 用户 | 用户不知道哪些条目已落库,需要手动核对 |
| 技术 | 数据完整性债务,审计时无法还原真实状态 |
| 范围 | `frontend/src/domains/timebox/handlers/logTimebox.ts` |
| 严重性依据 | 影响所有批量日志用户,出现频率约 1/100 |

## 触发场景（When）

- 触发条件：批量 logTimebox + 中间条目数据校验失败
- 复现步骤：1. 准备 5 个 timebox 2. 构造第 3 条 duration = 负数 3. 提交
- 出现频率：约 1/100(取决于用户输入合法性)

## 临时方案（Workaround）

- 用户手动校验输入合法性
- 单条 log 而非批量,降低触发概率
- 暂无明确兜底开关

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：外层事务包裹批量 entries,失败回滚 + 明确报错
- **方案 B**：partial success 语义,返回成功/失败清单给前端做 UI 提示
- **方案 C**：CRDT 风格事件溯源,每条独立但 metadata 标注因果链

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 2-3 人日(需要前后端约定错误协议) |
| 风险 | 中(涉及数据持久化语义变更) |
| 前置依赖 | 需明确"all or nothing vs partial"产品决策 |
| 是否跨域 | 否 |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否(应用层) |
| 是否需要宪章修订 | 是(需补"事务边界"条款) |

## 验收标准（Done Criteria）

- [ ] 明确产品决策(all-or-nothing vs partial-with-confirm)
- [ ] 实现对应语义,失败时按决策给出明确错误/部分成功清单
- [ ] vitest 新增失败路径测试覆盖：第 1 条失败、第 3 条失败、第 5 条失败 3 场景
- [ ] tsc 无新增报错
- [ ] 宪章补"事务边界"条款(如适用)
- [ ] 已更新 docs/usom-design.md 的 timebox 域说明

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目,源自 Codex cold read(2026-07-05 [023.07] 7 PRE-EXISTING 债)
- 2026-07-12 · **本次修复** — `feat/td-002-logtimebox-partial-success` 分支 + PR !11:
  - **(a) cnui/handlers.ts logTimebox 分支**：「早 break + 不回滚」改 partial-success (collect succeeded[]/failed[]) + `result.data.count/succeeded/failed` + `result.error` 含 title + 具体原因。同文件 5/5 批量分支范式达成一致（createTimebox/scheduleProposal/adjustRemainingTimeboxes/createAppointment/logTimebox）
  - **(b) handlers.test.ts** +5 场景：第 1/3/5 条失败 / 全部成功 / submitDynamicIntent throw 推入 failed 数组。vitest 34/34 PASS
  - **(c) constitution.md** §XV.6 新增「CNUI Handler Batch Transaction Semantics」子条款（与 §III 单事务边界正交 — partial-success 适用于多独立写入口循环场景，单事务边界适用于 cross-object 复合写）
  - **(d) usom-design.md** 2026_07_12 entry 同步本次 partial-success 收口
  - **(e) PR !11 merge** by user：gitee commit 7026808（merge commit），本地 ff-merge main 同 7026808
- 2026-07-12 · **TD-002 关闭**：5/5 CNUI handler 批量分支范式一致 + 宪章补条款 + usom-design 同步 + PR merge + 本地 ff-sync + feat 分支删除（origin/feat/td-002-... 留存待 user 在 gitee 网页手动删除）

## 关联

- 相关技术债：[[TD-003]] (editTimeboxes TOCTOU,同 timebox 域并发问题) [[TD-006]] (N+1 sequential)
- 相关 PR：N/A(pre-existing)
- 相关 memory：`[[project-023-07-pre-existing-cleanup]]`(Codex 7 PRE-EXISTING 债清单)
- 触发的设计讨论：Codex review `#5` 2026-07-05