# Contract: Orchestrator Generative Path

**Feature**: 008-handler-context-engine
**Date**: 2026-05-20

## Path Routing Logic

```typescript
// 伪代码 — orchestrator/index.ts executeIntent() 扩展

async executeIntent(intent, userId, confirmed?) {
  const domain = findDomain(intent.targetDomain)
  const manifest = getFullManifest(intent.targetDomain)

  // ─── 路径识别 ────────────────────
  if (manifest?.generation_actions?.[intent.action]) {
    // Generative Path
    return this.executeGenerativePath(intent, userId, manifest, domain)
  }

  // ─── Reactive Path（现有逻辑，不变）───
  // ... 现有 if/else 路由 ...
}
```

## Generative Path Flow

```
1. ContextEngine.assembleContext(intent, manifest)
   → GenerationRequest
2. findHandler(intent.targetDomain, intent.action)
   → DomainHandler
3. handler.handle(request)
   → GenerationResult
4. ruleEngine.evaluateProposals(result, snapshot)
   → per-proposal validation results
5. 返回 GenerationResult + validation results 给调用方
6. （用户确认后）markdownParser → 批量 StructuredIntent
7. 逐个 executeIntent（Reactive Path）执行
```

## OrchestratorDeps 扩展

```typescript
interface OrchestratorDeps {
  // ... 现有 deps 不变 ...

  // 新增（可选，仅生成型路径需要）
  onTrace?: (step: TraceStep) => void  // 已有，扩展使用
}
```

## Trace Event Contract

| 步骤 | TraceComponent | Phase | 数据 |
|---|---|---|---|
| 数据组装开始 | ContextEngine | start | { intent, actionConfig } |
| 数据组装完成 | ContextEngine | end | { contexts, duration } |
| Handler 执行开始 | Handler | start | { request } |
| Handler 执行完成 | Handler | end | { proposalCount, duration } |
| 二次验证 | RuleEngine | start/end | { proposalResults } |
| 用户确认 | (external) | — | 由 UI 层记录 |
| 批量执行 | StateMachine | start/end | { batchResults } |

## SystemEvent Types

| Event Type | Trigger | Payload |
|---|---|---|
| GenerativeContextAssembled | Context Engine 完成 | { intentId, contextCount, duration } |
| GenerativeHandlerCompleted | Handler 完成 | { intentId, proposalCount, duration } |
| GenerativeUserConfirmed | 用户确认 | { intentId, acceptedProposals, rejectedProposals } |
| GenerativeProposalRejected | 二次验证拒绝 | { intentId, proposalId, reasons } |
| GenerativeBatchExecuted | 批量执行完成 | { intentId, successCount, failCount } |

## Rule Engine Extension

```typescript
// nexus/core/rule-engine — 新增方法

interface ProposalValidationResult {
  proposalId: string
  result: 'pass' | 'warning' | 'reject'
  reasons?: Array<{
    ruleId: string            // 如 'timebox-overlap'
    message: string           // 如 '与 timebox abc 在 09:00-10:00 时段重叠'
    conflictObjectId?: string
    conflictTimeRange?: { start: string; end: string }
  }>
}

interface RuleEngine {
  // 现有方法不变
  evaluate(intent, snapshot): Promise<{result, warnings, confirmations}>

  // 新增：proposal 批量验证
  evaluateProposals(
    generationResult: GenerationResult,
    snapshot: ContextSnapshot,
  ): Promise<ProposalValidationResult[]>
}
```

首次验证（Handler 输出后立即调用）和二次验证（用户确认后调用）使用同一方法，区别在于 snapshot 数据可能已变化。
