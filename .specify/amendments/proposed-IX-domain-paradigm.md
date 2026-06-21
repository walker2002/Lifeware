# 宪法修订提案：§IX Domain 开发范式

> **状态**：PROPOSED — 待 constitution.md「Amendment Procedure」章节审议生效。本文件是流程**输入**，非已生效条款。生效前以 `docs/domain-paradigm.md` 为操作展开、以现有 §I–§VIII + §CN-UI 为 canonical。
> **来源**：[019] Domain 开发范式（design doc `walker-main-design-20260620-234549.md`，/plan-eng-review 2026-06-21 通过）。
> **版本影响**：**MAJOR**——本提案新增 §IX（MINOR 性质）**且显式 supersede** 现行 §CN-UI Protocol Constraints 第 4 条「Form Component Reuse Constraint」（向后不兼容的治理变更：废除 CnuiFormAdapter 强制复用）。supersede 主导版本定级，故 MAJOR。

## 提案文本（拟插入 `## Core Principles` 之后、作为 `### IX.`）

### IX. Domain Development Paradigm

**Principle**: 每个 Domain 遵循统一的七层开发范式（数据 / 写入口 / 规则三层 / CNUI 表单 / 页面表单 / 回填 / 注册），使各 Domain 在写路径、规则、表单策略上不分叉。本节是 Principle III、VI、VIII 的**操作收敛**，不引入与之冲突的新原则。

**Constraints**:

1. **写入口两条合法路径**（III 操作化）：所有业务事实持久化写入必须经其一——
   - `executeIntent`（Intent→Rule→SM，生命周期状态转换/聚合写），或
   - `createDomainMutationService.{update,execute}`（field-executor + tx-bound SM，单字段原子写/多步聚合写）。
   二者之外的直接 repo/db 写入 = 违反 Single-Writer Invariant（III）。

2. **跨字段红线**：带跨字段/跨对象业务不变量的写入，禁止走字段路径（其不经全量 onValidate）；必须经 `executeIntent`（或显式 rule 校验 step）。否则 inline 编辑静默绕过业务规则。

3. **规则三层**（§规则三层架构 1.11.1）：每个**有写路径**的 Domain 必须在 manifest `rules:` 声明规则 + `rules-registry` 注册处理器 + `onValidate` 委托 `evaluateDomainRules`。`mutation-service` 是能力（FactField 域需要），**非通用门**。

4. **治理 CI 强制**：范式约束落 fitness function（build/CI validator），非 honor-system。`orchestrator-溯源` = 全域 MUST（零豁免）。遗留债经**显式、有 sunset 的豁免清单**托管（每条带截止条件，定期审计）。

5. **页面表单非写入口**：页面表单禁止作为业务事实写入口；持久化必经 CNUI handler → 写入口。存活页面表单的校验须复用 `useManifestRules`。

**Cross-ref**：操作展开（七层接入指南「建什么文件/接什么接口」+ tasks 模板 + C-DC 检查清单 `[CI]`/`[HUMAN]` + CI validator 设计 + 四域现状对照）见 `docs/domain-paradigm.md`（Tier-2，与代码同步）。

## Superseding Language（Amendment Procedure 步骤 2 — 显式废止）

本提案 **SUPERSEDE** 现行 constitution §CN-UI Protocol Constraints 第 4 条「Form Component Reuse Constraint」（原文：*当 CN-UI 表面需要渲染与 Domain 页面编辑面板相同的表单时，MUST 通过适配层（CnuiFormAdapter）复用 Domain 的 Form 组件，MUST NOT 维护独立的字段定义和验证逻辑*）。

**废止理由**：该约束的前提是「Domain 页面存在编辑表单，CN-UI 须复用以避免重复字段定义/校验」。§IX 范式转变此前提——**CN-UI surface 是表单层本身（手写 surface + `useManifestRules`），页面退化为只读列表/详情视图**（§IX 约束 5 + L5）。页面既无写表单，「复用页面表单到 CN-UI」的前提消失，CnuiFormAdapter（及其依赖的 `FormRegistry` 字段映射、`register-form.ts`）失去存在理由——实测 habits 仅 1 消费者（死抽象），tasks 参考实现完全不用。

**取代规定**（§IX 约束 + `docs/domain-paradigm.md` L4）：
- CN-UI 表单 = 手写 surface 组件 + `useManifestRules`（realtime 校验）+ `useServerErrorBackfill`（回填），**不再经 CnuiFormAdapter 复用页面 Form**。
- 字段定义/校验的唯一来源是 manifest `field_metadata` + `rules:` + `rules-registry`（规则三层），非 Domain Form 组件。
- `CnuiFormAdapter` / `FormRegistry` / `register-form.ts` 退役删除（[019.1] habits 迁移执行）；CI validator（`validate-domain-structure.ts`）禁其残留。

> 生效条件：本 supersede 随 §IX 一并按 Amendment Procedure 审议。**生效前**，现行 §CN-UI 第 4 条仍为 canonical——故 [019.1] 退役 adapter 的实施须在本提案获批后（或与获批同步）进行；spec/CI validator 设计可先行（描述目标态）。

## Rationale（Amendment Procedure 步骤 1）

- [018] 大任务暴露四 Domain 各自为政：写路径、规则、CNUI 表单策略分叉，部分域绕过 Nexus，「极大地影响开发进度」。[018] 只修表层，未在更高层定范式。§IX 把 tasks 参考实现抽象成规范，配 CI 强制，防重蹈覆辙。
- 现有 §III（Single-Writer）/§VI（Dual-Track）/§VIII（AI/Rule boundary）已立原则，但缺**操作层收敛 + 一票否决的规则归属 + CI 强制**。§IX 补这三块，不重复原则。

## Impact Analysis

- **与现有原则冲突**：**一项显式 supersede**（见上 Superseding Language）——§CN-UI Protocol Constraints 第 4 条「Form Component Reuse Constraint」被 §IX 取代（CnuiFormAdapter 强制复用 → 手写 surface + 规则三层）。其余无冲突，逐条核验：
  - III Single-Writer：强化（明确两合法路径 + orchestrator-溯源 MUST）。
  - V Repository Isolation：不动（L1 仓储仍透传 tx）。
  - VI Dual-Track：不动（onValidate/onEvent/onActionSurfaceRequest/onOutboundRequest + onGenerate 不变）。
  - VIII AI/Rule boundary：不动（规则三层是其 Domain 侧落地）。
  - §CN-UI 第 4 条：**SUPERSEDE**（见 Superseding Language）。§CN-UI 其他条（1 声明式数据/2 非可执行/3 对话闭环/5 Surface 归属）不动。
- **影响域**：tasks（参考，已合规除 L6 回填契约）/ habits（[019.1] 退役 CnuiFormAdapter）/ okrs（豁免托管，全量 onboarding 缠 [025]）/ timebox（YAGNI）。
- **工具链**：扩 `scripts/validate-manifest.ts` + 新 `scripts/validate-domain-structure.ts` + husky pre-push（[019.ci-validator]）。
- **Tier-2 同步**：`docs/domain-paradigm.md` 随代码同步；本提案生效后 constitution.md 增 §IX，manifest.md 版本历史递增。

## 生效条件（不阻塞 [019] spec/实施）

本提案按 §Amendment Procedure 审议：书面 rationale（上）+ 无原则冲突核验（上）+ 版本递增（MINOR）+ Spec Kit 模板一致性传播 + manifest.md 更新。在生效前，`docs/domain-paradigm.md` + 现有 §I–§VIII 为权威；CI validator 按 `docs/domain-paradigm.md` §4 实施。
