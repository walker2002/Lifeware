---
title: 技术债务跟踪
last_updated: 2026-07-12
---

# 技术债务跟踪（Tech Debt Ledger）

> 本目录是 Lifeware 项目的**跨版本技术债务单一真相源**（SSOT）。每次 ship / 完成 PR / 录入版本时，由 Claude 配合 `/record-tech-debt` skill 录入。

## 用途

- 防止「现在先这样，以后再修」变成「永远不修」
- 提供给 `/plan-ceo-review` `/plan-eng-review` 优先级排序的输入
- 季度/半年度技术债回顾的盘点基础
- 跨版本回归追踪：某个债曾经修过，但又被某次重构挖出来

## 命名与文件结构

- **模板**：`docs/tech-debt/_template.md`
- **实例**：`docs/tech-debt/TD-NNN-{slug}.md`（NNN 全局 3 位递增，**永不重用**）
- **索引**：本文件（README.md）

## 索引（按状态分组）

### 🆕 新建（未启动修复）

| 编号 | 标题 | 严重性 | 领域 | 录入版本 | 负责人 |
|---|---|---|---|---|---|
| TD-014 | Claude Code settings.json schema 顶层严格,自定义 key 整个文件加载失败 | 🟢 | infra | N/A（工具链债） | 暂未指派 |
| TD-015 | Claude Code 内置 /review shadow gstack /review skill | 🟢 | infra | N/A（工具链债） | 暂未指派 |
| TD-031 | [026.02.4] post-T5 review:use-auto-trigger.ts 双分支 planned gate 可能同 cycle 双 fire start + overtime | 🟡 → ✅ | lifeware-timebox | [026.02.4] post-T5 → [026.02.4-r3] closed | 暂未指派 |
| TD-033 | TimeboxRepository.updateFields 同模式未修：startTime/endTime 也是 timestamp 列（[026.02.4] 后系统性调试发现） | 🟠 | lifeware-timebox | [026.02.4] 后 hot-fix 债 | 暂未指派 |
| TD-034 | TaskRepository/ObjectiveRepository updateFields 同模式未验证：dateOnly 列 Drizzle 行为待实测 | ⚪ | cross-domain | [026.02.4] 后 hot-fix 债 | 暂未指派 |
| TD-035 | updateFields 通用归一化 helper 缺失：4 域 repo 各自分散归一化，新域必再踩同坑 | 🟡 | cross-domain | [026.02.4] 后 hot-fix 债 | 暂未指派 |
| TD-036 | [028.2] 9 项 ship-then-polish backlog + 3 项 meta-pattern 债（I-3 + 7 Minor + M-qa-1 + mock-vs-real + GenerationResult type-pun + ISO↔HH:MM 抽象） | 🟠 | lifeware-timebox | [028.2] 2026-07-12 | 暂未指派 |

### 📌 登记（已纳入待办）

| 编号 | 标题 | 严重性 | 领域 | 录入版本 | 负责人 |
|---|---|---|---|---|---|
| TD-003 | editTimeboxes TOCTOU(time-of-check vs time-of-use) | 🟠 | lifeware-timebox | [023.10] | 暂未指派 |
| TD-004 | R4 timebox/okrs 写入口债(跨域规则未落地) | 🟠 | cross-domain | [023.10] | 暂未指派 |
| TD-005 | MVP_USER_ID 硬码(占位用户身份未走认证) | 🟡 | infra | [023.10] | 暂未指派 |
| TD-006 | orchestration N+1 sequential 查询(应批处理或并行) | 🟡 | lifeware-timebox | [023.10] | 暂未指派 |
| TD-007 | Suspend action 完整 CNUI 回环未闭环(双注册缺一层) | 🟡 | lifeware-tasks | [023.10] | 暂未指派 |
| TD-008 | lifecycle-configs require('@/...') 多键域债(resolve/transition 仍动态) | 🟡 | cross-domain | [023.10] | 暂未指派 |
| TD-017 | [023.12] 生产代码漏跟 status 收窄：timebox.ts + intent.ts 9 条 tsc 错 | 🔴 | lifeware-timebox | [023.12] | 暂未指派 |
| TD-016 | [023.12] 测试 fixture 漏改：status 收窄后 9 条 tsc 错(3 文件) | 🟠 | cross-domain | [023.12] | 暂未指派 |
| TD-016 | [023.12] 测试 fixture 漏改：status 收窄后 9 条 tsc 错(3 文件) | 🟠 | cross-domain | [023.12] | 暂未指派 |
| TD-017 | [023.12] 生产代码漏跟 status 收窄：timebox.ts + intent.ts 9 条 tsc 错 | 🔴 | lifeware-timebox | [023.12] | 暂未指派 |
| TD-018 | [023.12] pre-existing 写入口连锁债：tasks/hooks.ts 死 action + 2 测试 fixture | 🟡 | cross-domain | [023.12] | 暂未指派 |
| TD-019 | STATUS_TRANSITION_ACTIONS 漂移：revert 漏注册 100% 阻断「回退」按钮 | ✅ | lifeware-timebox | [023.12] hot-fix → [023.13] 关闭 | 暂未指派 |
| TD-023 | timebox 写入口绕过 mutation service：revertTimebox 直调 repo.updateFields 写列 (AM3 reuse) | 🟡 | lifeware-timebox | [023.13] | 暂未指派 |

### 🛠 修复中

| 编号 | 标题 | 严重性 | 领域 | 录入版本 | 负责人 |
|---|---|---|---|---|---|

### ⏸ 搁置（暂不修）

| 编号 | 标题 | 严重性 | 领域 | 录入版本 | 搁置原因 |
|---|---|---|---|---|---|

### 🟢 已修复

| 编号 | 标题 | 严重性 | 领域 | 录入版本 | 修复版本 | 关闭日期 |
|---|---|---|---|---|---|---|
| TD-019 | STATUS_TRANSITION_ACTIONS 漂移：revert 漏注册 100% 阻断「回退」按钮（A1 派生 + A2 pre-push validator 落地） | 🔴 → ✅ | lifeware-timebox | [023.12] hot-fix | [023.13] | 2026-07-07 |
| TD-001 | useOrchestrationRecommendations hook 不存在 → [028.2] handleAiConfirm 3 分支真接 submitCnuiSurface + openAiPanel 真接 onGenerate | 🟠 → ✅ | lifeware-timebox | [023.10] | [028.2] | 2026-07-12 |
| TD-002 | logTimebox 批失败处理不对称 → 统一 partial-success (PR #11 收口 CNUI handler 5/5 范式一致 + 宪章 §XV.6) | 🟠 → ✅ | lifeware-timebox | [023.10] | feat/td-002 + PR #11 | 2026-07-12 |
| TD-031 | use-auto-trigger 双分支 planned gate 同 cycle 双 fire start + overtime (else if 互斥修复) | 🟡 → ✅ | lifeware-timebox | [026.02.4] post-T5 | [026.02.4-r3] | 2026-07-09 |
| TD-028 | [026.02.3.1] post-review:Timebox 'running' status literals 在 JS 层 5 处残留 (Site 0 repository findRunning root source + Sites 1-4 callers) | 🟠 → ✅ | lifeware-timebox + nexus/intent | [026.02.3.1] post-review | [026.02.4] | 2026-07-09 |
| TD-030 | [026.02.4] post-T2 review:timebox.ts createAppointment adapter 仍有 truthy-check bug pattern (4 sites 全修) | 🟡 → ✅ | lifeware-timebox | [026.02.4] post-T2 | [026.02.4-r2] round 2 | 2026-07-09 |
| TD-032 | AppointmentRepository.updateFields 缺 timestamp 列 string→Date 归一化,editAppointment 保存触发 Drizzle TypeError（加 startTime 归一化 + failing test 守护） | 🟠 → ✅ | lifeware-appointments | [026.02.4] 后 hot-fix | main hot-fix | 2026-07-11 |
| TD-011 | I-3 assertNoInternalOverlap 删未用 _dayStart/_dayEnd 参数 (main 57844c2 + 6/6 vitest) | ⚪ → ✅ | lifeware-timebox | [023.10] | main 57844c2 | 2026-07-12 |
| TD-012 | [023.05-1] PR1 polish 3 Minor 文案残留 (后续 PR2 + neat 自动清理 grep 0 hits) | ⚪ → ✅ | lifeware-timebox | [023.10] | 后续 PRs 自动清 | 2026-07-12 |
| TD-013 | manifest validator PascalCase 约束文档化 + K-component-not-found 错误附 §4.2 链接 (manifest-rules.md 13 节) | 🟢 → ✅ | infra | [023.10] | docs/manifest-rules.md | 2026-07-12 |
| TD-009 | logTimebox 重复 filter ([TD-002] 重构后已 O(N) 单 filter + loop continue) | 🟢 → ✅ | lifeware-timebox | [023.10] | TD-002 重构副效应 | 2026-07-12 |
| TD-010 | synthesized action 'update_timebox' rule-probe 注释澄清 (不入 manifest by design — 字段写路径非 lifecycle SM) | 🟢 → ✅ | lifeware-timebox | [023.10] | cnui/handlers.ts:990 注释 | 2026-07-12 |

## 按领域视图

### `lifeware-habits`

*(暂无)*

### `lifeware-tasks`

- [[TD-007]] · Suspend action 完整 CNUI 回环未闭环 · 🟡 Medium

### `lifeware-okrs`

*(暂无)*

### `lifeware-timebox`

- ~~[[TD-001]]~~ · useOrchestrationRecommendations hook 不存在 · 🟠 High · ✅ [028.2]
- ~~[[TD-002]]~~ · logTimebox 批失败处理不对称 → partial-success + 宪章 §XV.6 · 🟠 High · ✅ PR #11
- [[TD-003]] · editTimeboxes TOCTOU · 🟠 High
- [[TD-006]] · orchestration N+1 sequential · 🟡 Medium
- ~~[[TD-009]]~~ · logTimebox 重复 filter · 🟢 Low · ✅ TD-002 重构闭环
- [[TD-010]] · I-1 synthesized action update_timebox · 🟢 Low
- [[TD-011]] · I-3 _dayStart/_dayEnd unused params · ⚪ Trivial
- [[TD-012]] · [023.05-1] PR1 Polish 3 Minor · ⚪ Trivial
- [[TD-017]] · [023.12] 生产代码漏跟 status 收窄（timebox.ts + intent.ts） · 🔴 Critical
- [[TD-019]] · STATUS_TRANSITION_ACTIONS 漂移 · 🔴 Critical (hot-fix + A1/A2 已落地 [023.13])
- [[TD-023]] · timebox 写入口绕过 mutation service (AM3 reuse updateFields) · 🟡 Medium
- [[TD-033]] · TimeboxRepository.updateFields 同模式未修（startTime/endTime timestamp 列） · 🟠 High
- ~~[[TD-028]]~~ · [026.02.3.1] post-review: 'running' status 4 处 JS literals 残留 (Site 0 root source) · 🟠 High · ✅ [026.02.4]
- ~~[[TD-030]]~~ · [026.02.4] post-T2 review:timebox.ts createAppointment truthy-check 4 sites · 🟡 Medium · ✅ [026.02.4-r2] round 2

### `lifeware-appointments`

- ~~[[TD-032]]~~ · AppointmentRepository.updateFields 缺 timestamp 归一化（editAppointment 保存 TypeError） · 🟠 High · ✅ main hot-fix 2026-07-11

### `cross-domain`

- [[TD-004]] · R4 timebox/okrs 写入口债 · 🟠 High
- [[TD-008]] · lifecycle-configs require 多键域债 · 🟡 Medium
- [[TD-016]] · [023.12] 测试 fixture 漏改：3 域 status 收窄后 9 错 · 🟠 High
- [[TD-018]] · [023.12] pre-existing 写入口连锁债：hooks + adapter test · 🟡 Medium
- [[TD-034]] · Task/Objective updateFields 同模式未验证（dateOnly 列 Drizzle 行为待实测） · ⚪ Trivial
- [[TD-035]] · updateFields 通用归一化 helper 缺失（4 域分散治理，新域必再踩） · 🟡 Medium

### `infra`

- [[TD-005]] · MVP_USER_ID 硬码 · 🟡 Medium
- ~~[[TD-013]]~~ · manifest validator PascalCase 约束未文档化 · 🟢 Low · ✅ docs/manifest-rules.md
- [[TD-014]] · settings.json schema 顶层严格 · 🟢 Low
- [[TD-015]] · Claude Code 内置 /review shadow gstack /review · 🟢 Low

## 按严重性视图

### 🔴 Critical（必须本季度修复）

- [[TD-017]] · [023.12] 生产代码漏跟 status 收窄：timebox.ts + intent.ts 9 错 → [023.13]

### 🟠 High（本年内修复）

- ~~[[TD-001]]~~ · useOrchestrationRecommendations hook 不存在 → ✅ [028.2]
- ~~[[TD-002]]~~ · logTimebox 批失败不对称 → ✅ PR #11
- [[TD-003]] · editTimeboxes TOCTOU (待 R4 OCC cross-domain design session, 5-7 人日)
- [[TD-004]] · R4 timebox/okrs 写入口债 (待 design session, 5-10 人日)
- [[TD-016]] · [023.12] 测试 fixture 漏改 → [023.13]
- [[TD-033]] · TimeboxRepository.updateFields 同模式未修（startTime/endTime timestamp 列）
- ~~[[TD-028]]~~ · [026.02.3.1] post-review: 'running' status JS literals 残留 (Site 0 root source) · ✅ [026.02.4]
- ~~[[TD-032]]~~ · AppointmentRepository.updateFields 缺 timestamp 归一化（editAppointment 保存 TypeError） · ✅ main hot-fix 2026-07-11

### 🟡 Medium（下次大重构顺手解决）

- [[TD-005]] · MVP_USER_ID 硬码
- [[TD-006]] · orchestration N+1 sequential
- [[TD-007]] · Suspend CNUI 回环未闭环
- [[TD-008]] · lifecycle-configs require 多键域债
- [[TD-018]] · [023.12] pre-existing 写入口连锁债 → [023.13]
- [[TD-023]] · timebox 写入口绕过 mutation service → 架构治理修复时关闭
- [[TD-035]] · updateFields 通用归一化 helper 缺失（4 域分散治理） → 下次大重构顺手

### 🟢 Low（有精力再说）

- ~~[[TD-009]]~~ · logTimebox 重复 filter · ✅ TD-002 重构闭环
- ~~[[TD-010]]~~ · I-1 synthesized action update_timebox · ✅ cnui/handlers.ts 注释 (rule-probe action, 不入 manifest by design)
- ~~[[TD-013]]~~ · manifest validator PascalCase 约束未文档化 · ✅ docs/manifest-rules.md
- [[TD-014]] · settings.json schema 顶层严格
- [[TD-015]] · Claude Code 内置 /review shadow gstack /review

### ⚪ Trivial（无影响但已知）

- [[TD-011]] · I-3 _dayStart/_dayEnd unused params
- [[TD-012]] · [023.05-1] PR1 Polish 3 Minor
- [[TD-034]] · Task/Objective updateFields 同模式未验证（dateOnly 列 Drizzle 行为待实测）

## 与其他文档的关系

- `CHANGELOG.md` — 版本历史,**[023.10] 段落已交叉引用本目录**,后续每条 [023.XX] / [024.YY] 段落末尾追加「**遗留债 →** [[TD-NNN]] ×N」
- `docs/superpowers/plans/*.md` — 计划文档的「已知债 / 范围外」段落应引用本目录
- `docs/superpowers/specs/*.md` — spec 的「约束 / 反模式」段落应引用本目录
- `.specify/memory/constitution.md` — 宪章条款修订时,如有旧债被吸收进来,关闭对应 TD

## 维护规则

1. **录入时点**：
   - 任何 ship / 完成 PR / 完成 task 时（由 `/record-tech-debt` skill 触发）
   - 任何 review pass 指出「这个先这样以后修」时（手动录入）
   - 任何 brainstorm 设计阶段发现「本方案不解决老问题」时（手动录入）
2. **编号永不重用**：关闭的 TD 编号保留,新债永远往后递增
3. **状态流转**：`🆕` → `📌` → `🛠` → `🟢`(`⏸` 可从任何状态转入)
4. **关闭不删除**：修复后保留全部历史记录(审计 + 回归监测)
5. **定期审视**：每完成 1 个 [023.XX] 大版本,回头 review 本目录的索引

## 录入历史

| 批次 | 时间 | 录入条数 | 触发场景 |
|---|---|---|---|
| 第 1 批(🟠🟠) | 2026-07-06 | TD-001 ~ TD-008(8 条) | `/record-tech-debt` 手动调起,录 [023.10] post-ship defer cleanup 候选 |
| 第 2 批(🟢⚪) | 2026-07-06 | TD-009 ~ TD-013(5 条,#11 合并到 TD-007) | 同次手动调起续录 |
| 第 3 批(🟢🟢) | 2026-07-06 | TD-014 ~ TD-015(2 条) | 手动调起,录 /review 冲突调查时发现的 2 条工具链债 |
| 第 4 批(🔴🟠🟡) | 2026-07-07 | TD-016 ~ TD-018(3 条,簇合并) | `[023.12]` ship-then-polish 7 错分簇合并为 3 TD（test fixture / production code / pre-existing chain） |
| 第 5 批(🔴) | 2026-07-07 | TD-019(1 条) | `[023.12]` hot-fix:STATUS_TRANSITION_ACTIONS 漂移导致 revert 100% 阻断,含已修复 + A1/A2 预防建议 |
| 第 6 批(🟡) | 2026-07-07 | TD-023(1 条) | `[023.13]` whole-branch review 抓出:AM3 reuse repo.updateFields 列写绕 mutation service 架构治理债 |
| 第 7 批(🟠) | 2026-07-09 | TD-028(1 条) | `[026.02.3.1]` post-review:JS 层 4 处 'running' status literals 残留 (Site 0 root source 仓库 findRunning) |
| 第 8 批(🟠→✅) | 2026-07-09 | TD-028 关闭(1 条) | `[026.02.4]` Site 0 repository findRunning rewrite (T4) + Sites 1-4 caller updates (T5) |
| 第 9 批(🟡→✅) | 2026-07-09 | TD-030 关闭(1 条) | `[026.02.4-r2]` round 2 second-opinion 抓 truthy-check drift 类 — timebox.ts:110/346 + handlers.ts:309/384 共 4 sites 全修 |
| 第 10 批(🟠+🟡+⚪+🟠→✅) | 2026-07-11 | TD-032 closed + TD-033/034/035 新建(4 条) | 系统性调试 session 发现 `AppointmentRepository.updateFields` ISO string startTime → Drizzle TypeError；hot-fix appointment.ts:49-54 + failing test；同模式扫描发现 Timebox/Task/Objective 都有同坑；抽通用归一化 helper 列入架构治理债 |
| 第 11 批(🟠→✅) | 2026-07-12 | TD-001 关闭(1 条) | TD-001 后续修复未走债目录已成事实闭环：`[023.10] eece955` revert 真 wire + `[028.2] 34ba5b9/74fd9b1` openAiPanel 真接 + handleAiConfirm 加 `scheduleProposal` accept 分支；今日「技术债清除会话」首条动作补归档 |
| 第 13 批(⚪⚪→✅) | 2026-07-12 | TD-011 + TD-012 关闭(2 条) | TD-011 (assertNoInternalOverlap 死参数 57844c2 main 直接改 3 文件) + TD-012 (PR1 polish 3 Minor 文案残留 PR2+neat 自动清理 grep 0 hits) — 印证「已发现债 后续自动闭环」模式 (类似 TD-001) |
| 第 14 批(🟢→✅) | 2026-07-12 | TD-013 关闭(1 条) | 新增 docs/manifest-rules.md 13 节 (360 行) + validate-manifest.ts K-component-not-found 错误信息附 §4.2 链接 + 文件头加 [TD-013] 指引;validate:manifest 0 错 2 警告 2 info 无 regression |
| 第 15 批(🟢→✅) | 2026-07-12 | TD-009 关闭(1 条) | TD-009 「重复 filter」性能债被 TD-002 (cnui/handlers.ts 重构) 主任务的副效应消除 — 单 filter + loop continue 已是 O(N);印证「债升级为另一债的主任务时顺手清」模式 |
| 第 16 批(🟢→✅) | 2026-07-12 | TD-010 关闭(1 条) | 「synthesized action 不在 manifest」看似漂移,实际「有意未注册」(字段写路径非 SM transition);cnui/handlers.ts:990 加 3 行 [TD-010] 注释固化理由;vitest 34/34 PASS (1 pre-existing flake 与本改动无关) |

---

**最后更新**: 2026-07-12 · 共 32 条（本批：TD-010 关闭，移到 🟢 已修复 组）· 🔴0 / 🟠3 / 🟡7 / 🟢2 / ⚪1 / ✅12