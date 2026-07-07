---
id: TD-023
title: "timebox 写入口绕过 mutation service：revertTimebox 直调 repo.updateFields 写列"
status: 登记
created: 2026-07-07
last_updated: 2026-07-07
---

# TD-023: timebox 写入口绕过 mutation service：revertTimebox 直调 repo.updateFields 写列

> 摘要：`app/actions/timebox.ts:revertTimebox` 在 `clearExecutionRecord=true` 分支直调 `repo.updateFields(id, { executionRecord: null }, userId)` 写 `timeboxes.execution_record` 列,绕开 mutation service 架构治理。`validate:structure` **确实**扫到(规则 `write-entry-bypass`,`scripts/validate-domain-structure.ts:268`),ship 阶段通过把 `timebox.ts` 加进 `WRITE_ENTRY_EXEMPTIONS` 白名单短期绕过(有 sunset 链 TD-023 关闭)。长期解为 mutation service 重构时整体迁 revertTimebox 到 mutation service。[023.13] Fix #6 实装了"短期白名单 + TD-023 记录"路径。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium |
| 类别 | 架构 |
| 领域 | `lifeware-timebox` |
| 录入版本 | v0.X.X ([023.13] ship-then-polish) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知(可作 mutation service 重构时一并) |
| 关联 PR/分支 | main(feat/023-13 ... 已 ff-merge) |
| 关联 Constitution 条款 | 架构 §write entry(隐含) |

## 现象（What）

[023.13] AM3 精化"复用 `repo.updateFields(id, { executionRecord: null }, userId)`"——把原本 T5 设计的新 `clearExecutionRecord` 仓储方法换成通用 `updateFields`,目的是 DRY + 复用 T-02 userId 通道。仓库侧 `updateFields` (`domains/timebox/repository/index.ts:99-112`) 是直接 `db.update(s.timeboxes).set(...).where(id,userId)` 单条 UPDATE;`app/actions/timebox.ts:revertTimebox` 现在显式调它写列。

架构看 `app/actions/**` 的列写规范应为"走 mutation service(`createTimeboxMutationService().execute()`),由字段 step 流程生成 + 执行器字段级校验"([023.13] plan AM3 旁注 + `updateTimebox` server action 已这样改,见 `app/actions/timebox.ts:223-`)。`revertTimebox` 是 status transition — 走 `submitDynamicIntent` + SM,符合预期 — 但"先于 revert 的 executionRecord 列清空"是用 `repo.updateFields` 绕过的。

## 根因（Why）

1. `repository.archive()`(L114-125)真值判断只能写不能清,且 status 会被错盖为 'logged' — revert 不能用。
2. `revertTransition()`(L141-149)只动 status,不动 executionRecord — 设计有意("清空由调用点显式做,仓储不耦合 AM7")。
3. AM3 删除 T5 的 clearExecutionRecord repo 方法以 DRY——选了"复用现有 updateFields"而非"新增专门清空方法"。
4. 留下的实际调用就是 `await repo.updateFields(id, { executionRecord: null }, userId)` — 等价于架构意义上的"列直写"。

**为什么 validate:structure 没拦**：`scripts/validate-domain-structure.ts` **确实**有 `write-entry-bypass` 规则扫 actions/** 内对 `repo.updateFields`/`repo.archive`/`repo.revertTransition` 等列直写调用（`scripts/validate-domain-structure.ts:264-280`），不满足白名单即报。本次 ship 的应急处理是**把 `timebox.ts` 加进 `WRITE_ENTRY_EXEMPTIONS` 白名单**（同 `okr.ts` 现有条目 sunset 链 [025]），链 TD-023 关闭作为 sunset 触发点。这给了债务显式可见性 + 时间盒化的关闭路径。

**为什么 pre-push validate:rules-registry 没拦**:那个 validator 只校 STATUS_TRANSITION_ACTIONS 与 manifest 一致,完全不沾 mutation service。

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 用户感知 0(单条 UPDATE 等价写,语义正确) |
| 用户 | 无 |
| 技术 | 写入口治理裂缝 — 后续字段写若同样选"复用 updateFields"快速绕,会复制同样债 |
| 范围 | `app/actions/timebox.ts` 单文件 + `timebox.repository.updateFields`(非新增,被绕用) |
| 严重性依据 | 单点债 — 仅 1 个调用,语义正确;若不修,后续 copy-paste 会扩散成 pattern |

## 触发场景（When）

- 触发条件：任何人新加列写逻辑时,如果想"快",看一眼 `updateFields` 是 Export,直接调 → 绕过 mutation service
- 复现步骤：1. `git grep "repo.updateFields"` 在 `src/app/actions/**` 下当前已有 1 处(revertTimebox) 2. 该位置不报任何错 — 治理缺位
- 出现频率：100%(当前是 100% 暴露态,但调用次数 1)

## 临时方案（Workaround）

- 已采取：把该次调用注释明示 "AM3 复用 updateFields:单条 UPDATE,T-02 userId 过滤,与持久化修复同通道"(`app/actions/timebox.ts:204` 的 inline 注释)。
- 兜底开关:无(语义对,不需要开关)
- 关联 commit:`52f0f35`(AM3 revertTimebox + updateFields 精化)

## 理想修复（Ideal Fix）

- **方案 A(短期,记录债 + 豁免白名单)**:`app/actions/timebox.ts:revertTimebox` 在调用 `updateFields` 前 inline TODO 注释 "TD-023 bypass"。下个 mutation service 重构 cycle 把 `revertTimebox` 整体迁到 mutation service(在 mutation service 内执行 executionRecord 清空 + SM revert transition),关 TD-023。
- **方案 B(架构层,中期)**:`scripts/validate-domain-structure.ts` 加一条 rule "src/app/actions/** 内引用 `domain-*-repository` 的 `updateFields`/`archive`/`revertTransition` 等列写方法须在 `WRITE_ENTRY_EXEMPTIONS` 白名单内"——自动卡列直写。
- **方案 C(重构,长期)**:为 executionRecord 清空场景加单独的 `TimeboxRepository.clearExecutionRecord(id, userId)` 方法,ship 阶段 revertTimebox 改调之;方法本身仍直列写(架构必要性 — 清空是 primitive 操作,无需 mutation 流程),但调用从"通用 updateFields 顺手调"收敛到"专用方法显式调",可读性 + 审计性强很多。OQ-1:AM3 阶段曾考虑过,被 DRY 论否了。

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 方案 A:0.5 人日;方案 B:1-2 人日 + 维护豁免名单;方案 C:0.5-1 人日(加方法 + 改 1 个调用) |
| 风险 | 低(语义已有等价测试覆盖,改动只动结构不动行为) |
| 前置依赖 | 无 |
| 是否跨域 | 否 |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否 |

## 验收标准（Done Criteria）

- [ ] 选定方案(A/B/C)落地
- [ ] vitest 无新增 fail(revert-regression.test.ts 保持 PASS)
- [ ] tsc 无新增报错
- [ ] 关闭本 TD

## 跟踪记录（History）

> 时间倒序,最近在上。每条带版本号或 commit hash。

- 2026-07-07 · v0.X.X ([023.13]) · 创建条目(whole-branch review 抓出,AM3 reuse-repo-updateFields 列直写债)

## 关联

- [[TD-018]] · [023.12] pre-existing 写入口连锁债(同 family: status 写入口债)
- [[TD-004]] · R4 timebox/okrs 写入口债(更广,跨域)
- 相关 PR:feat/023-13-timebox-optimization(已 ff-merge main,commit `52f0f35`)
- 相关 spec/plan:`docs/superpowers/specs/2026-07-07-023-13-timebox-optimization-design.md` §3 P3 AM3 旁注
- 相关 memory:`[[project-domain-paradigm-tech-debt]]`(CNUI 表单层 + 写入层两套范式债)
