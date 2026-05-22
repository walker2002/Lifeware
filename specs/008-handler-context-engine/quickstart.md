# Quickstart: Handler + Context Engine

**Feature**: 008-handler-context-engine
**Date**: 2026-05-20

## 前置条件

- 已完成 `specs/006-domain-compliance-refactor`（manifest 运行时消费机制）
- Constitution v1.5.0 已修订（Handler + Context Engine 双轨模型）

## 实施顺序

### Phase 1: 类型与基础设施（USOM + Manifest）

1. 扩展 `usom/types/process.ts` — 新增 ContextProvider、DomainHandler、GenerationRequest、GenerationResult、GeneratedProposal、ProposalSet、Warning、PresentationPayload 接口
2. 扩展 `manifest-loader/schema.ts` — 新增 generation_actions 块 Zod schema
3. 扩展 `trace-types.ts` — TraceComponent 新增 'ContextEngine' | 'Handler'
4. 扩展 `SystemEventType` — 新增 generative.* 事件类型

### Phase 2: Context Engine 核心

5. 实现 `nexus/context-engine/registry.ts` — registerContextCapability() + resolveContext()
6. 实现 `nexus/context-engine/assembler.ts` — assembleContext()
7. 编写 registry + assembler 单元测试

### Phase 3: Context Provider 实现

8. 实现 timebox Provider — existingTimeboxes
9. 实现 tasks Provider — activeTasks
10. 实现 habits Providers — pendingHabits + habitTemplates
11. 实现 energyProfile Provider
12. 在各 Domain index.ts 中注册 Provider

### Phase 4: Handler 实现

13. 实现 `domains/timebox/handlers/scheduling-handler.ts`
14. 实现 `domains/timebox/handlers/index.ts`（Handler 注册导出）
15. 扩展 `domains/registry.ts` — 新增 findHandler()

### Phase 5: Orchestrator 集成

16. 扩展 `orchestrator/index.ts` — executeIntent() 中插入生成型路径识别
17. 新增 `orchestrator-generative.test.ts` — 生成型路径集成测试
18. 扩展 manifest.yaml — timebox manifest 新增 generation_actions 块

### Phase 6: 追踪与验证

19. 在生成型路径各步骤插入 trace() 调用
20. 扩展 Rule Engine — 新增 evaluateProposals() 方法

## 验证清单

- [ ] `npm run build` 通过
- [ ] 所有现有测试通过（被动型路径零影响）
- [ ] registry.test.ts 通过
- [ ] assembler.test.ts 通过
- [ ] orchestrator-generative.test.ts 通过
- [ ] Manifest 加载验证：`generation_actions` 块正确解析
