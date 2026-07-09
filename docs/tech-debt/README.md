---
title: 技术债务跟踪
last_updated: 2026-07-09
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
| TD-030 | [026.02.4] post-T2 review:timebox.ts createAppointment adapter 仍有 truthy-check bug pattern (line 333/337/344) | 🟡 | lifeware-timebox | [026.02.4] post-T2 | 暂未指派 |
| TD-031 | [026.02.4] post-T5 review:use-auto-trigger.ts 双分支 planned gate 可能同 cycle 双 fire start + overtime | 🟡 | lifeware-timebox | [026.02.4] post-T5 | 暂未指派 |

### 📌 登记（已纳入待办）

| 编号 | 标题 | 严重性 | 领域 | 录入版本 | 负责人 |
|---|---|---|---|---|---|
| TD-001 | useOrchestrationRecommendations hook 不存在,T8 defer [023.11] | 🟠 | lifeware-timebox | [023.10] | 暂未指派 |
| TD-002 | logTimebox 批失败处理不对称(部分成功不回滚) | 🟠 | lifeware-timebox | [023.10] | 暂未指派 |
| TD-003 | editTimeboxes TOCTOU(time-of-check vs time-of-use) | 🟠 | lifeware-timebox | [023.10] | 暂未指派 |
| TD-004 | R4 timebox/okrs 写入口债(跨域规则未落地) | 🟠 | cross-domain | [023.10] | 暂未指派 |
| TD-005 | MVP_USER_ID 硬码(占位用户身份未走认证) | 🟡 | infra | [023.10] | 暂未指派 |
| TD-006 | orchestration N+1 sequential 查询(应批处理或并行) | 🟡 | lifeware-timebox | [023.10] | 暂未指派 |
| TD-007 | Suspend action 完整 CNUI 回环未闭环(双注册缺一层) | 🟡 | lifeware-tasks | [023.10] | 暂未指派 |
| TD-008 | lifecycle-configs require('@/...') 多键域债(resolve/transition 仍动态) | 🟡 | cross-domain | [023.10] | 暂未指派 |
| TD-009 | logTimebox 重复 filter(同 query 多次过滤) | 🟢 | lifeware-timebox | [023.10] | 暂未指派 |
| TD-010 | I-1 synthesized action 'update_timebox' 不在 manifest lifecycle | 🟢 | lifeware-timebox | [023.10] | 暂未指派 |
| TD-011 | I-3 assertNoInternalOverlap _dayStart/_dayEnd unused params | ⚪ | lifeware-timebox | [023.10] | 暂未指派 |
| TD-012 | [023.05-1] PR1 Polish 3 Minor(测试文案残留旧词) | ⚪ | lifeware-timebox | [023.10] | 暂未指派 |
| TD-013 | manifest validator K-component PascalCase 约束未文档化 | 🟢 | infra | [023.10] | 暂未指派 |
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
| TD-028 | [026.02.3.1] post-review:Timebox 'running' status literals 在 JS 层 5 处残留 (Site 0 repository findRunning root source + Sites 1-4 callers) | 🟠 → ✅ | lifeware-timebox + nexus/intent | [026.02.3.1] post-review | [026.02.4] | 2026-07-09 |

## 按领域视图

### `lifeware-habits`

*(暂无)*

### `lifeware-tasks`

- [[TD-007]] · Suspend action 完整 CNUI 回环未闭环 · 🟡 Medium

### `lifeware-okrs`

*(暂无)*

### `lifeware-timebox`

- [[TD-001]] · useOrchestrationRecommendations hook 不存在 · 🟠 High
- [[TD-002]] · logTimebox 批失败处理不对称 · 🟠 High
- [[TD-003]] · editTimeboxes TOCTOU · 🟠 High
- [[TD-006]] · orchestration N+1 sequential · 🟡 Medium
- [[TD-009]] · logTimebox 重复 filter · 🟢 Low
- [[TD-010]] · I-1 synthesized action update_timebox · 🟢 Low
- [[TD-011]] · I-3 _dayStart/_dayEnd unused params · ⚪ Trivial
- [[TD-012]] · [023.05-1] PR1 Polish 3 Minor · ⚪ Trivial
- [[TD-017]] · [023.12] 生产代码漏跟 status 收窄（timebox.ts + intent.ts） · 🔴 Critical
- [[TD-019]] · STATUS_TRANSITION_ACTIONS 漂移 · 🔴 Critical (hot-fix + A1/A2 已落地 [023.13])
- [[TD-023]] · timebox 写入口绕过 mutation service (AM3 reuse updateFields) · 🟡 Medium
- ~~[[TD-028]]~~ · [026.02.3.1] post-review: 'running' status 4 处 JS literals 残留 (Site 0 root source) · 🟠 High · ✅ [026.02.4]

### `lifeware-appointments`

*(暂无)*

### `cross-domain`

- [[TD-004]] · R4 timebox/okrs 写入口债 · 🟠 High
- [[TD-008]] · lifecycle-configs require 多键域债 · 🟡 Medium
- [[TD-016]] · [023.12] 测试 fixture 漏改：3 域 status 收窄后 9 错 · 🟠 High
- [[TD-018]] · [023.12] pre-existing 写入口连锁债：hooks + adapter test · 🟡 Medium

### `infra`

- [[TD-005]] · MVP_USER_ID 硬码 · 🟡 Medium
- [[TD-013]] · manifest validator PascalCase 约束未文档化 · 🟢 Low
- [[TD-014]] · settings.json schema 顶层严格 · 🟢 Low
- [[TD-015]] · Claude Code 内置 /review shadow gstack /review · 🟢 Low

## 按严重性视图

### 🔴 Critical（必须本季度修复）

- [[TD-017]] · [023.12] 生产代码漏跟 status 收窄：timebox.ts + intent.ts 9 错 → [023.13]

### 🟠 High（本年内修复）

- [[TD-001]] · useOrchestrationRecommendations hook 不存在 → [023.11]
- [[TD-002]] · logTimebox 批失败不对称
- [[TD-003]] · editTimeboxes TOCTOU
- [[TD-004]] · R4 timebox/okrs 写入口债
- [[TD-016]] · [023.12] 测试 fixture 漏改 → [023.13]
- ~~[[TD-028]]~~ · [026.02.3.1] post-review: 'running' status JS literals 残留 (Site 0 root source) · ✅ [026.02.4]

### 🟡 Medium（下次大重构顺手解决）

- [[TD-005]] · MVP_USER_ID 硬码
- [[TD-006]] · orchestration N+1 sequential
- [[TD-007]] · Suspend CNUI 回环未闭环
- [[TD-008]] · lifecycle-configs require 多键域债
- [[TD-018]] · [023.12] pre-existing 写入口连锁债 → [023.13]
- [[TD-023]] · timebox 写入口绕过 mutation service → 架构治理修复时关闭

### 🟢 Low（有精力再说）

- [[TD-009]] · logTimebox 重复 filter
- [[TD-010]] · I-1 synthesized action update_timebox
- [[TD-013]] · manifest validator PascalCase 约束未文档化
- [[TD-014]] · settings.json schema 顶层严格
- [[TD-015]] · Claude Code 内置 /review shadow gstack /review

### ⚪ Trivial（无影响但已知）

- [[TD-011]] · I-3 _dayStart/_dayEnd unused params
- [[TD-012]] · [023.05-1] PR1 Polish 3 Minor

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

---

**最后更新**: 2026-07-09 · 共 24 条（1 条本批关闭 TD-028 → 已修复;新建 TD-030 + TD-031 已就位）· 🔴0 / 🟠5 / 🟡7 / 🟢5 / ⚪2