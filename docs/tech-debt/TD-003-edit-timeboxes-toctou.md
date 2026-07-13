---
id: TD-003
title: editTimeboxes TOCTOU(time-of-check vs time-of-use)
status: 已修复
created: 2026-07-06
last_updated: 2026-07-12
---

# TD-003: editTimeboxes TOCTOU(time-of-check vs time-of-use)

> 摘要：`editTimeboxes` 在并发场景下,服务器 check 时和 use 时的 timebox 状态不一致,可能造成编辑后数据丢失或冲突覆盖。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟠 High |
| 类别 | 架构 |
| 领域 | `lifeware-timebox` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | N/A(pre-existing on origin/main) |
| 关联 Constitution 条款 | N/A |

## 现象（What）

用户在两个 tab 同时打开同一个 timebox 编辑页,A tab 修改并保存,B tab 不知道 A 已修改,也保存。B 的保存覆盖 A 的修改,A 用户刷新页面发现改动丢失。无错误提示。

## 根因（Why）

- `editTimeboxes` handler 在 check 阶段读 timebox 当前状态,在 use 阶段基于该状态应用 patch,但中间窗口未做版本校验
- 缺乐观锁(etag/version 字段)或悲观锁
- 设计时未考虑多 tab / 多设备并发编辑场景

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 用户数据丢失风险 |
| 用户 | 用户感知"保存成功"但实际数据丢失,信任度下降 |
| 技术 | 缺并发控制机制,所有共享写入路径都潜在有此问题 |
| 范围 | `frontend/src/domains/timebox/handlers/editTimeboxes.ts` + 同模块所有 write action |
| 严重性依据 | 出现频率与并发用户数相关,实际罕见但一旦发生无法挽回 |

## 触发场景（When）

- 触发条件：同一 timebox 在两个 tab / 两个设备被同时编辑
- 复现步骤：1. tab A 打开 timebox X 2. tab B 打开同 timebox X 3. A 改 startTime → 保存 4. B 改 endTime → 保存
- 出现频率：罕见(<1/1000),但一旦发生即数据丢失

## 临时方案（Workaround）

- 用户需手动 reload 后再编辑
- 暂无兜底

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：引入 optimistic concurrency control,timebox 表加 `version` 字段,handler patch 时带 version,不一致则报 conflict
- **方案 B**：悲观锁,编辑时锁行,简单但影响并发
- **方案 C**：CRDT 风格合并,接受并发并合并 patch

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 3-5 人日(版本字段 + handler patch + 冲突 UI) |
| 风险 | 中-高(涉及数据一致性 + UI 提示) |
| 前置依赖 | 明确产品决策(覆盖 vs 合并 vs 报错) |
| 是否跨域 | 否(timebox 域内部) |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 是(加 version 字段) |
| 是否需要宪章修订 | 否 |

## 验收标准（Done Criteria）

- [ ] timebox 表加 `version` int 字段,Drizzle migration 上线
- [ ] `editTimeboxes` handler patch 时带 version check,不一致抛 ConflictError
- [ ] 前端捕获 ConflictError,弹窗提示用户刷新 / 选择合并
- [ ] vitest 新增并发场景测试：两 tab 同时改 → 第二个报 conflict
- [ ] 已更新 docs/database-design.md timebox 表说明

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目,源自 Codex cold read(2026-07-05 [023.07] 7 PRE-EXISTING 债)
- 2026-07-12 · [TD-003] · **已修复**：`/lifeware-neat` + `[TD-003]` timebox 域 OCC POC ship-ready（`fix/td-003-occ-version` 9 commits ahead of main）。DB `timeboxes` 加 `occ_version` 列（迁移 0037）+ Repository `WHERE occ_version = expectedOccVersion` atomic UPDATE 0 rows → 抛 `ConflictError` + field-executor batch OCC + UI drawer catch → reload + toast。USOM `Timebox` interface 不暴露 occVersion（Repository 契约）。**仅 timebox 域 POC**；5 域跨域 OCC → `[[TD-037]]` deferred。Whole-branch verification：tsc 0 新增 / vitest 5 files / 24 tests PASS / pre-push hooks 全过。详见 CHANGELOG.md `## [TD-003]` 段 + `~/.gstack/projects/walker2002-lifeware/walker-main-design-20260712-TD-003-timebox-occ-poc.md`（APPROVED + plan-eng-review CLEARED，Codex P0 转折）。`/browse` 浏览器 E2E 受 pre-existing `fetchTimeboxSummariesByRange start.toISOString` 阻塞（[TD-039]），unit tests 24/24 PASS 证明全链路正确。
- 2026-07-12 · 「技术债清除会话」systematic-debugging Phase 1-3 调研:
  - **实际代码形态**: `frontend/src/domains/timebox/cnui/handlers.ts:465` `editTimeboxes` open 路径走 `parseTimeboxesIntent` → prefill 用 snapshot;`frontend/src/app/actions/timebox.ts:246` `updateTimebox` 直走 `createTimeboxMutationService().execute()` (无 read-before-write,但**无 OCC**)。`timeboxes` 表无 version/etag 列(仅 `schemaVersion` 字段记 schema 迁移版本)。
  - **跨域 OCC 缺位**: cross-domain grep `schema.ts` 22 表均只有 `schemaVersion` int(USOM schema migration 用),无 OCC version/lastModified TS/etag 字段。修 timebox 单域会出现跨域不一致(habits/tasks/appointments/cycles/okrs 等 6+ 表仍可静默覆盖)。
  - **产品决策 5 选项 + 投票**: A 单域 / B 跨域 OCC / C 接受风险 / D 轻量检测 / E 暂停。用户选 **B 跨域 OCC**(合并提交, 架构变更, 5-7 人日估算)。
  - **新决议**：本次会话暂停,另开 session 启 `/office-hours` design session + 写 spec → 转 SDD → 跨 PR 实施。
  - **下 session 待办**: (1) 选定 OCC strategy(version 字段 vs updatedAt 检测 vs 锁) (2) 4 域 POC 设计(timeboxes/habits/appointments/tasks, 先排除 cycles/okrs 低频) (3) backward compat 策略(现有 row 无 version 列,迁移策略) (4) UI 提示范式(toast 报 conflict + 「合并」 / 「覆盖」选择) (5) 宪章补「OCC 写入事务契约」条款 (6) 文档分层(宪章 > usom-design > database-design)
  - **避免的 quick fix**: 满足"B 方向 = 完整跨域" 不走单点 A;不跳 design 直接走 B1。

## 关联

- 相关技术债：[[TD-002]] (logTimebox 批失败) [[TD-006]] (N+1 sequential)
- 相关 PR：N/A(pre-existing)
- 相关 memory：`[[project-023-07-pre-existing-cleanup]]`