# Implementation Plan: Handler + Context Engine 架构调整

**Branch**: `008-handler-context-engine` | **Date**: 2026-05-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/008-handler-context-engine/spec.md`
**Architecture Reference**: `docs/superpowers/specs/2026-05-20-handler-context-engine-architecture.md`

## Summary

为 Lifeware Nexus 引入生成型操作路径（Generative Path），使系统能够主动生成方案（如时间盒智能编排）。新增三个核心组件：

1. **Context Engine** — 数据规划层，根据 manifest 声明从多个 Domain 收集数据，组装为 GenerationRequest
2. **Context Provider** — Domain 的受控共享接口，只读投影跨域数据
3. **Domain Handler** — Domain 的主动计算单元，执行 AI 编排算法

同时保持现有被动式 Hook 架构完全不变，Orchestrator 通过 manifest 的 `generation_actions` 块识别路径。

## Technical Context

**Language/Version**: TypeScript 5 (strict mode)
**Primary Dependencies**: Next.js 16.1.6, React 19.2.3, Zod (schema validation), yaml (manifest parsing)
**Storage**: PostgreSQL via Drizzle ORM
**Testing**: Vitest (unit/integration)
**Target Platform**: Web (Next.js SSR/CSR)
**Project Type**: Web application (frontend monorepo)
**Performance Goals**: Context Engine 组装 < 500ms（5 contexts），二次验证 < 200ms
**Constraints**: Constitution v1.5.0 合规，被动型路径零影响
**Scale/Scope**: MVP — 5 个 Context Provider，1 个 SchedulingHandler，2 个 generation_actions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Intent-Driven | PASS | 生成型操作仍由 Intent Engine 解析入口，用户确认后才进入 State Machine |
| II. Energy-First | PASS | SchedulingHandler 必须匹配能量曲线，Rule Engine 二次验证能量合规 |
| III. Single-Writer | PASS | Context Engine 为第五大写入组件，已纳入宪法 v1.5.0 |
| IV. USOM Sovereignty | PASS | 新增类型在 usom/types/process.ts 定义，docs/usom-design.md 同步更新 |
| V. Repository Isolation | PASS | Handler 不直接访问 Repository，数据由 Context Engine 通过 Provider 组装 |
| VI. Domain Dual-Track | PASS | 双轨模型已纳入宪法 v1.5.0，Handler/Provider 约束明确 |
| VII. Bridge Layer | PASS | 新组件不引入 HTTP 依赖，保持 Bridge-ready |
| VIII. AI/Rule Boundary | PASS | AI 仅参与 Handler，Context Engine 和 Rule Engine 保持确定性 |
| Orchestrator Purity | PASS | Orchestrator 仅做路径识别和组件调度，不执行业务逻辑 |
| Manifest Runtime | PASS | generation_actions 块通过 manifest-loader 运行时加载 |
| Context Provider Constraints | PASS | 只读投影 + 轻量聚合 + Zod 校验，无 AI/写操作 |
| Domain Registration | PASS | 新增 Handler/Provider 注册步骤已纳入宪法 |

**Gate Result**: ALL PASS — 无违规，无需 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/008-handler-context-engine/
├── plan.md              # 本文件
├── research.md          # Phase 0 研究产出
├── data-model.md        # Phase 1 数据模型
├── quickstart.md        # Phase 1 快速开始
├── contracts/           # Phase 1 接口契约
│   ├── context-provider.md
│   ├── handler.md
│   └── orchestrator-generative.md
└── tasks.md             # Phase 2 任务列表（/speckit-tasks 生成）
```

### Source Code (repository root)

```text
frontend/src/
├── usom/types/
│   └── process.ts                    # 扩展：ContextProvider, DomainHandler,
│                                      #        GenerationRequest, GenerationResult 等
├── nexus/
│   ├── core/
│   │   ├── intent-engine/            # 不变
│   │   ├── rule-engine/              # 不变
│   │   ├── state-machine/            # 不变
│   │   └── action-surface-engine/    # 不变
│   ├── context-engine/               # 新增
│   │   ├── assembler.ts              # assembleContext()
│   │   ├── registry.ts               # registerContextCapability() + resolveContext()
│   │   ├── types.ts                  # ContextProvider, ContextCapability 等
│   │   └── __tests__/
│   │       ├── assembler.test.ts
│   │       └── registry.test.ts
│   ├── infrastructure/
│   │   ├── event-bus/                # 不变
│   │   └── trace-logger/             # 扩展：新增 TraceComponent 枚举值
│   │       ├── index.ts
│   │       └── trace-types.ts
│   └── orchestrator/
│       ├── index.ts                  # 扩展：生成型路径识别 + 调度
│       ├── lifecycle-configs.ts      # 不变
│       └── __tests__/
│           ├── orchestrator.test.ts  # 扩展：生成型路径测试
│           └── orchestrator-generative.test.ts  # 新增
├── domains/
│   ├── registry.ts                   # 扩展：findHandler()
│   ├── manifest-loader/
│   │   └── schema.ts                 # 扩展：generation_actions 块 Zod schema
│   ├── timebox/
│   │   ├── hooks.ts                  # 不变
│   │   ├── handlers/                 # 新增
│   │   │   ├── scheduling-handler.ts
│   │   │   └── index.ts
│   │   ├── providers/                # 新增
│   │   │   ├── timebox-provider.ts
│   │   │   ├── energy-profile-provider.ts
│   │   │   └── index.ts
│   │   ├── manifest.yaml             # 扩展：generation_actions 块
│   │   ├── repository.ts             # 不变
│   │   └── index.ts                  # 扩展：注册 Handler + Provider
│   ├── tasks/
│   │   ├── providers/                # 新增
│   │   │   ├── active-tasks-provider.ts
│   │   │   └── index.ts
│   │   └── index.ts                  # 扩展：注册 Provider
│   ├── habits/
│   │   ├── providers/                # 新增
│   │   │   ├── pending-habits-provider.ts
│   │   │   ├── habit-templates-provider.ts
│   │   │   └── index.ts
│   │   └── index.ts                  # 扩展：注册 Provider
│   └── ...
└── lib/db/schema/                    # 不变（无新表，追踪复用 system_events）
```

**Structure Decision**: 在现有 Nexus 四层架构上扩展。context-engine 作为 Nexus core 的新组件目录；handlers/ 和 providers/ 作为各 Domain 的子目录。不引入新的顶层目录。

## Complexity Tracking

无需填写 — Constitution Check 全部通过，无违规需辩护。
