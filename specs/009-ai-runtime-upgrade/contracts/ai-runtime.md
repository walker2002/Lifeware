# Contracts: AI Runtime 接口契约

**Branch**: `009-ai-runtime-upgrade` | **Date**: 2026-05-23

## 1. AIRuntime 接口

AIRuntime 是所有 AI 调用的唯一入口。通过 `createAIRuntime()` 工厂函数创建，注入到 Handler 的 `onGenerate` 方法中。

```typescript
interface AIRuntime {
  generate(request: AIGenerateRequest): Promise<AIGenerateResponse>
  stream(request: AIGenerateRequest): AsyncGenerator<AIStreamChunk>

  readonly budget: TokenBudgetManager
  readonly cache: ResponseCache
  readonly sessions: AISessionManager
}
```

**调用者**: Domain Handler（通过 `onGenerate(request, aiRuntime)` 注入）
**禁止调用者**: Orchestrator、Hook 函数、页面组件

### AIGenerateRequest

```typescript
interface AIGenerateRequest {
  domainId: DomainId
  action: string
  sessionId?: USOM_ID

  systemPrompt: string
  messages: ChatMessage[]

  taskType: AITaskType
  maxTokens?: number
  temperature?: number
  structuredOutput?: ZodSchema
  stream?: boolean
}
```

### AIGenerateResponse

```typescript
interface AIGenerateResponse {
  content: string | Record<string, unknown>
  tokenUsage: TokenUsage
  model: string
  cached: boolean
  sessionId?: USOM_ID
}
```

### 错误契约

```typescript
class AIRuntimeError extends Error {
  constructor(
    message: string,
    public readonly code: 'PROVIDER_UNAVAILABLE' | 'SCHEMA_VALIDATION_FAILED' | 'TIMEOUT',
    public readonly provider?: string,
    public readonly retryable: boolean = false,
  )
}

class CNUISchemaError extends AIRuntimeError {
  constructor(
    message: string,
    public readonly schemaErrors: ZodError,
  )
}
```

## 2. LLMGateway 接口

```typescript
interface LLMGateway {
  route(taskType: AITaskType): ProviderRoute
  call(providerName: string, request: LLMRequest): Promise<LLMResponse>
}

interface ProviderRoute {
  provider: string
  model: string
  fallback?: { provider: string; model: string }
}

interface LLMRequest {
  model: string
  messages: ChatMessage[]
  systemPrompt: string
  maxTokens?: number
  temperature?: number
  structuredOutput?: ZodSchema
  stream?: boolean
}

interface LLMResponse {
  content: string | Record<string, unknown>
  tokenUsage: TokenUsage
  model: string
}
```

## 3. TokenBudgetManager 接口

```typescript
interface TokenBudgetManager {
  record(usage: TokenUsage, meta: { taskType: AITaskType; model: string; domainId: DomainId; action: string }): void
  getDailySummary(date: DateOnly): Promise<DailyTokenSummary>
}

interface DailyTokenSummary {
  date: DateOnly
  totalTokens: number
  byTaskType: Record<AITaskType, number>
  callCount: number
}
```

## 4. ResponseCache 接口

```typescript
interface ResponseCache {
  get(key: string): AIGenerateResponse | undefined
  set(key: string, response: AIGenerateResponse, ttlMs: number): void
  invalidate(key: string): void
  clear(): void
  generateKey(request: AIGenerateRequest): string
}
```

## 5. AISessionManager 接口

```typescript
interface AISessionManager {
  create(params: { domainId: string; action: string; mode: SessionMode }): Promise<AISession>
  getOrActivate(sessionId: string): Promise<AISession>
  appendMessage(sessionId: string, message: ChatMessage): Promise<void>
  getHistory(sessionId: string): Promise<ChatMessage[]>
  archive(sessionId: string): Promise<void>
  findActive(domainId: string): Promise<AISession | undefined>
}
```

## 6. Memory Framework 接口

### L1 Session Layer

```typescript
interface MemoryL1Session {
  recordMessage(sessionId: string, message: ChatMessage): Promise<void>
  getMessages(sessionId: string, limit?: number): Promise<ChatMessage[]>
  onSessionArchive(sessionId: string): Promise<void>
}
```

### L2 Episode Layer

```typescript
interface MemoryL2Episode {
  record(episode: EpisodeRecord): Promise<void>
}

interface EpisodeRecord {
  type: 'ai_session_summary'
  sessionId: string
  domainId: string
  action: string
  summary: string
  proposalCount: number
  reviseCount: number
  finalAccepted: boolean
  timestamp: Timestamp
}
```

## 7. CN-UI 接口

### Component Catalog

```typescript
interface ComponentCatalog {
  register(component: CnuiComponentRegistration): void
  get(type: CnuiComponentType): CnuiComponentRegistration | undefined
  list(): CnuiComponentType[]
}

interface CnuiComponentRegistration {
  type: CnuiComponentType
  propsSchema: ZodSchema
  isBase: boolean
}
```

### Surface Store

```typescript
interface CnuiSurfaceStore {
  create(data: Omit<CnuiSurfaceData, 'status'> & { cnuiSurfaceId: string }): void
  get(cnuiSurfaceId: string): CnuiSurfaceData | undefined
  update(cnuiSurfaceId: string, patch: Partial<CnuiSurfaceData>): void
  delete(cnuiSurfaceId: string): void
}

interface CnuiSurfaceData {
  surfaceType: CnuiComponentType
  sessionId: string
  dataModel: Record<string, unknown>
  status: CnuiSurfaceStatus
}
```

### Event Bus

```typescript
interface CnuiEventBus {
  emit(event: CnuiEvent): void
  on(handler: (event: CnuiEvent) => void): () => void  // 返回 unsubscribe 函数
}
```

### CnuiManager

```typescript
interface CnuiManager {
  createCnuiSurface(params: { type: CnuiComponentType; sessionId: string; data: Record<string, unknown> }): string
  updateCnuiSurface(cnuiSurfaceId: string, data: Record<string, unknown>): void
  handleEvent(event: CnuiEvent): void
  closeCnuiSurface(cnuiSurfaceId: string): void
}
```

## 8. DomainHandler 扩展接口

```typescript
interface DomainHandler {
  onIntent(intent: StructuredIntent, ctx: HandlerContext): HandlerResult
  onGenerate?(request: GenerationRequest, aiRuntime: AIRuntime): Promise<GenerativeResult>
}
```

**关键约束**: `onGenerate` 是可选方法。只有声明了 `generation_actions` 的 Domain 需要实现。Orchestrator 检查方法存在性，不存在时使用规则降级。

## 9. GenerationRequest 扩展

```typescript
interface GenerationRequest {
  intent: StructuredIntent
  sessionId?: string
  contexts: Record<string, unknown>

  // 多轮修订支持
  reviseTarget?: {
    surfaceId: string
    previousData: Record<string, unknown>
    userInstruction: string
  }
  sessionHistory?: ChatMessage[]
  previousProposals?: ProposalSet[]
  tokenBudget: TokenBudgetInfo
}
```
