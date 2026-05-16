# Research: Domain 全面合规重构

**Date**: 2026-05-15
**Feature**: 006-domain-compliance-refactor

## Decision 1: State Machine 通用化策略

**Decision**: 使用 `manifest.lifecycle` 作为状态转换的唯一定义源，State Machine 在运行时动态读取。

**Rationale**: 宪章 Principle III（Single-Writer Invariant）要求 State Machine 为唯一状态写入者。当前 State Machine 仅服务 timebox，其他域的状态转换在 Orchestrator 中硬编码，违反了这一原则。通用化后，State Machine 变为纯粹的规则执行器——接收 StateProposal、从 manifest 查找合法跃迁、执行或拒绝。这与注册指南 Step 2 区块 B 的设计完全对齐。

**Alternatives considered**:
- 每个域导出 transitions 数组，State Machine 从代码中读取：保留了代码级别的转换定义，但没有利用 manifest 的声明式优势
- 保留 createTimeboxStateMachine + 新建 createHabitStateMachine 等：每新增域就要加一个工厂函数，违反注册指南的"不修改 Nexus"原则

## Decision 2: Orchestrator 统一入口设计

**Decision**: 单一 `executeIntent(intent, userId, confirmed?)` 方法，通过 registry 查找域插件执行。

**Rationale**: 当前三入口模式（execute/executeHabitIntent/executeOKRIntent）意味着每新增域就要加方法。统一入口后，差异完全由 manifest 和 hooks 驱动。onEvent 在 State Machine 成功后、EventBus.publish 前同步调用（澄清 Q2），保证 OKR KR 联动的原子性。

**Alternatives considered**:
- 保持多入口但抽取公共逻辑：仍有域专属代码在 Orchestrator 中
- 使用策略模式按域分发：本质上是另一种形式的 if-else，不如 registry + manifest 纯粹

## Decision 3: intent.fields spread 策略

**Decision**: State Machine 的 create 路径将 `intent.fields` 直接 spread 为对象属性。

**Rationale**: 当前 Orchestrator 中 timebox 创建有 12 个硬编码字段映射，habits 有 13 个，OKR 有 8 个。这些映射是 Orchestrator 耦合的主要来源。spread 策略意味着 State Machine 不需要知道任何域的字段结构——字段校验由 onValidate 负责，State Machine 只关心 status 转换和持久化。

**Alternatives considered**:
- manifest field_metadata 声明字段列表并过滤：增加了 manifest 复杂度，且过滤逻辑本身也是耦合
- 域 hooks 导出 createPayload 映射函数：hooks 应为纯函数，映射函数需要知道完整的对象结构

## Decision 4: 渐进式部署策略

**Decision**: Phase 1 按域逐步完成，Phase 2 原子完成，Phase 3 按域逐步搬迁。

**Rationale**: Phase 2（Orchestrator/State Machine 通用化）是四个域共用的基础设施，必须原子完成才能保证一致性。Phase 1 和 Phase 3 是域自包含的变更，按域逐步完成可以降低风险、方便验证。

**Alternatives considered**:
- 大爆炸：三个 Phase 全部完成后发布，风险太高
- 按域端到端：先完成 timebox 的全部三个 Phase，但 Phase 2 是共享组件，无法按域拆分

## Decision 5: onEvent 同步执行时序

**Decision**: onEvent 在 State Machine 成功后、EventBus.publish 前同步调用。

**Rationale**: OKR 的 KR 联动（Objective 激活 → KR draft→active）需要在同一调用内完成。如果异步执行，用户看到 Objective 已激活但 KR 仍为 draft 的短暂不一致窗口，影响用户体验。同步执行保证原子性，且 onEvent 异常不回滚主流程（澄清 Q1）。

**Alternatives considered**:
- EventBus.publish 后异步触发：有短暂不一致窗口
- onEvent 返回联动意图由 Orchestrator 执行：增加了 Orchestrator 的复杂度，且需要新的返回类型
