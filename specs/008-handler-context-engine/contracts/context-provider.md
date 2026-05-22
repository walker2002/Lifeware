# Contract: Context Provider

**Feature**: 008-handler-context-engine
**Date**: 2026-05-20

## Interface

```typescript
// usom/types/process.ts

interface ContextProvider {
  provide(query: string, params: Record<string, unknown>): Promise<unknown>
}

interface ContextCapability {
  id: string
  provider: ContextProvider
  visibility: 'private' | 'planning' | 'system'
  schema: ZodSchema
  description?: string
}
```

## Registry API

```typescript
// nexus/context-engine/registry.ts

function registerContextCapability(capability: ContextCapability): void
function resolveContext(
  capabilityId: string,
  query: string,
  params: Record<string, unknown>,
  requiredVisibility?: string,
): Promise<unknown>
function getRegisteredCapabilities(): string[]
```

## Behavioral Contract

| 规则 | 约束 |
|---|---|
| 只读 | Provider MUST NOT 修改任何数据 |
| 无 AI | Provider MUST NOT 调用 AI |
| 无副作用 | Provider MUST NOT 触发事件或写操作 |
| Schema 校验 | resolveContext() MUST 对 Provider 输出执行 Zod 校验 |
| Visibility | resolveContext() MUST 校验调用方的 visibility 权限 |
| 幂等性 | 相同 query + params MUST 返回相同结果（同一时刻） |
| 并发安全 | 多个 Handler 可同时调用同一 Provider |

## Provider 实现列表

| Capability ID | Domain | Query | Params |
|---|---|---|---|
| activeTasks | tasks | active_with_details | date |
| pendingHabits | habits | unlogged_for_date | date |
| habitTemplates | habits | templates_for_date | date |
| existingTimeboxes | timebox | timeboxes_for_date | date |
| energyProfile | (new) | energy_profile | (none) |
