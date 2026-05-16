# Implementation Plan: Domain 全面合规重构

**Branch**: `006-domain-compliance-refactor` | **Date**: 2026-05-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/006-domain-compliance-refactor/spec.md`

## Summary

将四个域（timebox、habits、okrs、tasks）从当前的硬编码模式全面合规化为：manifest.yaml 运行时消费 + 通用 State Machine + 统一 Orchestrator 入口 + 域自包含目录结构。核心价值是修改 manifest.yaml 后无需修改 TypeScript 代码即可生效。

## Technical Context

**Language/Version**: TypeScript 5, Next.js 16.1.6
**Primary Dependencies**: React 19.2.3, Drizzle ORM 0.45.1, shadcn/ui, Tailwind CSS 4
**Storage**: PostgreSQL（schema 不变）
**Testing**: Vitest（现有测试需要更新 import 路径）
**Target Platform**: Web（Next.js server-side rendering + Server Actions）
**Project Type**: Web application
**Performance Goals**: 无性能变更（架构重构）
**Constraints**: manifest 加载仅 server-side；不修改 DB schema；不修改 USOM 类型定义
**Scale/Scope**: 4 个域、~20 个文件需修改、新增 ~5 个文件

### 新增依赖

```bash
npm install yaml    # YAML 1.2 解析器（~18 kB gzip, server-side only）
npm install zod     # 运行时校验（~13 kB gzip, server-side only）
```

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principles

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Intent-Driven | ✅ 增强 | 统一 Orchestrator 入口，消除 tasks 域绕过 |
| II. Energy-First | N/A | 无调度逻辑变更 |
| III. Single-Writer | ✅ 增强 | State Machine 成为通用执行器 |
| IV. USOM Sovereignty | ✅ 遵守 | 不修改 USOM 类型或 DB schema |
| V. Repository Isolation | ✅ 遵守 | Repository 搬迁但接口不变 |
| VI. Domain Plugin Passivity | ✅ 遵守 | hooks 保持纯函数，通过闭包注入 manifest 数据 |
| VII. Bridge Layer Readiness | ✅ 遵守 | Nexus 方法不依赖 HTTP 上下文 |
| VIII. AI/Rule Boundary | ✅ 遵守 | 不涉及 AI 参与的变更 |

### Architecture Constraints

| Constraint | Status | Notes |
|------------|--------|-------|
| Multi-Tenancy (T-01~T-04) | ✅ 遵守 | 不涉及 user_id 处理变更 |
| Database Access (R-01~R-04) | ✅ 遵守 | Repository 接口不变 |
| Event Sourcing | ✅ 遵守 | events 表 append-only |
| Orchestrator Purity | ✅ 增强 | 删除域专属业务逻辑 |
| Manifest Self-Description | ✅ 核心目标 | manifest 六区块被运行时消费 |
| Manifest Runtime Consumption | ✅ 核心目标 | 消除所有 manifest 值的硬编码 |
| Domain Registration Process | ✅ 遵守 | 遵循 8 步注册指南 |

**Gate Result**: ✅ PASS — 无违规，所有变更与宪章原则一致。

## Project Structure

### Documentation (this feature)

```text
specs/006-domain-compliance-refactor/
├── plan.md              # 本文件
├── research.md          # Phase 0 研究（Decision 1-9）
├── data-model.md        # Phase 1 数据模型
├── quickstart.md        # Phase 1 验证步骤
└── contracts/           # (无 — 内部重构不涉及外部接口)
```

### Source Code (repository root)

```text
frontend/src/
├── domains/                          # 域插件目录
│   ├── manifest-loader/              # 新增：manifest 加载基础设施
│   │   ├── schema.ts                 # Zod schema 定义（六区块 A-F）
│   │   ├── loader.ts                 # loadDomainManifest() — 读取、解析、校验
│   │   ├── validator.ts              # validateSemantics() — 语义校验
│   │   └── errors.ts                 # ManifestLoadError 结构化错误
│   ├── plugin-factory.ts             # 新增：createDomainPlugin() 工厂函数
│   ├── registry.ts                   # 已有：域注册表（需改造）
│   ├── timebox/
│   │   ├── manifest.yaml             # 已有（六区块完整）
│   │   ├── hooks.ts                  # 已有（需改造为工厂函数）
│   │   ├── index.ts                  # 已有（需改造：从 manifest 加载）
│   │   ├── repository.ts             # 已有
│   │   ├── transitions.ts            # 已有（将废弃，数据来自 manifest）
│   │   └── components/               # 已有
│   ├── habits/
│   │   ├── manifest.yaml             # 已有
│   │   ├── hooks.ts                  # 已有（需改造）
│   │   ├── index.ts                  # 已有（需改造）
│   │   ├── repository/               # 已有
│   │   └── components/               # 已有
│   ├── okrs/
│   │   ├── manifest.yaml             # 已有
│   │   ├── hooks.ts                  # 已有（需改造）
│   │   ├── index.ts                  # 已有（需改造）
│   │   ├── repository/               # 已有
│   │   └── components/               # 已有
│   └── tasks/
│       ├── manifest.yaml             # 已有
│       ├── hooks.ts                  # 已有（需改造）
│       ├── index.ts                  # 已有（需改造）
│       ├── repository/               # 已有
│       └── components/               # 已有
├── nexus/
│   ├── core/
│   │   ├── state-machine/
│   │   │   ├── index.ts              # 已有（需通用化改造）
│   │   │   └── lifecycle-configs.ts  # 已有（将废弃）
│   │   ├── intent-engine/            # 不变
│   │   └── event-bus/                # 不变
│   └── orchestrator/
│       └── index.ts                  # 已有（需重大改造）
└── app/                              # Next.js 路由（需对接改造）
    ├── actions/
    └── projects/
```

**Structure Decision**: 在现有目录结构基础上，新增 `domains/manifest-loader/` 和 `domains/plugin-factory.ts`。不涉及跨目录搬迁（Phase 3 文件搬迁已在本轮 scope 内但优先级低）。

## Implementation Phases

### Phase 0: Research ✅

已完成。见 [research.md](./research.md)（Decision 1-9）。

### Phase 1: Manifest Runtime Consumption 基础设施

**目标**: 实现 ManifestLoader + Plugin Factory，为四个域的改造提供基础设施。

**任务**:

1. **安装依赖**: `npm install yaml zod`
2. **创建 `domains/manifest-loader/schema.ts`**: Zod schema 定义 manifest 六区块结构
3. **创建 `domains/manifest-loader/errors.ts`**: `ManifestLoadError` 结构化错误类型
4. **创建 `domains/manifest-loader/validator.ts`**: 三阶段校验（YAML 语法 → Zod 结构 → 语义）
5. **创建 `domains/manifest-loader/loader.ts`**: `loadDomainManifest(domainDir)` 函数
6. **创建 `domains/manifest-loader/index.ts`**: 统一导出
7. **创建 `domains/plugin-factory.ts`**: `createDomainPlugin(manifest)` 工厂函数

**验证**: 单元测试 — 加载合法 manifest 成功、加载语法错误的 manifest 输出结构化错误、加载缺少区块的 manifest 报告缺失区块名。

### Phase 2: 四域 index.ts + hooks.ts 改造

**目标**: 四个域从硬编码改为从 manifest 运行时加载。

**任务** (按域逐步):

8. **timebox 域改造**:
   - `index.ts`: 从 `loadDomainManifest()` 构建 `DomainPlugin`，消除内联 `requiredFields`/`subscribedEvents`
   - `hooks.ts`: 改为 `createTimeboxHooks(manifest)` 工厂函数，消除 `SUBSCRIBED_EVENTS` 硬编码

9. **habits 域改造**:
   - `index.ts`: 同上
   - `hooks.ts`: 消除 `SUBSCRIBED_EVENTS`、`VALID_FREQUENCY_TYPES` 硬编码

10. **okrs 域改造**:
    - `index.ts`: 同上
    - `hooks.ts`: 消除 `SUBSCRIBED_EVENTS`、`okrType` 验证值硬编码

11. **tasks 域改造**:
    - `index.ts`: 同上
    - `hooks.ts`: 消除 `SUBSCRIBED_EVENTS`、`TASK_TRANSITIONS`/`PROJECT_TRANSITIONS` 硬编码

**验证**: `npm run build` 通过；修改 manifest.yaml 的 subscribed_events 后重新加载验证 onEvent 响应变化。

### Phase 3: Nexus 核心组件改造

**目标**: Orchestrator 和 State Machine 消除域专属硬编码。

**任务**:

12. **改造 `lifecycle-configs.ts`**: 从 manifest.lifecycle 动态加载，替代内联 `timeboxLifecycle` 等对象
13. **改造 State Machine `actionTimestampMap`**: 从 manifest `field_metadata` 中 `type: lifecycle_timestamp` 字段动态构建
14. **改造 Orchestrator `ACTION_MAP`**: 从 registry 中各域 manifest 的 `intent_triggers` 动态构建
15. **删除或标记废弃**: `lifecycle-configs.ts`（如果全部迁移）、域目录下 `transitions.ts`（如果存在）

**验证**: `npm run build` 通过；grep 检查 Nexus 源码中无域名称硬编码引用。

### Phase 4: 集成验证 + 清理

**目标**: 端到端验证，确保所有功能正常。

**任务**:

16. **更新 `registry.ts`**: 确保所有四个域通过 `loadDomainManifest()` + `createDomainPlugin()` 注册
17. **更新 Server Actions**: 确保所有 `actions.ts` 对接改造后的 registry
18. **运行完整测试套件**: `npm run build && npm test`
19. **SC 验证**: 逐条检查 Success Criteria SC-001 ~ SC-012

## Complexity Tracking

> 无违规需 justify。所有变更严格在宪章框架内。
