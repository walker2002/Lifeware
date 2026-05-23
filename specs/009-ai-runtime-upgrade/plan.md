# Implementation Plan: AI Runtime 架构升级

**Branch**: `009-ai-runtime-upgrade` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-ai-runtime-upgrade/spec.md`
**Reference**: `docs/superpowers/specs/2026-05-22-ai-runtime-implementation-design.md`

## Summary

将 Lifeware 的 AI 调用从各模块直接使用 OpenAI SDK 的现状，升级为统一的 AI Runtime 架构。核心变更：LLMGateway 封装现有 `/lib/llm/`、Intent Engine 迁移到统一入口、新增 Session 管理 + Memory 框架 + CN-UI 协议。分 3 个 Sprint 交付，每 Sprint 有明确的验证标准。

## Technical Context

**Language/Version**: TypeScript 5 (strict mode)
**Primary Dependencies**: Next.js 16.1.6, OpenAI SDK (已有), Vercel AI SDK (新增), Zod, Drizzle ORM 0.45.1
**Storage**: PostgreSQL (ai_sessions 表已有, memory_episodes 表新增)
**Testing**: Vitest (需确认是否已配置), 手动集成测试
**Target Platform**: Web (Next.js App Router)
**Project Type**: Web application (单仓)
**Performance Goals**: 缓存命中后响应时间 <100ms; CN-UI 生成 2-5s
**Constraints**: 所有 LLM 调用必须走 AIRuntime; CN-UI 用非流式 generate(); MVP 阶段 SurfaceStore 用内存 Map
**Scale/Scope**: 4 个已注册 Domain (timebox/habits/okrs/tasks); 2 个 CN-UI 场景 (habit-creation-card/timebox-list)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 约束 | 合规性 | 说明 |
|------|--------|------|
| Principle III (Single-Writer) | PASS | Session Manager 通过 Memory Framework API 写消息，不绕过 |
| Principle V (Repository Isolation) | PASS | AIRuntime 不直接访问 DB；SessionRepository 复用已有 |
| Principle VI (Domain Plugin) | PASS | Handler 通过注入的 aiRuntime 调用 AI；onGenerate 扩展 |
| Principle VII (Bridge Layer) | PASS | AIRuntime 接口不含 HTTP 上下文 |
| Principle VIII (AI/Rule Boundary) | PASS | AIRuntime 不参与 Rule Engine/StateMachine；Handler 包含规则降级路径 |
| AI Runtime Constraints §1 | PASS | 依赖注入到 onGenerate，Orchestrator 不直接调用 |
| AI Runtime Constraints §4 | PASS | CN-UI 场景用非流式 generate() |
| AI Runtime Constraints §7 | PASS | Token Budget 仅记录无硬限；SurfaceStore 用内存 Map |
| CN-UI Protocol §1 | PASS | Payload 是 JSON 声明式数据，不含可执行代码 |
| CN-UI Protocol §2 | PASS | Component Catalog 白名单校验 |
| CN-UI Protocol §3 | PASS | CN-UI 交互在对话流内完成，不跳转页面 |
| Orchestrator Purity | PASS | Orchestrator 仅注入 aiRuntime 给 Handler，不直接调用 AI |
| Manifest Runtime Consumption | PASS | 路由配置从 UserSettings llmConfig 读取，不硬编码 |

**Gate 结果**: ALL PASS — 无阻塞性违规。

## Project Structure

### Documentation (this feature)

```text
specs/009-ai-runtime-upgrade/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
frontend/src/
├── nexus/
│   ├── ai-runtime/                  # Sprint 1: 新增
│   │   ├── index.ts                 # createAIRuntime() 工厂
│   │   ├── types.ts                 # AIRuntime / AIGenerateRequest / AIGenerateResponse
│   │   ├── llm-gateway/
│   │   │   ├── index.ts             # LLMGateway 接口 + route()
│   │   │   ├── providers/
│   │   │   │   ├── openai-compatible.ts  # 包装现有 /lib/llm/
│   │   │   │   ├── anthropic.ts          # 新增: Anthropic provider
│   │   │   │   └── ollama.ts             # 新增: Ollama provider
│   │   │   └── config.ts            # 路由策略 (从 UserSettings 读取)
│   │   ├── token-budget/
│   │   │   └── index.ts             # TokenBudgetManager
│   │   ├── cache/
│   │   │   └── index.ts             # ResponseCache (L1 精确匹配)
│   │   ├── session/                 # Sprint 2: 新增
│   │   │   └── index.ts             # AISessionManager
│   │   ├── memory/                  # Sprint 2-3: 新增
│   │   │   ├── index.ts             # MemoryFramework 接口
│   │   │   ├── layers/
│   │   │   │   ├── l1-session.ts    # L1 Session Layer (Sprint 2)
│   │   │   │   └── l2-episode.ts    # L2 Episode Layer (Sprint 3)
│   │   │   └── types.ts
│   │   └── cnui/                    # Sprint 1-3: 新增
│   │       ├── types.ts             # CnuiComponentType / CnuiSurfaceStatus 等
│   │       ├── catalog.ts           # Component Catalog 注册+查询
│   │       ├── surface-store.ts     # CnuiSurfaceStore (内存 Map)
│   │       ├── event-bus.ts         # CnuiEventBus (事件路由)
│   │       └── manager.ts           # CnuiManager (生命周期管理)
│   ├── orchestrator/
│   │   └── index.ts                 # 修改: 注入 aiRuntime 到 Handler
│   ├── context-engine/
│   │   ├── assembler.ts             # 修改: 支持 GenerationRequest 扩展字段
│   │   └── register-providers.ts
│   └── core/
│       └── intent-engine/
│           └── ai-parser.ts         # 修改: 迁移到 aiRuntime.generate()
├── domains/
│   ├── timebox/
│   │   ├── handlers/
│   │   │   └── scheduling-handler.ts  # 修改: handle() → onGenerate()
│   │   └── manifest.yaml            # 修改: 新增 cnui 扩展字段
│   └── habits/
│       └── manifest.yaml            # 修改: 新增 cnui 扩展字段 (场景 A)
├── components/
│   └── cnui/                        # Sprint 2-3: 新增
│       ├── CnuiRenderer.tsx         # 通用渲染器
│       ├── components/              # 基础 UI 组件
│       │   ├── TextInput.tsx
│       │   ├── Select.tsx
│       │   ├── TimePicker.tsx
│       │   ├── Slider.tsx
│       │   ├── Toggle.tsx
│       │   └── Button.tsx
│       └── surfaces/                # 域组件
│           ├── HabitCreationCard.tsx  # Sprint 2
│           └── TimeboxList.tsx        # Sprint 3 (含拖拽)
├── lib/
│   ├── llm/                         # 现有: 逐步废弃, Sprint 1 保留
│   │   ├── config.ts
│   │   ├── client.ts
│   │   └── index.ts
│   └── db/
│       ├── schema.ts                # 修改: 新增 memory_episodes 表
│       └── repositories/
│           ├── session.repository.ts  # 修改: 扩展 session 状态支持
│           └── episode.repository.ts  # 新增: Memory L2 持久化
└── usom/
    └── types/
        └── objects.ts               # 修改: 新增 AISession 状态扩展
```

**Structure Decision**: 在现有 `frontend/src/nexus/` 下新增 `ai-runtime/` 子目录作为 AI Runtime 的根，包含 llm-gateway、session、memory、cnui 四个子模块。前端 CN-UI 渲染组件放在 `frontend/src/components/cnui/`。这是对现有 Nexus 架构的自然扩展，不引入新的顶层目录。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 无 | — | — |
