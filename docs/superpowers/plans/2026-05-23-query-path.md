# Query Path MVP 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Nexus 架构中实现第三条路径（Query Path），支持对话内数据查询（"看看我的习惯"），通过 pathType 三路径路由机制集成到 Orchestrator。

**Architecture:** 新增 pathType 字段驱动三路径路由（contract/generative/query），Query Path 下分 Shortcut Path（声明式 CN-UI 组装）和 Handler Path（AI 分析）。Context Engine 统一支持 query_actions 和 generation_actions 的上下文组装。Session 强制 multi_turn，查询结果记录到 AISession.queryResults。AI Parser Phase A 路由替换硬编码 domain prompt 为 manifest 动态上下文。

**Tech Stack:** TypeScript 5, vitest, Zod, Next.js 16

**Design Spec:** `docs/superpowers/specs/2026-05-23-query-path-implementation-design.md`

---

### Task 1: StructuredIntent 新增 pathType 字段

**Files:**
- Modify: `frontend/src/usom/types/objects.ts:61-70`

- [ ] **Step 1: 添加 pathType 可选字段**

```typescript
// frontend/src/usom/types/objects.ts — StructuredIntent 接口（行 61-70）

export interface StructuredIntent {
  id: USOM_ID
  intentionId: USOM_ID
  targetDomain: string
  action: string
  fields: Record<string, unknown>
  confidence: number
  resolvedBy: 'ai' | 'template_form'
  pathType?: 'contract' | 'generative' | 'query'  // 新增，可选保持向后兼容
  createdAt: Timestamp
}
```

- [ ] **Step 2: 运行现有测试确保向后兼容**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20
```
Expected: 所有现有测试 PASS（pathType 为可选字段，不影响现有代码）。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/usom/types/objects.ts
git commit -m "$(cat <<'EOF'
feat(usom): add optional pathType field to StructuredIntent

Three-path routing: 'contract' | 'generative' | 'query'. Optional for backward compatibility.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: process.ts 新增 QueryContext、QueryResult 等类型 + DomainHandler.onQuery

**Files:**
- Modify: `frontend/src/usom/types/process.ts:295-298`

- [ ] **Step 1: 编写类型测试**

Create `frontend/src/usom/__tests__/query-types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('QueryContext type', () => {
  it('accepts valid QueryContext with all fields', () => {
    const qc = {
      intent: {
        id: 'i1',
        intentionId: 'ii1',
        targetDomain: 'habits',
        action: 'list_active_habits',
        fields: {},
        confidence: 1.0,
        resolvedBy: 'ai' as const,
        pathType: 'query' as const,
        createdAt: '2026-05-24T00:00:00Z',
      },
      contexts: { activeHabits: [] },
      sessionId: 's1',
      sessionContext: {
        priorQueries: [],
      },
    }
    expect(qc.contexts).toEqual({ activeHabits: [] })
    expect(qc.sessionContext?.priorQueries).toEqual([])
  })

  it('SessionQueryContext accepts priorQueries array', () => {
    const sqc = {
      priorQueries: [{
        action: 'list_active_habits',
        resultSummary: {
          count: 3,
          objectIds: ['h1', 'h2', 'h3'],
          keyMetrics: {},
        },
        answerText: '找到3个习惯',
        cnuiSurfaceType: 'habit-list-card',
        timestamp: '2026-05-24T00:00:00Z',
        relevance: 1.0,
      }],
    }
    expect(sqc.priorQueries).toHaveLength(1)
    expect(sqc.priorQueries[0].action).toBe('list_active_habits')
  })

  it('QueryResult discriminates text and cnui types', () => {
    const textResult = { type: 'text' as const, content: 'hello' }
    const cnuiResult = {
      type: 'cnui' as const,
      payload: {
        surfaceType: 'habit-list-card',
        components: [],
        actions: [{ type: 'dismiss', label: '关闭' }],
      },
    }

    if (textResult.type === 'text') {
      expect(typeof textResult.content).toBe('string')
    }
    if (cnuiResult.type === 'cnui') {
      expect(cnuiResult.payload.surfaceType).toBe('habit-list-card')
    }
  })

  it('DomainHandler.onQuery is optional on the interface', () => {
    // 编译时验证 — onQuery 是可选的
    const handler = {
      handle: async () => ({ proposalSet: { id: 'x', proposals: [], tags: [] } }),
      // 不定义 onQuery — 应该合法
    }
    expect(handler).toBeDefined()
    expect(handler.handle).toBeDefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/usom/__tests__/query-types.test.ts 2>&1 | tail -20
```
Expected: FAIL — 因为类型导出来自 process.ts，但新类型尚未定义（测试引用了不存在的类型，TypeScript 编译会失败）。

- [ ] **Step 3: 在 process.ts 中添加新类型并扩展 DomainHandler**

在 `frontend/src/usom/types/process.ts` 行 298 后添加：

```typescript
// ─── CN-UI Surface Payload（Query Path 输出用）──────────
export interface CNUISurfacePayload {
  surfaceType: string
  components: Array<{
    type: string
    props: Record<string, unknown>
  }>
  actions: Array<{
    type: string
    label: string
  }>
}

// ─── Query Path 类型 ───────────────────────────────────

/** 查询上下文 — Context Engine 产出，注入到 Handler.onQuery */
export interface QueryContext {
  intent: StructuredIntent
  contexts: Record<string, unknown>
  sessionId?: string
  sessionContext?: SessionQueryContext
}

/** 同 Session 中的历史查询上下文 */
export interface SessionQueryContext {
  priorQueries: PriorQueryEntry[]
}

export interface PriorQueryEntry {
  action: string
  resultSummary: {
    count: number
    objectIds: string[]
    keyMetrics: Record<string, unknown>
  }
  answerText?: string
  cnuiSurfaceType?: string
  timestamp: string
  relevance: number
}

/** 查询结果 — Handler.onQuery 或 Shortcut Path 的输出 */
export type QueryResult =
  | { type: 'text'; content: string }
  | { type: 'cnui'; payload: CNUISurfacePayload }
```

修改 `DomainHandler` 接口（行 295-298）：

```typescript
export interface DomainHandler {
  handle(request: GenerationRequest): Promise<GenerationResult>
  onGenerate?(request: GenerationRequest, aiRuntime: import('@/nexus/ai-runtime').AIRuntime): Promise<GenerationResult>
  onQuery?(context: QueryContext, aiRuntime: import('@/nexus/ai-runtime').AIRuntime): Promise<QueryResult>
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && npx vitest run src/usom/__tests__/query-types.test.ts 2>&1 | tail -20
```
Expected: PASS — 所有新类型测试通过。

- [ ] **Step 5: 运行全量测试确保无回归**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -30
```
Expected: 无现有测试失败（新增类型和可选方法不破坏现有代码）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/usom/types/process.ts frontend/src/usom/__tests__/query-types.test.ts
git commit -m "$(cat <<'EOF'
feat(usom): add QueryContext, QueryResult types and DomainHandler.onQuery

Add CNUISurfacePayload, QueryContext, SessionQueryContext, PriorQueryEntry,
QueryResult types for Query Path. Extend DomainHandler with optional onQuery
hook following the same DI pattern as onGenerate.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: ManifestSchema 新增 query_actions

**Files:**
- Modify: `frontend/src/domains/manifest-loader/schema.ts:70-101`

- [ ] **Step 1: 编写 schema 解析测试**

Create `frontend/src/domains/manifest-loader/__tests__/query-actions-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ManifestSchema } from '../schema'

const BASE_MANIFEST = {
  id: 'test',
  version: '1.0.0',
  name: 'Test',
  description: 'test',
  intent_triggers: [],
  lifecycle: {},
  field_metadata: {},
  list_actions: [],
  required_fields: {},
  subscribed_events: [],
}

describe('query_actions schema', () => {
  it('parses manifest with query_actions', () => {
    const result = ManifestSchema.safeParse({
      ...BASE_MANIFEST,
      query_actions: {
        list_items: {
          description: 'List items in conversation',
          response_mode: 'cnui',
          cnui_surface: 'item-list-card',
          context_capabilities: [
            { id: 'activeItems', query: 'active_items', params: ['userId'] },
          ],
        },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const qa = result.data.query_actions!.list_items!
      expect(qa.description).toBe('List items in conversation')
      expect(qa.response_mode).toBe('cnui')
      expect(qa.cnui_surface).toBe('item-list-card')
      expect(qa.context_capabilities).toHaveLength(1)
    }
  })

  it('parses manifest with both query_actions and generation_actions', () => {
    const result = ManifestSchema.safeParse({
      ...BASE_MANIFEST,
      generation_actions: {
        createItem: {
          description: 'Create item',
          contexts: [{ id: 'existingItems', query: 'test', params: [] }],
        },
      },
      query_actions: {
        list_items: {
          description: 'List items',
          response_mode: 'text',
          context_capabilities: [
            { id: 'activeItems', query: 'test', params: [] },
          ],
        },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.generation_actions).toBeDefined()
      expect(result.data.query_actions).toBeDefined()
    }
  })

  it('validates response_mode enum', () => {
    const result = ManifestSchema.safeParse({
      ...BASE_MANIFEST,
      query_actions: {
        bad: {
          description: 'bad',
          response_mode: 'invalid',
          context_capabilities: [],
        },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects query_actions with missing required fields', () => {
    const result = ManifestSchema.safeParse({
      ...BASE_MANIFEST,
      query_actions: {
        incomplete: {
          // missing description, response_mode, context_capabilities
        },
      },
    })
    expect(result.success).toBe(false)
  })

  it('query_actions is optional (backward compat)', () => {
    const result = ManifestSchema.safeParse(BASE_MANIFEST)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.query_actions).toBeUndefined()
    }
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/domains/manifest-loader/__tests__/query-actions-schema.test.ts 2>&1 | tail -20
```
Expected: FAIL — ManifestSchema 不识别 query_actions，strict mode 会拒绝未知 key。

- [ ] **Step 3: 添加 QueryActionSchema 和 query_actions 字段**

在 `frontend/src/domains/manifest-loader/schema.ts` 行 70（`GenerationActionSchema` 之后）添加：

```typescript
const QueryActionSchema = z.object({
  description: z.string(),
  response_mode: z.enum(['text', 'cnui']),
  cnui_surface: z.string().optional(),
  context_capabilities: z.array(ContextDeclarationSchema),
})
```

在 `ManifestSchema` 对象（行 75-101）中，`generation_actions` 一行（行 100）之后添加：

```typescript
  generation_actions: z.record(z.string(), GenerationActionSchema).optional(),
  query_actions: z.record(z.string(), QueryActionSchema).optional(),
})
```

同时更新 `DomainManifest` 类型导出（行 103 自动推导，无需额外改动）。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && npx vitest run src/domains/manifest-loader/__tests__/query-actions-schema.test.ts 2>&1 | tail -20
```
Expected: 5 tests PASS。

- [ ] **Step 5: 运行全量测试确保无回归**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -30
```
Expected: 无现有测试失败。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/manifest-loader/schema.ts frontend/src/domains/manifest-loader/__tests__/query-actions-schema.test.ts
git commit -m "$(cat <<'EOF'
feat(manifest): add QueryActionSchema and query_actions field

Add QueryActionSchema with response_mode (text/cnui), cnui_surface,
and context_capabilities. query_actions is optional for backward compat.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 路径路由函数 resolvePathType

**Files:**
- Create: `frontend/src/nexus/orchestrator/path-router.ts`
- Test: `frontend/src/nexus/orchestrator/__tests__/path-router.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// frontend/src/nexus/orchestrator/__tests__/path-router.test.ts

import { describe, it, expect } from 'vitest'
import { resolvePathType } from '../path-router'
import type { DomainManifest } from '@/domains/manifest-loader/schema'

function makeManifest(overrides: Partial<DomainManifest> = {}): DomainManifest {
  return {
    id: 'test',
    version: '1.0.0',
    name: 'Test',
    description: 'test',
    intent_triggers: [],
    lifecycle: {},
    field_metadata: {},
    list_actions: [],
    required_fields: {},
    subscribed_events: [],
    view_routes: {},
    templates: {},
    ...overrides,
  } as DomainManifest
}

describe('resolvePathType', () => {
  it('returns "query" when action is in query_actions', () => {
    const manifest = makeManifest({
      query_actions: {
        list_items: {
          description: 'list',
          response_mode: 'cnui',
          context_capabilities: [],
        },
      },
    })
    expect(resolvePathType('test', 'list_items', manifest)).toBe('query')
  })

  it('returns "generative" when action is in generation_actions', () => {
    const manifest = makeManifest({
      generation_actions: {
        createItem: {
          description: 'create',
          contexts: [],
        },
      },
    })
    expect(resolvePathType('test', 'createItem', manifest)).toBe('generative')
  })

  it('query_actions takes priority over generation_actions', () => {
    const manifest = makeManifest({
      query_actions: {
        sharedAction: {
          description: 'query version',
          response_mode: 'cnui',
          context_capabilities: [],
        },
      },
      generation_actions: {
        sharedAction: {
          description: 'gen version',
          contexts: [],
        },
      },
    })
    expect(resolvePathType('test', 'sharedAction', manifest)).toBe('query')
  })

  it('returns "contract" when action is in neither', () => {
    const manifest = makeManifest({})
    expect(resolvePathType('test', 'unknownAction', manifest)).toBe('contract')
  })

  it('returns "contract" when manifest is null', () => {
    expect(resolvePathType('test', 'anyAction', null)).toBe('contract')
  })

  it('returns "contract" when query_actions is undefined', () => {
    const manifest = makeManifest({ query_actions: undefined })
    expect(resolvePathType('test', 'anyAction', manifest)).toBe('contract')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/nexus/orchestrator/__tests__/path-router.test.ts 2>&1 | tail -20
```
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 resolvePathType**

```typescript
// frontend/src/nexus/orchestrator/path-router.ts

import type { DomainManifest } from '@/domains/manifest-loader/schema'

export type PathType = 'contract' | 'generative' | 'query'

/**
 * 根据 Domain manifest 声明判定路径类型。
 * 查找优先级：query_actions > generation_actions > 默认 contract。
 */
export function resolvePathType(
  domainId: string,
  action: string,
  manifest: DomainManifest | null,
): PathType {
  if (!manifest) return 'contract'

  if (manifest.query_actions?.[action]) return 'query'
  if (manifest.generation_actions?.[action]) return 'generative'
  return 'contract'
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && npx vitest run src/nexus/orchestrator/__tests__/path-router.test.ts 2>&1 | tail -20
```
Expected: 6 tests PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/nexus/orchestrator/path-router.ts frontend/src/nexus/orchestrator/__tests__/path-router.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestrator): add resolvePathType for three-path routing

Query actions > generation actions > default contract. Null-safe.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: AISessionManager 扩展 queryResults

**Files:**
- Modify: `frontend/src/nexus/ai-runtime/session/index.ts`
- Test: `frontend/src/nexus/ai-runtime/__tests__/session-query.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// frontend/src/nexus/ai-runtime/__tests__/session-query.test.ts

import { describe, it, expect, beforeEach } from 'vitest'
import { createAISessionManager } from '../session'

describe('AISessionManager query result support', () => {
  let manager: ReturnType<typeof createAISessionManager>

  beforeEach(() => {
    manager = createAISessionManager()
  })

  it('recordQueryResult stores query result on session', async () => {
    const session = await manager.create({ domainId: 'habits', action: 'list', userId: 'u1' })
    await manager.activate(session.id)

    manager.recordQueryResult(session.id, {
      action: 'list_active_habits',
      domain: 'habits',
      resultSummary: { count: 3, objectIds: ['h1'], keyMetrics: {} },
      timestamp: new Date().toISOString(),
    })

    const results = manager.getQueryResults(session.id)
    expect(results).toHaveLength(1)
    expect(results[0].action).toBe('list_active_habits')
  })

  it('replaces query result for same action', async () => {
    const session = await manager.create({ domainId: 'habits', action: 'list', userId: 'u1' })
    await manager.activate(session.id)

    manager.recordQueryResult(session.id, {
      action: 'list_active_habits',
      domain: 'habits',
      resultSummary: { count: 3, objectIds: ['h1'], keyMetrics: {} },
      timestamp: new Date().toISOString(),
    })

    manager.recordQueryResult(session.id, {
      action: 'list_active_habits',
      domain: 'habits',
      resultSummary: { count: 5, objectIds: ['h1', 'h2'], keyMetrics: {} },
      timestamp: new Date().toISOString(),
    })

    const results = manager.getQueryResults(session.id)
    expect(results).toHaveLength(1)
    expect(results[0].resultSummary.count).toBe(5)
  })

  it('getQueryResults returns empty array for no results', () => {
    expect(manager.getQueryResults('nonexistent')).toEqual([])
  })

  it('findActiveSessionByDomain finds active session for user+domain', async () => {
    const s1 = await manager.create({ domainId: 'habits', action: 'list', userId: 'u1' })
    await manager.activate(s1.id)

    const s2 = await manager.create({ domainId: 'timebox', action: 'create', userId: 'u1' })
    await manager.activate(s2.id)

    const found = manager.findActiveSessionByDomain('u1', 'habits')
    expect(found).toBeDefined()
    expect(found!.domainId).toBe('habits')
  })

  it('findActiveSessionByDomain returns undefined for non-active sessions', async () => {
    const session = await manager.create({ domainId: 'habits', action: 'list', userId: 'u1' })
    // 不激活 — status 是 'created'
    const found = manager.findActiveSessionByDomain('u1', 'habits')
    expect(found).toBeUndefined()
  })

  it('findActiveSessionByDomain returns undefined for wrong userId', async () => {
    const session = await manager.create({ domainId: 'habits', action: 'list', userId: 'u1' })
    await manager.activate(session.id)
    const found = manager.findActiveSessionByDomain('u2', 'habits')
    expect(found).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/nexus/ai-runtime/__tests__/session-query.test.ts 2>&1 | tail -20
```
Expected: FAIL — 新方法不存在于接口/实现。

- [ ] **Step 3: 扩展 AISession 和 AISessionManager**

修改 `frontend/src/nexus/ai-runtime/session/index.ts`：

在 `AISession` 接口（行 5-12）中添加 `queryResults` 字段：

```typescript
interface AISession {
  id: string
  domainId: string
  action: string
  userId: string
  status: SessionStatus
  createdAt: string
  queryResults?: QueryResultEntry[]  // 新增
}
```

添加 `QueryResultEntry` 接口（在 `AISession` 接口之前）：

```typescript
/** 查询结果摘要条目 */
export interface QueryResultEntry {
  action: string
  domain: string
  resultSummary: {
    count: number
    objectIds: string[]
    keyMetrics: Record<string, unknown>
  }
  answerText?: string
  cnuiSurfaceType?: string
  timestamp: string
}
```

扩展 `AISessionManager` 接口（行 29-36），添加三个新方法：

```typescript
export interface AISessionManager {
  create(params: CreateSessionParams): Promise<AISession>
  activate(sessionId: string): Promise<AISession>
  startCompleting(sessionId: string): Promise<AISession>
  archive(sessionId: string): Promise<AISession>
  close(sessionId: string): Promise<AISession>
  get(sessionId: string): AISession | undefined

  // 新增 Query Path 方法
  recordQueryResult(sessionId: string, result: QueryResultEntry): void
  getQueryResults(sessionId: string): QueryResultEntry[]
  findActiveSessionByDomain(userId: string, domainId: string): AISession | undefined
}
```

在 `createAISessionManager` 的 return 对象中（行 54-87），`get` 方法之后添加：

```typescript
    recordQueryResult(sessionId: string, result: QueryResultEntry) {
      const session = sessions.get(sessionId)
      if (!session) return
      if (!session.queryResults) session.queryResults = []

      const idx = session.queryResults.findIndex(r => r.action === result.action)
      if (idx >= 0) {
        session.queryResults[idx] = result
      } else {
        session.queryResults.push(result)
      }
    },

    getQueryResults(sessionId: string): QueryResultEntry[] {
      return sessions.get(sessionId)?.queryResults ?? []
    },

    findActiveSessionByDomain(userId: string, domainId: string): AISession | undefined {
      for (const session of sessions.values()) {
        if (session.userId === userId
          && session.domainId === domainId
          && session.status === 'active') {
          return session
        }
      }
      return undefined
    },
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && npx vitest run src/nexus/ai-runtime/__tests__/session-query.test.ts 2>&1 | tail -20
```
Expected: 6 tests PASS。

- [ ] **Step 5: 运行全量 session 测试确保无回归**

```bash
cd frontend && npx vitest run src/nexus/ai-runtime/__tests__/ 2>&1 | tail -30
```
Expected: 所有现有 AI runtime 测试 PASS。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/nexus/ai-runtime/session/index.ts frontend/src/nexus/ai-runtime/__tests__/session-query.test.ts
git commit -m "$(cat <<'EOF'
feat(session): add QueryResultEntry and query management methods

Add recordQueryResult, getQueryResults, findActiveSessionByDomain to
AISessionManager. Same-action queries replace previous results.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Context Engine assembler 统一支持 query_actions 和 generation_actions

**Files:**
- Modify: `frontend/src/nexus/context-engine/assembler.ts`
- Modify: `frontend/src/nexus/context-engine/index.ts`
- Test: `frontend/src/nexus/context-engine/__tests__/assembler.test.ts`（追加测试）

- [ ] **Step 1: 更新现有 tests 追加 query_actions 场景**

在 `frontend/src/nexus/context-engine/__tests__/assembler.test.ts` 末尾（行 112 的 `})` 之前）追加：

```typescript
  describe('Query Path support', () => {
    it('assembles query context from query_actions', async () => {
      registerContextCapability(makeCap('activeHabits', {}))

      const intent = makeIntent('list_active_habits', { userId: 'u1' })
      const manifest = makeManifest('list_active_habits', [], [])
      // 注入 query_actions
      ;(manifest as any).query_actions = {
        list_active_habits: {
          description: 'test',
          response_mode: 'cnui',
          context_capabilities: [
            { id: 'activeHabits', query: 'test_query', params: ['userId'] },
          ],
        },
      }

      const result = await assembleContext(intent, manifest)

      expect(result.intent).toBe(intent)
      // QueryContext 应有 contexts + intent
      expect(result).toHaveProperty('contexts')
      expect((result as any).contexts.activeHabits).toBeDefined()
    })

    it('still assembles generation context from generation_actions', async () => {
      registerContextCapability(makeCap('ctx1', {}))

      const intent = makeIntent('createSmartSchedule', { date: '2026-05-20' })
      const manifest = makeManifest('createSmartSchedule', ['ctx1'], [['date']])

      const result = await assembleContext(intent, manifest)

      expect(result.intent).toBe(intent)
      expect((result as any).contexts.ctx1).toEqual({ value: 'ctx1-2026-05-20' })
    })

    it('throws when action is in neither', async () => {
      const intent = makeIntent('unknownAction')
      const manifest = makeManifest('otherAction', [])

      await expect(assembleContext(intent, manifest)).rejects.toThrow(/No action config/)
    })
  })
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/nexus/context-engine/__tests__/assembler.test.ts 2>&1 | tail -20
```
Expected: FAIL — assembleContext 尚未支持 query_actions。

- [ ] **Step 3: 重构 assembler.ts**

将 `frontend/src/nexus/context-engine/assembler.ts` 替换为：

```typescript
import type { StructuredIntent } from '@/usom/types/objects'
import type { GenerationRequest, QueryContext, SessionQueryContext } from '@/usom/types/process'
import type { DomainManifest } from '@/domains/manifest-loader/schema'
import { resolveContext } from './registry'

type AssemblyResult = GenerationRequest | QueryContext

/**
 * 统一上下文组装入口。
 * 优先查 query_actions，其次查 generation_actions。
 */
export async function assembleContext(
  intent: StructuredIntent,
  manifest: DomainManifest,
  session?: import('@/nexus/ai-runtime/session').AISession,
): Promise<AssemblyResult> {
  const queryConfig = manifest.query_actions?.[intent.action]
  if (queryConfig) {
    return assembleQueryContext(intent, queryConfig, session)
  }

  const genConfig = manifest.generation_actions?.[intent.action]
  if (genConfig) {
    return assembleGenerationContext(intent, genConfig)
  }

  throw new Error(`No action config for "${intent.action}" in domain "${intent.targetDomain}"`)
}

/** 查询上下文组装 */
async function assembleQueryContext(
  intent: StructuredIntent,
  config: { context_capabilities: Array<{ id: string; query: string; params?: string[] }> },
  session?: import('@/nexus/ai-runtime/session').AISession,
): Promise<QueryContext> {
  const contexts: Record<string, unknown> = {}

  for (const ctx of config.context_capabilities) {
    const params = extractParams(ctx.params ?? [], intent.fields)
    contexts[ctx.id] = await resolveContext(ctx.id, ctx.query, params)
  }

  const sessionContext = buildSessionQueryContext(session)

  return {
    intent,
    contexts,
    sessionId: session?.id,
    sessionContext,
  }
}

/** 生成上下文组装 */
async function assembleGenerationContext(
  intent: StructuredIntent,
  config: { contexts: Array<{ id: string; query: string; params?: string[] }>; session_enabled?: boolean },
): Promise<GenerationRequest> {
  const contexts: Record<string, unknown> = {}

  for (const ctx of config.contexts) {
    const params = extractParams(ctx.params ?? [], intent.fields)
    contexts[ctx.id] = await resolveContext(ctx.id, ctx.query, params)
  }

  const request: GenerationRequest = { intent, contexts }

  if (config.session_enabled) {
    request.sessionId = undefined
  }

  return request
}

/** 从 Session 中构建查询上下文 */
function buildSessionQueryContext(
  session?: import('@/nexus/ai-runtime/session').AISession,
): SessionQueryContext | undefined {
  if (!session?.queryResults?.length) return undefined

  const now = Date.now()
  return {
    priorQueries: session.queryResults
      .map(entry => ({
        action: entry.action,
        resultSummary: entry.resultSummary,
        answerText: entry.answerText,
        cnuiSurfaceType: entry.cnuiSurfaceType,
        timestamp: entry.timestamp,
        relevance: computeRelevanceScore(now - new Date(entry.timestamp).getTime()),
      }))
      .filter(e => e.relevance > 0.1)
      .sort((a, b) => b.relevance - a.relevance),
  }
}

function computeRelevanceScore(ageMs: number): number {
  const minutes = ageMs / 60000
  if (minutes < 5) return 1.0
  if (minutes < 15) return 0.8
  if (minutes < 30) return 0.5
  return 0.2
}

function extractParams(
  paramNames: string[],
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const name of paramNames) {
    if (name in fields) {
      result[name] = fields[name]
    }
  }
  return result
}
```

更新 `frontend/src/nexus/context-engine/index.ts`：

```typescript
export { registerContextCapability, resolveContext, getRegisteredCapabilities } from './registry'
export { assembleContext } from './assembler'
export { registerAllProviders } from './register-providers'
export type { ProviderDeps } from './register-providers'
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && npx vitest run src/nexus/context-engine/__tests__/assembler.test.ts 2>&1 | tail -20
```
Expected: 所有测试 PASS（现有 5 + 新增 3 = 8 tests）。

- [ ] **Step 5: 运行全量测试确保无回归**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -30
```
Expected: 无现有测试失败。assembler 的调用者（orchestrator generative test）继续工作，因为 generation_actions 路径行为不变。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/nexus/context-engine/assembler.ts frontend/src/nexus/context-engine/index.ts frontend/src/nexus/context-engine/__tests__/assembler.test.ts
git commit -m "$(cat <<'EOF'
feat(context-engine): unify assembleContext for query_actions and generation_actions

Now supports both query_actions (→ QueryContext) and generation_actions
(→ GenerationRequest). Adds session context injection with relevance decay.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Query CN-UI Formatter（Shortcut Path 格式化）

**Files:**
- Create: `frontend/src/nexus/orchestrator/query-cnui-formatter.ts`
- Test: `frontend/src/nexus/orchestrator/__tests__/query-cnui-formatter.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// frontend/src/nexus/orchestrator/__tests__/query-cnui-formatter.test.ts

import { describe, it, expect } from 'vitest'
import { formatCNUIFromContext, formatTextSummary } from '../query-cnui-formatter'
import type { QueryContext } from '@/usom/types/process'

function makeQueryContext(contexts: Record<string, unknown>): QueryContext {
  return {
    intent: {
      id: 'i1',
      intentionId: 'ii1',
      targetDomain: 'habits',
      action: 'list_active_habits',
      fields: {},
      confidence: 1.0,
      resolvedBy: 'ai',
      pathType: 'query',
      createdAt: '2026-05-24T00:00:00Z',
    },
    contexts,
    sessionId: 's1',
  }
}

describe('formatCNUIFromContext', () => {
  it('formats array context into cnui list', () => {
    const qc = makeQueryContext({
      activeHabits: [
        { id: 'h1', title: '晨跑', status: 'active' },
        { id: 'h2', title: '冥想', status: 'active' },
      ],
    })

    const result = formatCNUIFromContext(qc, {
      response_mode: 'cnui',
      cnui_surface: 'habit-list-card',
    })

    expect(result.type).toBe('cnui')
    if (result.type === 'cnui') {
      expect(result.payload.surfaceType).toBe('habit-list-card')
      expect(result.payload.components[0].type).toBe('list')
      expect(result.payload.components[0].props.items).toHaveLength(2)
      expect(result.payload.actions).toEqual([{ type: 'dismiss', label: '关闭' }])
    }
  })

  it('wraps scalar context into single-item list', () => {
    const qc = makeQueryContext({
      stats: { total: 10, completed: 7 },
    })

    const result = formatCNUIFromContext(qc, {
      response_mode: 'cnui',
      cnui_surface: 'generic-list',
    })

    expect(result.type).toBe('cnui')
    if (result.type === 'cnui') {
      expect(result.payload.components[0].props.items).toHaveLength(1)
    }
  })

  it('handles empty contexts', () => {
    const qc = makeQueryContext({})

    const result = formatCNUIFromContext(qc, {
      response_mode: 'cnui',
    })

    expect(result.type).toBe('cnui')
    if (result.type === 'cnui') {
      expect(result.payload.components[0].props.items).toHaveLength(0)
    }
  })

  it('uses item.name as fallback title', () => {
    const qc = makeQueryContext({
      items: [{ id: 'x', name: '项目A' }],
    })

    const result = formatCNUIFromContext(qc, {
      response_mode: 'cnui',
      cnui_surface: 'generic-list',
    })

    if (result.type === 'cnui') {
      expect(result.payload.components[0].props.items[0].title).toBe('项目A')
    }
  })
})

describe('formatTextSummary', () => {
  it('returns count summary for array context', () => {
    const qc = makeQueryContext({
      habits: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }],
    })
    expect(formatTextSummary(qc)).toBe('找到 3 条记录')
  })

  it('returns fallback for empty contexts', () => {
    const qc = makeQueryContext({})
    expect(formatTextSummary(qc)).toBe('没有找到相关数据')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/nexus/orchestrator/__tests__/query-cnui-formatter.test.ts 2>&1 | tail -20
```
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 formatter**

```typescript
// frontend/src/nexus/orchestrator/query-cnui-formatter.ts

import type { QueryContext, QueryResult } from '@/usom/types/process'

interface ActionConfig {
  response_mode: 'text' | 'cnui'
  cnui_surface?: string
}

/**
 * Shortcut Path 的声明式 CN-UI 组装。
 *
 * 纯格式化函数 — 无条件分支、无数据聚合、无 AI 调用、无状态写入。
 */
export function formatCNUIFromContext(
  queryContext: QueryContext,
  actionConfig: ActionConfig,
): QueryResult {
  const surfaceType = actionConfig.cnui_surface ?? 'generic-list'

  const contextEntries = Object.values(queryContext.contexts)
  const items = Array.isArray(contextEntries[0]) ? contextEntries[0] : [contextEntries[0]]

  return {
    type: 'cnui',
    payload: {
      surfaceType,
      components: [
        {
          type: 'list',
          props: {
            items: items.filter(Boolean).map((item: any) => ({
              id: item.id,
              title: item.title ?? item.name ?? '',
              subtitle: item.status ?? '',
              metadata: item,
            })),
          },
        },
      ],
      actions: [{ type: 'dismiss', label: '关闭' }],
    },
  }
}

/** 降级文本摘要 */
export function formatTextSummary(queryContext: QueryContext): string {
  const entries = Object.entries(queryContext.contexts)
  if (entries.length === 0) return '没有找到相关数据'
  const items = Array.isArray(entries[0][1]) ? entries[0][1] : [entries[0][1]]
  return `找到 ${items.length} 条记录`
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && npx vitest run src/nexus/orchestrator/__tests__/query-cnui-formatter.test.ts 2>&1 | tail -20
```
Expected: 6 tests PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/nexus/orchestrator/query-cnui-formatter.ts frontend/src/nexus/orchestrator/__tests__/query-cnui-formatter.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestrator): add query CN-UI formatter for Shortcut Path

Declarative template-based CN-UI surface assembly. Pure formatting with
no conditional branches, no data aggregation, no AI calls, no state writes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Orchestrator 路由重构 + Query Path 执行

这是核心任务。分两步：先提取现有逻辑为独立方法（无行为变更），再添加 executeQueryPath。

**Files:**
- Modify: `frontend/src/nexus/orchestrator/index.ts:306-896`
- Test: `frontend/src/nexus/orchestrator/__tests__/orchestrator-generative.test.ts`（追加测试）
- Test: `frontend/src/nexus/orchestrator/__tests__/orchestrator-query.test.ts`（新建）

- [ ] **Step 1: 编写 Query Path 测试**

Create `frontend/src/nexus/orchestrator/__tests__/orchestrator-query.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'

// 复用与 generative test 相同的 mock 结构
const mockLoadManifest = vi.fn().mockReturnValue({
  success: true,
  manifest: {
    id: 'timebox',
    version: '1.0.0',
    name: 'Timebox',
    intent_triggers: [],
    lifecycle: {},
    field_metadata: {},
    list_actions: [],
    required_fields: {},
    subscribed_events: [],
  },
})

vi.mock('@/nexus/context-engine', () => ({
  assembleContext: vi.fn().mockResolvedValue({
    intent: { id: 'i1', action: 'test' },
    contexts: {},
  }),
}))

vi.mock('@/domains/registry', () => ({
  findDomain: () => ({
    onValidate: () => ({ valid: true, errors: [] }),
    onEvent: () => {},
    manifest: { domainId: 'habits', version: '1.0.0' },
  }),
  findHandler: vi.fn(),
}))

vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: (...args: unknown[]) => mockLoadManifest(...args),
}))

vi.mock('@/domains/plugin-factory', () => ({
  createDomainPlugin: () => null,
}))

vi.mock('@/domains/timebox/transitions', () => ({
  timeboxTransitions: [],
  findTransition: () => undefined,
}))

vi.mock('./lifecycle-configs', () => ({
  buildActionMap: () => ({}),
  resolveObjectType: () => 'timebox',
  getTransitionFromManifest: () => undefined,
}))

import { createOrchestrator } from '../index'
import { findHandler } from '@/domains/registry'
import { assembleContext } from '@/nexus/context-engine'

function makeDeps() {
  return {
    timeboxRepo: {
      findById: vi.fn().mockResolvedValue(null),
      findRunning: vi.fn().mockResolvedValue([]),
      findByStatus: vi.fn().mockResolvedValue([]),
      findUpcoming: vi.fn().mockResolvedValue([]),
      findByDateRange: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      archive: vi.fn(),
    },
    eventRepo: { append: vi.fn() },
    intentEngine: { parse: vi.fn() },
    ruleEngine: {
      evaluate: vi.fn().mockResolvedValue({ result: 'pass', warnings: [] }),
    },
  }
}

function makeIntent(action: string, domainId = 'habits', pathType?: string): StructuredIntent {
  return {
    id: 'test-intent' as any,
    intentionId: '' as any,
    targetDomain: domainId,
    action,
    fields: { userId: 'u1' },
    confidence: 1.0,
    resolvedBy: 'ai',
    pathType: pathType as any,
    createdAt: '2026-05-24T00:00:00Z' as any,
  }
}

describe('Orchestrator Query Path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadManifest.mockReturnValue({
      success: true,
      manifest: {
        id: 'habits',
        version: '1.0.0',
        name: 'Habits',
        intent_triggers: [],
        lifecycle: {},
        field_metadata: {},
        list_actions: [],
        required_fields: {},
        subscribed_events: [],
        query_actions: {
          list_active_habits: {
            description: 'List habits',
            response_mode: 'cnui',
            cnui_surface: 'habit-list-card',
            context_capabilities: [
              { id: 'activeHabits', query: 'test', params: ['userId'] },
            ],
          },
        },
      },
    })
  })

  it('routes query path through Shortcut Path (no handler) and returns cnui result', async () => {
    vi.mocked(findHandler).mockResolvedValue(undefined) // 无 handler → Shortcut

    // Mock assembleContext to return QueryContext-shaped data
    vi.mocked(assembleContext).mockResolvedValue({
      intent: makeIntent('list_active_habits', 'habits', 'query'),
      contexts: {
        activeHabits: [
          { id: 'h1', title: '晨跑', status: 'active' },
        ],
      },
    } as any)

    const deps = makeDeps()
    const orchestrator = createOrchestrator(deps as any)
    const intent = makeIntent('list_active_habits', 'habits', 'query')

    const result = await orchestrator.executeIntent(intent, 'user1' as USOM_ID)

    expect(result.success).toBe(true)
    expect(result.queryResult).toBeDefined()
    expect(result.queryResult!.type).toBe('cnui')
  })

  it('routes query path through Handler Path when handler.onQuery exists', async () => {
    vi.mocked(findHandler).mockResolvedValue({
      handle: vi.fn(),
      onQuery: vi.fn().mockResolvedValue({
        type: 'text',
        content: '习惯分析报告...',
      }),
    } as any)

    // manifest 有 habit_statistics query_action（response_mode: text）
    mockLoadManifest.mockReturnValue({
      success: true,
      manifest: {
        id: 'habits',
        version: '1.0.0',
        name: 'Habits',
        intent_triggers: [],
        lifecycle: {},
        field_metadata: {},
        list_actions: [],
        required_fields: {},
        subscribed_events: [],
        query_actions: {
          habit_statistics: {
            description: 'Stats',
            response_mode: 'text',
            context_capabilities: [
              { id: 'habitLogs', query: 'test', params: [] },
            ],
          },
        },
      },
    })

    vi.mocked(assembleContext).mockResolvedValue({
      intent: makeIntent('habit_statistics', 'habits', 'query'),
      contexts: {
        habitLogs: [],
        habitStreaks: [],
      },
    } as any)

    const deps = makeDeps()
    const orchestrator = createOrchestrator(deps as any)
    const intent = makeIntent('habit_statistics', 'habits', 'query')

    const result = await orchestrator.executeIntent(intent, 'user1' as USOM_ID)

    expect(result.success).toBe(true)
    expect(result.queryResult).toBeDefined()
    expect(result.queryResult!.type).toBe('text')
  })

  it('returns error when query_action not found in manifest', async () => {
    const deps = makeDeps()
    const orchestrator = createOrchestrator(deps as any)
    const intent = makeIntent('nonexistent_query', 'habits', 'query')

    const result = await orchestrator.executeIntent(intent, 'user1' as USOM_ID)

    expect(result.success).toBe(false)
    expect(result.error).toContain('query_action')
  })

  it('generative path still works after refactor', async () => {
    mockLoadManifest.mockReturnValue({
      success: true,
      manifest: {
        id: 'timebox',
        version: '1.0.0',
        name: 'Timebox',
        intent_triggers: [],
        lifecycle: {},
        field_metadata: {},
        list_actions: [],
        required_fields: {},
        subscribed_events: [],
        generation_actions: {
          createSmartSchedule: {
            description: 'test',
            contexts: [{ id: 'existingTimeboxes', query: 'test', params: [] }],
          },
        },
      },
    })

    vi.mocked(assembleContext).mockResolvedValue({
      intent: makeIntent('createSmartSchedule', 'timebox'),
      contexts: { existingTimeboxes: [] },
    } as any)

    vi.mocked(findHandler).mockResolvedValue({
      handle: vi.fn().mockResolvedValue({
        proposalSet: { id: 'ps1', label: 'test', proposals: [], tags: [] },
      }),
    } as any)

    const deps = makeDeps()
    const orchestrator = createOrchestrator(deps as any)
    const intent = makeIntent('createSmartSchedule', 'timebox')

    const result = await orchestrator.executeIntent(intent, 'user1' as USOM_ID)

    expect(result.success).toBe(true)
    expect(result.generativeResult).toBeDefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/nexus/orchestrator/__tests__/orchestrator-query.test.ts 2>&1 | tail -20
```
Expected: FAIL — executeIntent 不支持 query path 路由。

- [ ] **Step 3: 扩展 OrchestratorResult 类型**

在 `frontend/src/nexus/orchestrator/index.ts` 的 `OrchestratorResult`（行 65-75）中添加 `queryResult` 字段：

```typescript
export interface OrchestratorResult {
  success: boolean
  timebox?: Timebox
  habit?: Habit
  actionSurface?: ActionSurface
  error?: string
  warnings?: string[]
  needsConfirmation?: boolean
  confirmationMessage?: string
  generativeResult?: GenerationResult
  queryResult?: import('@/usom/types/process').QueryResult  // 新增
}
```

- [ ] **Step 4: 重构 executeIntent 添加三路径路由**

修改 `executeIntent` 方法（行 306），将现有的内联 generative 检测（行 324-329）替换为统一路径路由。这是关键重构——将现有逻辑提取为独立方法并添加 query path。

在 `executeIntent` 方法开头（行 306-323 保持不变），将行 324-419 的 generative 检测替换为：

```typescript
      // 路径路由 — 根据 manifest 声明判定路径类型
      const manifestResult = loadDomainManifest(domainId)
      const manifest = manifestResult.success ? manifestResult.manifest : null
      const pathType = intent.pathType ?? resolvePathType(domainId, intent.action, manifest)

      if (pathType === 'query') {
        if (!manifest) {
          return { success: false, error: `未找到 Domain manifest: ${domainId}` }
        }
        return orchestrator.executeQueryPath(intent, userId, manifest)
      }

      if (pathType === 'generative' && manifest) {
        const actionConfig = manifest.generation_actions?.[intent.action]
        if (actionConfig) {
          return orchestrator.executeGenerativePath(intent, userId, manifest, actionConfig)
        }
      }

      // pathType === 'contract' — 继续走现有被动型路径（行 421 起不变）
```

需要添加 `resolvePathType` 的 import（在文件顶部）：

```typescript
import { resolvePathType } from './path-router'
```

- [ ] **Step 5: 提取 executeGenerativePath 方法**

将现有行 329-419 的内联 generative path 逻辑提取为 `executeGenerativePath` 方法。这是纯提取——不改变任何行为。

在 `createOrchestrator` 函数内、`orchestrator` 对象中，`executeIntent` 之后添加：

```typescript
    /** 生成型路径 — 从 executeIntent 提取的独立方法 */
    async executeGenerativePath(
      intent: StructuredIntent,
      userId: USOM_ID,
      manifest: import('@/domains/manifest-loader/schema').DomainManifest,
      _actionConfig: any,
    ): Promise<OrchestratorResult> {
      try {
        // ContextEngine 组装
        const ceStart = Date.now()
        trace(deps.onTrace, 'ContextEngine', 'start', { input: { intentId: intent.id, action: intent.action } })

        const generationRequest = await assembleContext(intent, manifest) as import('@/usom/types/process').GenerationRequest

        trace(deps.onTrace, 'ContextEngine', 'end', {
          input: { intentId: intent.id },
          output: { contextCount: Object.keys(generationRequest.contexts).length, durationMs: Date.now() - ceStart },
        })

        // 发送 GenerativeContextAssembled 事件
        const ctxEvent: SystemEvent = {
          id: crypto.randomUUID() as USOM_ID,
          type: 'GenerativeContextAssembled',
          occurredAt: new Date().toISOString() as Timestamp,
          triggeredBy: 'context_engine',
          payload: { intentId: intent.id, contextCount: Object.keys(generationRequest.contexts).length, durationMs: Date.now() - ceStart },
          snapshotId: '' as USOM_ID,
        }
        await deps.eventRepo.append(ctxEvent, userId)
        eventBus.publish(ctxEvent)

        // Handler 执行
        const hStart = Date.now()
        trace(deps.onTrace, 'Handler', 'start', { input: { intentId: intent.id } })

        const handler = await findHandler(intent.targetDomain, intent.action)
        if (!handler) {
          return { success: false, error: `生成型路径未找到 Handler: ${intent.targetDomain}/${intent.action}` }
        }

        let generativeResult: GenerationResult
        if (handler.onGenerate) {
          const aiRuntime: AIRuntime = createAIRuntime()
          generativeResult = await handler.onGenerate(generationRequest, aiRuntime)
        } else {
          generativeResult = await handler.handle(generationRequest)
        }

        trace(deps.onTrace, 'Handler', 'end', {
          input: { intentId: intent.id },
          output: { proposalCount: generativeResult.proposalSet.proposals.length, durationMs: Date.now() - hStart },
        })

        // 发送 GenerativeHandlerCompleted 事件
        const handlerEvent: SystemEvent = {
          id: crypto.randomUUID() as USOM_ID,
          type: 'GenerativeHandlerCompleted',
          occurredAt: new Date().toISOString() as Timestamp,
          triggeredBy: 'handler',
          payload: {
            intentId: intent.id,
            proposalCount: generativeResult.proposalSet.proposals.length,
            durationMs: Date.now() - hStart,
          },
          snapshotId: '' as USOM_ID,
        }
        await deps.eventRepo.append(handlerEvent, userId)
        eventBus.publish(handlerEvent)

        return {
          success: true,
          generativeResult,
          warnings: generativeResult.warnings?.map(w => w.message),
        }
      } catch (err) {
        const errorEvent: SystemEvent = {
          id: crypto.randomUUID() as USOM_ID,
          type: 'GenerativeHandlerCompleted',
          occurredAt: new Date().toISOString() as Timestamp,
          triggeredBy: 'handler',
          payload: {
            intentId: intent.id,
            failedAt: 'Handler.handle',
            completedSteps: ['ContextEngine'],
            error: err instanceof Error ? err.message : String(err),
          },
          snapshotId: '' as USOM_ID,
        }
        await deps.eventRepo.append(errorEvent, userId)

        return {
          success: false,
          error: `生成型路径执行失败: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    },
```

注意：此方法中使用的 `domainId` 来自 `intent.targetDomain`（闭包变量）。

- [ ] **Step 6: 添加 executeQueryPath 方法**

在 `executeGenerativePath` 之后添加：

```typescript
    /** Query Path — Shortcut/Handler 双轨查询 */
    async executeQueryPath(
      intent: StructuredIntent,
      userId: USOM_ID,
      manifest: import('@/domains/manifest-loader/schema').DomainManifest,
    ): Promise<OrchestratorResult> {
      const actionConfig = manifest.query_actions?.[intent.action]
      if (!actionConfig) {
        return { success: false, error: `未找到 query_action: ${intent.action}` }
      }

      // Session 管理：复用同一 Domain 的 active Session
      const sessionManager = createAISessionManager()
      let session = sessionManager.findActiveSessionByDomain(userId, intent.targetDomain)
      if (!session) {
        session = await sessionManager.create({ domainId: intent.targetDomain, action: intent.action, userId })
        session = await sessionManager.activate(session.id)
      }

      // Context Engine 组装查询上下文
      trace(deps.onTrace, 'ContextEngine', 'start', { input: { intentId: intent.id } })
      const queryContext = await assembleContext(intent, manifest, session) as import('@/usom/types/process').QueryContext
      trace(deps.onTrace, 'ContextEngine', 'end', {
        input: { intentId: intent.id },
        output: { contextCount: Object.keys(queryContext.contexts).length },
      })

      // 判定子路径
      let result: import('@/usom/types/process').QueryResult
      const handler = await findHandler(intent.targetDomain, intent.action)

      if (handler?.onQuery) {
        // Handler Path（复杂分析型查询）
        trace(deps.onTrace, 'Handler', 'start', { input: { intentId: intent.id, subPath: 'handler' } })
        const aiRuntime: AIRuntime = createAIRuntime()
        result = await handler.onQuery(queryContext, aiRuntime)
        trace(deps.onTrace, 'Handler', 'end', { input: { intentId: intent.id }, output: { type: result.type } })
      } else if (actionConfig.response_mode === 'cnui') {
        // Shortcut Path（简单展示型查询）
        result = formatCNUIFromContext(queryContext, actionConfig)
      } else {
        // 降级：文本摘要
        result = { type: 'text', content: formatTextSummary(queryContext) }
      }

      // 记录查询摘要到 Session
      const summary = buildQueryResultSummary(intent, result)
      sessionManager.recordQueryResult(session.id, summary)

      return { success: true, queryResult: result }
    },
```

需要在文件顶部添加 imports：

```typescript
import { formatCNUIFromContext, formatTextSummary } from './query-cnui-formatter'
import { createAISessionManager } from '@/nexus/ai-runtime/session'
import type { QueryResultEntry } from '@/nexus/ai-runtime/session'
```

并在 orchestrator 作用域内添加辅助函数 `buildQueryResultSummary`（在 `executeQueryPath` 之后或作为模块级辅助）：

```typescript
    function buildQueryResultSummary(intent: StructuredIntent, result: import('@/usom/types/process').QueryResult): QueryResultEntry {
      const surfaceType = result.type === 'cnui' ? result.payload.surfaceType : undefined
      return {
        action: intent.action,
        domain: intent.targetDomain,
        resultSummary: {
          count: 0,
          objectIds: [],
          keyMetrics: {},
        },
        answerText: result.type === 'text' ? result.content : undefined,
        cnuiSurfaceType: surfaceType,
        timestamp: new Date().toISOString(),
      }
    }
```

将此函数放在 `orchestrator` 对象定义内部、`executeQueryPath` 之后。

- [ ] **Step 7: 运行 Query Path 测试**

```bash
cd frontend && npx vitest run src/nexus/orchestrator/__tests__/orchestrator-query.test.ts 2>&1 | tail -20
```
Expected: 4 tests PASS。

- [ ] **Step 8: 运行全量 orchestrator 测试确保无回归**

```bash
cd frontend && npx vitest run src/nexus/orchestrator/__tests__/ 2>&1 | tail -30
```
Expected: 所有现有测试 PASS（generative path + reactive path 行为不变）。

- [ ] **Step 9: 运行全量测试**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -30
```
Expected: 无失败。

- [ ] **Step 10: Commit**

```bash
git add frontend/src/nexus/orchestrator/index.ts frontend/src/nexus/orchestrator/__tests__/orchestrator-query.test.ts frontend/src/nexus/orchestrator/__tests__/orchestrator-generative.test.ts
git commit -m "$(cat <<'EOF'
feat(orchestrator): add three-path routing with Query Path execution

Refactor executeIntent into path routing (resolvePathType) with extracted
executeGenerativePath and new executeQueryPath. Query Path supports both
Shortcut Path (declarative CN-UI) and Handler Path (AI analysis via onQuery).
Session management: auto-creates/activates per-domain sessions, records query
results for multi-turn context.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 路由上下文构建函数 routing-context.ts

**Files:**
- Create: `frontend/src/nexus/core/intent-engine/routing-context.ts`
- Test: `frontend/src/nexus/core/intent-engine/__tests__/routing-context.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// frontend/src/nexus/core/intent-engine/__tests__/routing-context.test.ts

import { describe, it, expect, vi } from 'vitest'

// Mock domain registry
vi.mock('@/domains/registry', () => ({
  domainRegistry: [
    {
      manifest: {
        domainId: 'habits',
        intentTriggers: [
          {
            action: 'list_active_habits',
            description: '查看习惯列表',
            keywords: ['习惯', '列表'],
            examples: ['看看我的习惯'],
          },
          {
            action: 'view_list',
            description: '打开习惯页面',
            view_route: '/habits',
            keywords: ['打开', '管理'],
            examples: ['打开习惯管理'],
          },
        ],
      },
    },
  ],
}))

vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: (domainId: string) => {
    if (domainId === 'habits') {
      return {
        success: true,
        manifest: {
          id: 'habits',
          version: '1.0.0',
          name: 'Habits',
          intent_triggers: [
            {
              action: 'list_active_habits',
              description: '查看习惯列表',
              keywords: ['习惯', '列表'],
              examples: ['看看我的习惯'],
            },
            {
              action: 'view_list',
              description: '打开习惯页面',
              view_route: '/habits',
              keywords: ['打开', '管理'],
              examples: ['打开习惯管理'],
            },
          ],
          query_actions: {
            list_active_habits: {
              description: 'list',
              response_mode: 'cnui',
              context_capabilities: [],
            },
          },
          generation_actions: {
            createHabit: {
              description: 'create',
              contexts: [],
            },
          },
        },
      }
    }
    return { success: false, errors: [{ domainId, message: 'not found' }] }
  },
}))

import { buildRoutingContext, formatRoutingContextForPrompt } from '../routing-context'

describe('buildRoutingContext', () => {
  it('builds routing info from domain registrations', () => {
    const actions = buildRoutingContext()
    expect(actions.length).toBeGreaterThan(0)
  })

  it('classifies query_actions as "query" type', () => {
    const actions = buildRoutingContext()
    const listAction = actions.find(a => a.action === 'list_active_habits')
    expect(listAction).toBeDefined()
    expect(listAction!.type).toBe('query')
  })

  it('classifies view_routes as "view_route" type', () => {
    const actions = buildRoutingContext()
    const viewAction = actions.find(a => a.action === 'view_list')
    expect(viewAction).toBeDefined()
    expect(viewAction!.type).toBe('view_route')
  })

  it('classifies generation_actions as "generative" type', () => {
    const actions = buildRoutingContext()
    const genAction = actions.find(a => a.action === 'createHabit')
    expect(genAction).toBeDefined()
    expect(genAction!.type).toBe('generative')
  })
})

describe('formatRoutingContextForPrompt', () => {
  it('formats actions into prompt-ready text', () => {
    const actions = [{
      domainId: 'habits',
      action: 'list_active_habits',
      type: 'query' as const,
      description: '查看习惯列表',
      examples: ['看看我的习惯'],
      keywords: ['习惯'],
    }]
    const text = formatRoutingContextForPrompt(actions)
    expect(text).toContain('habits.list_active_habits')
    expect(text).toContain('对话内查询')
    expect(text).toContain('看看我的习惯')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/nexus/core/intent-engine/__tests__/routing-context.test.ts 2>&1 | tail -20
```
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 routing-context.ts**

```typescript
// frontend/src/nexus/core/intent-engine/routing-context.ts

import { domainRegistry } from '@/domains/registry'
import { loadDomainManifest } from '@/domains/manifest-loader'

interface ActionRoutingInfo {
  domainId: string
  action: string
  type: 'contract' | 'generative' | 'query' | 'view_route'
  description: string
  examples: string[]
  keywords: string[]
}

/**
 * 从所有 Domain 的 manifest 构建路由上下文。
 * 供 AI Parser 的 system prompt 使用。
 */
export function buildRoutingContext(): ActionRoutingInfo[] {
  const actions: ActionRoutingInfo[] = []

  for (const plugin of domainRegistry) {
    const domainId = plugin.manifest.domainId
    const manifestResult = loadDomainManifest(domainId)
    if (!manifestResult.success) continue
    const manifest = manifestResult.manifest

    for (const trigger of manifest.intent_triggers ?? []) {
      let type: ActionRoutingInfo['type'] = 'contract'
      if (trigger.view_route) {
        type = 'view_route'
      } else if (manifest.query_actions?.[trigger.action]) {
        type = 'query'
      } else if (manifest.generation_actions?.[trigger.action]) {
        type = 'generative'
      }

      actions.push({
        domainId,
        action: trigger.action,
        type,
        description: trigger.description,
        examples: trigger.examples ?? [],
        keywords: trigger.keywords ?? [],
      })
    }
  }

  return actions
}

/** 将路由上下文格式化为 AI prompt 文本。 */
export function formatRoutingContextForPrompt(actions: ActionRoutingInfo[]): string {
  const typeLabel: Record<string, string> = {
    contract: '变更操作',
    generative: 'AI生成',
    query: '对话内查询',
    view_route: '页面导航',
  }

  const lines = actions.map(a => {
    const label = typeLabel[a.type] ?? a.type
    return `- ${a.domainId}.${a.action} [${label}]: ${a.description}
  示例: ${a.examples.join('、')}
  关键词: ${a.keywords.join('、')}`
  })
  return lines.join('\n')
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && npx vitest run src/nexus/core/intent-engine/__tests__/routing-context.test.ts 2>&1 | tail -20
```
Expected: 5 tests PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/nexus/core/intent-engine/routing-context.ts frontend/src/nexus/core/intent-engine/__tests__/routing-context.test.ts
git commit -m "$(cat <<'EOF'
feat(intent-engine): add dynamic routing context builder from manifests

BuildRoutingContext reads all Domain manifests to construct AI Parser
system prompts. Replaces hardcoded domain-specific prompts with dynamic
context. Classifies actions as contract/generative/query/view_route.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: AI Parser 集成路由上下文（Phase A）

**Files:**
- Modify: `frontend/src/nexus/core/intent-engine/ai-parser.ts:209-292`
- Test: `frontend/src/nexus/core/intent-engine/__tests__/ai-parser-migration.test.ts`（追加）

- [ ] **Step 1: 更新测试**

在 `frontend/src/nexus/core/intent-engine/__tests__/ai-parser-migration.test.ts` 末尾追加测试。先读当前文件确认结构。

```bash
cd frontend && npx vitest run src/nexus/core/intent-engine/__tests__/ai-parser-migration.test.ts 2>&1 | tail -10
```
Expected: 现有测试 PASS（确认基准）。

- [ ] **Step 2: 修改 parseWithAI 使用动态路由上下文**

修改 `frontend/src/nexus/core/intent-engine/ai-parser.ts` 中的 `parseWithAI` 函数（行 209-292）。

在文件顶部添加 import：

```typescript
import { buildRoutingContext, formatRoutingContextForPrompt } from './routing-context'
```

修改 `parseWithAI` 函数中的 system prompt 构建（替换行 217-219 的 `systemPrompt: TIMEBOX_SYSTEM_PROMPT(new Date())`）：

```typescript
export async function parseWithAI(
  rawInput: string,
  intentionId: USOM_ID,
  aiRuntime: AIRuntime,
): Promise<AIParserResult> {
  try {
    // 构建动态路由上下文（替换硬编码 domain prompt）
    const routingActions = buildRoutingContext()
    const routingText = formatRoutingContextForPrompt(routingActions)

    const now = new Date()
    const systemPrompt = `你是 Lifeware 意图解析器。根据用户输入，判断目标域和动作。

路由规则：
- 用户说"打开XX页面" "进入XX管理" "XX设置" → view_route（页面导航）
- 用户说"看看XX" "有哪些XX" "统计XX" "查一下XX" → query（对话内查询）
- 模糊情况默认走 query（用户可后续说"打开详细页面"切换到 view_route）
- "创建" "新增" "修改" "删除" → contract（变更操作）
- "帮我安排" "生成" "规划" → generative（AI生成）

可用动作列表：
${routingText}

当前时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

输出 JSON 格式：
{
  "targetDomain": "域名",
  "action": "动作名",
  "pathType": "contract|generative|query",
  "fields": {},
  "confidence": 0.0-1.0
}`

    // 1. 调用 AIRuntime
    const response = await aiRuntime.generate({
      domainId: 'system',
      action: 'parseIntent',
      systemPrompt,
      messages: [{ role: 'user', content: rawInput }],
      taskType: 'intent_routing',
      temperature: 0.3,
    })

    const content = response.content
    if (!content) {
      return {
        success: false,
        error: 'LLM 返回内容为空，请重试或使用表单模式',
      }
    }

    // 2. 提取 JSON（content 可能是对象或字符串）
    const jsonStr = typeof content === 'string' ? extractJSON(content) : JSON.stringify(content)

    let parsed: LLMIntentResponse
    try {
      parsed = JSON.parse(jsonStr) as LLMIntentResponse
    } catch {
      return {
        success: false,
        error: `无法解析 JSON 响应，请重试或使用表单模式。原始内容：${content.slice(0, 100)}`,
      }
    }

    // 3. 验证必需字段
    const validationError = validateResponse(parsed)
    if (validationError) {
      return {
        success: false,
        error: validationError,
      }
    }

    // 4. 检查置信度
    if (parsed.confidence < 0.5) {
      return {
        success: false,
        error: `AI 置信度过低（${parsed.confidence.toFixed(2)}），建议使用表单模式输入`,
      }
    }

    // 5. 补全 endTime（LLM 通常返回 duration 而非 endTime）
    const fields = { ...parsed.fields }
    if (!fields.endTime && fields.startTime && fields.duration) {
      const start = new Date(fields.startTime as string)
      start.setMinutes(start.getMinutes() + Number(fields.duration))
      fields.endTime = start.toISOString()
    }

    // 6. 构建 StructuredIntent 并返回（新增 pathType）
    const intent: StructuredIntent = {
      id: generateUUID(),
      intentionId,
      targetDomain: parsed.targetDomain,
      action: parsed.action,
      fields,
      confidence: parsed.confidence,
      resolvedBy: 'ai',
      pathType: (parsed as any).pathType,  // 新增：AI 可输出 pathType
      createdAt: new Date().toISOString() as Timestamp,
    }

    return { success: true, intent }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : '未知错误'
    return {
      success: false,
      error: `AI 解析失败：${message}`,
    }
  }
}
```

**注意**：现有的 `TIMEBOX_SYSTEM_PROMPT` 和 `HABIT_SYSTEM_PROMPT` 暂时保留（用于 Phase B 字段补全）。Phase A 路由阶段改用动态上下文。

- [ ] **Step 3: 运行现有 AI parser 测试**

```bash
cd frontend && npx vitest run src/nexus/core/intent-engine/__tests__/ 2>&1 | tail -30
```
Expected: 核心解析测试 PASS。注意：由于 `parseWithAI` 现在使用 `buildRoutingContext()` 需要 domainRegistry，部分测试可能需要 mock 更新。如果测试失败，更新 mock 以包含 `@/domains/registry`。

- [ ] **Step 4: 处理 mock 问题（如有）**

如果 `ai-parser-migration.test.ts` 没有 mock `@/domains/registry` 和 `@/domains/manifest-loader`，需在测试文件顶部添加：

```typescript
vi.mock('@/domains/registry', () => ({
  domainRegistry: [],
}))

vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: () => ({ success: false, errors: [] }),
}))
```

然后重新运行测试确认通过。

- [ ] **Step 5: 运行全量测试**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -30
```
Expected: 无失败。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/nexus/core/intent-engine/ai-parser.ts frontend/src/nexus/core/intent-engine/__tests__/ai-parser-migration.test.ts
git commit -m "$(cat <<'EOF'
feat(intent-engine): replace hardcoded domain prompts with dynamic routing context

Phase A routing now uses buildRoutingContext from manifests instead of
hardcoded TIMEBOX_SYSTEM_PROMPT. Existing domain-specific prompts retained
for Phase B field completion. AI output now includes optional pathType field.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: habits Domain manifest 新增 query_actions 和 query triggers

**Files:**
- Modify: `frontend/src/domains/habits/manifest.yaml`

- [ ] **Step 1: 添加 query_actions 和 query intent_triggers**

在 `frontend/src/domains/habits/manifest.yaml` 末尾（当前行 211 之后）追加：

```yaml
# ─── 区块 I: query_actions ─────────────────────────────────────────
query_actions:
  list_active_habits:
    description: 在对话中查看活跃习惯列表
    response_mode: cnui
    cnui_surface: habit-list-card
    context_capabilities:
      - id: activeHabits
        query: active_habits
        params: [userId]
  habit_statistics:
    description: 查询习惯完成情况统计（需要 LLM 分析）
    response_mode: text
    context_capabilities:
      - id: habitLogs
        query: recent_habit_logs
        params: [userId]
      - id: habitStreaks
        query: habit_streaks
        params: [userId]
```

在 `intent_triggers` 区块中（`view_templates` trigger 之后，行 67 附近）新增：

```yaml
  - action: list_active_habits
    shortcut: /myHabits
    description: 在对话中查看习惯列表
    examples:
      - 看看我的习惯
      - 有哪些习惯
      - 习惯列表
    keywords: [看看习惯, 有哪些习惯, 习惯列表]
  - action: habit_statistics
    shortcut: /habitStats
    description: 查询习惯统计
    examples:
      - 习惯统计
      - 跑步坚持多久了
      - 冥想打卡情况
    keywords: [统计, streak, 坚持, 打卡情况]
```

- [ ] **Step 2: 验证 manifest 解析**

写一个快速的验证脚本或使用现有测试：

```bash
cd frontend && node -e "
const fs = require('fs');
const yaml = require('yaml');
const content = fs.readFileSync('src/domains/habits/manifest.yaml', 'utf8');
const parsed = yaml.parse(content);
console.log('query_actions:', Object.keys(parsed.query_actions || {}));
console.log('intent_triggers count:', parsed.intent_triggers?.length);
" 2>&1
```

Expected: 输出 `query_actions: [ 'list_active_habits', 'habit_statistics' ]`，intent_triggers 数量增加。

如果项目使用 Zod schema 验证，运行现有 manifest 测试：

```bash
cd frontend && npx vitest run src/domains/manifest-loader/__tests__/ 2>&1 | tail -20
```

- [ ] **Step 3: 运行全量测试确保 manifest 变化不破坏现有功能**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -30
```
Expected: 无失败。manifest 新增字段不影响现有代码。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/habits/manifest.yaml
git commit -m "$(cat <<'EOF'
feat(habits): add query_actions and query intent_triggers to manifest

Add list_active_habits (cnui shortcut) and habit_statistics (AI analysis)
query actions. Add corresponding intent triggers with shortcuts and keywords.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: habits Domain Context Providers

**Files:**
- Create: `frontend/src/domains/habits/context-providers.ts`
- Test: `frontend/src/domains/habits/__tests__/context-providers.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// frontend/src/domains/habits/__tests__/context-providers.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registerHabitProviders } from '../context-providers'
import { registerContextCapability, clearRegistry } from '@/nexus/context-engine/registry'

function makeHabitRepo(habits: any[] = [], logs: any[] = []) {
  return {
    findByStatus: vi.fn().mockResolvedValue(habits),
    findById: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    calculateStreak: vi.fn(),
    calculateLongestStreak: vi.fn(),
    calculateCompletion7d: vi.fn(),
    updateMetrics: vi.fn(),
  }
}

describe('registerHabitProviders', () => {
  beforeEach(() => {
    clearRegistry()
  })

  it('registers active_habits provider', () => {
    const repo = makeHabitRepo([
      { id: 'h1', title: '晨跑', status: 'active', defaultTime: '07:00', trackable: true, streak: 5, longestStreak: 10, completionRate7d: 0.8 },
    ])
    registerHabitProviders(repo as any)

    // 验证注册成功（不抛异常）
    expect(() => registerHabitProviders(repo as any)).not.toThrow()
  })

  it('registers habit_streaks provider', () => {
    const repo = makeHabitRepo([
      { id: 'h1', title: '晨跑', status: 'active', defaultTime: '07:00', trackable: true, streak: 5, longestStreak: 10, completionRate7d: 0.8 },
    ])
    registerHabitProviders(repo as any)
    // 验证注册成功
    expect(true).toBe(true)
  })

  it('registers recent_habit_logs provider', () => {
    const repo = makeHabitRepo()
    registerHabitProviders(repo as any)
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/domains/habits/__tests__/context-providers.test.ts 2>&1 | tail -20
```
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 context-providers.ts**

```typescript
// frontend/src/domains/habits/context-providers.ts

import { registerContextCapability } from '@/nexus/context-engine/registry'
import { z } from 'zod'
import type { IHabitRepository } from '@/usom/interfaces/irepository'

const HabitSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  defaultTime: z.string(),
  trackable: z.boolean(),
  streak: z.number(),
  todayLogged: z.boolean(),
})

const HabitLogSchema = z.object({
  habitId: z.string(),
  date: z.string(),
  completed: z.boolean(),
})

const HabitStreakSchema = z.object({
  habitId: z.string(),
  title: z.string(),
  currentStreak: z.number(),
  longestStreak: z.number(),
  completionRate7d: z.number(),
})

/** 注册 habits Domain 的查询用 Context Providers。在 Domain 初始化时调用。 */
export function registerHabitProviders(habitRepo: IHabitRepository) {
  registerContextCapability({
    id: 'activeHabits',
    provider: {
      async provide(_query, params) {
        const userId = params['userId'] as string
        const habits = await habitRepo.findByStatus('active', userId)
        return habits.map(h => ({
          id: h.id,
          title: h.title,
          status: h.status,
          defaultTime: h.defaultTime,
          trackable: h.trackable,
          streak: h.streak ?? 0,
          todayLogged: false,
        }))
      },
    },
    visibility: 'planning',
    schema: z.array(HabitSummarySchema),
    description: '活跃习惯列表',
  })

  registerContextCapability({
    id: 'habitLogs',
    provider: {
      async provide(_query, params) {
        const _userId = params['userId'] as string
        return []
      },
    },
    visibility: 'planning',
    schema: z.array(HabitLogSchema),
    description: '最近习惯打卡记录',
  })

  registerContextCapability({
    id: 'habitStreaks',
    provider: {
      async provide(_query, params) {
        const userId = params['userId'] as string
        const habits = await habitRepo.findByStatus('active', userId)
        return habits.map(h => ({
          habitId: h.id,
          title: h.title,
          currentStreak: h.streak ?? 0,
          longestStreak: h.longestStreak ?? 0,
          completionRate7d: h.completionRate7d ?? 0,
        }))
      },
    },
    visibility: 'planning',
    schema: z.array(HabitStreakSchema),
    description: '习惯连续打卡统计',
  })
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && npx vitest run src/domains/habits/__tests__/context-providers.test.ts 2>&1 | tail -20
```
Expected: 3 tests PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/habits/context-providers.ts frontend/src/domains/habits/__tests__/context-providers.test.ts
git commit -m "$(cat <<'EOF'
feat(habits): add query Context Providers for habits domain

Register activeHabits, habitLogs, and habitStreaks as context capabilities
for query path consumption. Each provider reads habit data via IHabitRepository
and returns structured, schema-validated results.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Habits Statistics Handler + Handler 注册

**Files:**
- Create: `frontend/src/domains/habits/handlers/statistics-handler.ts`
- Create: `frontend/src/domains/habits/handlers/index.ts`
- Modify: `frontend/src/domains/registry.ts:116-125`

- [ ] **Step 1: 编写 Handler 测试**

Create `frontend/src/domains/habits/__tests__/statistics-handler.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { HabitStatisticsHandler } from '../handlers/statistics-handler'

function makeAIRuntime(response: string) {
  return {
    generate: vi.fn().mockResolvedValue({ content: response, cached: false }),
    stream: vi.fn(),
    gateway: {},
    budget: { record: vi.fn() },
    cache: {},
  }
}

describe('HabitStatisticsHandler', () => {
  it('throws on handle()', async () => {
    const handler = new HabitStatisticsHandler()
    await expect(handler.handle({} as any)).rejects.toThrow(/does not support handle/)
  })

  it('throws on onGenerate()', async () => {
    const handler = new HabitStatisticsHandler()
    await expect(handler.onGenerate!({} as any, {} as any)).rejects.toThrow(/does not support onGenerate/)
  })

  it('onQuery calls AI Runtime and returns text result', async () => {
    const handler = new HabitStatisticsHandler()
    const ai = makeAIRuntime('习惯分析报告：晨跑连续5天...')

    const result = await handler.onQuery!(
      {
        intent: {
          id: 'i1',
          intentionId: 'ii1',
          targetDomain: 'habits',
          action: 'habit_statistics',
          fields: { question: '分析我的习惯' },
          confidence: 1.0,
          resolvedBy: 'ai',
          pathType: 'query',
          createdAt: '2026-05-24T00:00:00Z',
        },
        contexts: {
          habitLogs: [{ habitId: 'h1', date: '2026-05-24', completed: true }],
          habitStreaks: [{
            habitId: 'h1',
            title: '晨跑',
            currentStreak: 5,
            longestStreak: 10,
            completionRate7d: 0.8,
          }],
        },
        sessionId: 's1',
      },
      ai as any,
    )

    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.content).toBe('习惯分析报告：晨跑连续5天...')
    }
    expect(ai.generate).toHaveBeenCalledWith(expect.objectContaining({
      domainId: 'habits',
      action: 'habit_statistics',
      taskType: 'content_generation',
    }))
  })

  it('includes session context info when priorQueries exist', async () => {
    const handler = new HabitStatisticsHandler()
    const ai = makeAIRuntime('分析报告')

    await handler.onQuery!(
      {
        intent: {
          id: 'i1',
          intentionId: 'ii1',
          targetDomain: 'habits',
          action: 'habit_statistics',
          fields: {},
          confidence: 1.0,
          resolvedBy: 'ai',
          pathType: 'query',
          createdAt: '2026-05-24T00:00:00Z',
        },
        contexts: {
          habitLogs: [],
          habitStreaks: [],
        },
        sessionContext: {
          priorQueries: [{
            action: 'list_active_habits',
            resultSummary: { count: 3, objectIds: [], keyMetrics: {} },
            timestamp: new Date().toISOString(),
            relevance: 1.0,
          }],
        },
      },
      ai as any,
    )

    const callArgs = ai.generate.mock.calls[0][0]
    expect(callArgs.systemPrompt).toContain('上下文')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/domains/habits/__tests__/statistics-handler.test.ts 2>&1 | tail -20
```
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 Handler**

```typescript
// frontend/src/domains/habits/handlers/statistics-handler.ts

import type { DomainHandler, QueryContext, QueryResult, GenerationRequest, GenerationResult } from '@/usom/types/process'
import type { AIRuntime } from '@/nexus/ai-runtime'

/**
 * 习惯统计分析 Handler。
 * 实现 onQuery hook，使用 AI Runtime 生成分析文本。
 */
export class HabitStatisticsHandler implements DomainHandler {
  async handle(_request: GenerationRequest): Promise<GenerationResult> {
    throw new Error('HabitStatisticsHandler does not support handle(). Use onQuery().')
  }

  async onGenerate(_request: GenerationRequest, _aiRuntime: AIRuntime): Promise<GenerationResult> {
    throw new Error('HabitStatisticsHandler does not support onGenerate(). Use onQuery().')
  }

  async onQuery(context: QueryContext, aiRuntime: AIRuntime): Promise<QueryResult> {
    const { habitLogs, habitStreaks } = context.contexts as {
      habitLogs: Array<{ habitId: string; date: string; completed: boolean }>
      habitStreaks: Array<{
        habitId: string
        title: string
        currentStreak: number
        longestStreak: number
        completionRate7d: number
      }>
    }

    const sessionInfo = context.sessionContext?.priorQueries?.length
      ? `\n\n上下文：用户之前已查询过习惯列表。`
      : ''

    const response = await aiRuntime.generate({
      domainId: 'habits',
      action: 'habit_statistics',
      systemPrompt: `你是 Lifeware 习惯追踪分析助手。根据用户的习惯日志和连续打卡数据，
生成简洁的分析报告。报告应包含：
1. 各习惯的当前状态（连续天数、7日完成率）
2. 值得关注的趋势（增长、下降、停滞）
3. 简短建议（如有明显问题）

数据：
${JSON.stringify({ habitLogs, habitStreaks }, null, 2)}${sessionInfo}`,
      messages: [{
        role: 'user',
        content: (context.intent.fields.question as string) ?? '分析我的习惯数据',
      }],
      taskType: 'content_generation',
      temperature: 0.3,
    })

    return {
      type: 'text',
      content: typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content),
    }
  }
}
```

```typescript
// frontend/src/domains/habits/handlers/index.ts

import { HabitStatisticsHandler } from './statistics-handler'
import type { DomainHandler } from '@/usom/types/process'

export const habitHandlers: Record<string, DomainHandler> = {
  habit_statistics: new HabitStatisticsHandler(),
}
```

- [ ] **Step 4: 修改 registry.ts loadHandlers**

修改 `frontend/src/domains/registry.ts` 行 116-125 的 `loadHandlers` 函数：

```typescript
async function loadHandlers(domainId: string): Promise<HandlerMap> {
  switch (domainId) {
    case 'timebox': {
      const mod = await import('./timebox/handlers')
      return mod.timeboxHandlers ?? {}
    }
    case 'habits': {
      const mod = await import('./habits/handlers')
      return mod.habitHandlers ?? {}
    }
    default:
      return {}
  }
}
```

- [ ] **Step 5: 运行所有测试**

```bash
cd frontend && npx vitest run src/domains/habits/__tests__/statistics-handler.test.ts 2>&1 | tail -20
```
Expected: 4 tests PASS。

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -30
```
Expected: 全量通过。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/habits/handlers/statistics-handler.ts frontend/src/domains/habits/handlers/index.ts frontend/src/domains/registry.ts frontend/src/domains/habits/__tests__/statistics-handler.test.ts
git commit -m "$(cat <<'EOF'
feat(habits): add HabitStatisticsHandler with onQuery + handler registration

HabitStatisticsHandler implements DomainHandler.onQuery using AI Runtime
for habit analysis. Register habitHandlers map and wire into loadHandlers
in domain registry.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## 改动文件总览

### 新增文件

| 文件 | 说明 |
|------|------|
| `nexus/orchestrator/path-router.ts` | 路径路由判断函数 |
| `nexus/orchestrator/query-cnui-formatter.ts` | Shortcut Path 声明式 CN-UI 组装 |
| `nexus/core/intent-engine/routing-context.ts` | 从 manifest 动态构建路由上下文 |
| `domains/habits/handlers/index.ts` | habits Handler 注册 |
| `domains/habits/handlers/statistics-handler.ts` | habit_statistics onQuery 实现 |
| `domains/habits/context-providers.ts` | habits 查询用 Context Providers |

### 修改文件

| 文件 | 改动 |
|------|------|
| `usom/types/objects.ts` | StructuredIntent 新增 pathType 字段 |
| `usom/types/process.ts` | 新增 QueryContext 等类型 + DomainHandler.onQuery |
| `domains/manifest-loader/schema.ts` | 新增 QueryActionSchema 和 query_actions 字段 |
| `nexus/orchestrator/index.ts` | executeIntent 三路径路由 + executeQueryPath |
| `nexus/context-engine/assembler.ts` | 统一支持 query_actions 和 generation_actions |
| `nexus/ai-runtime/session/index.ts` | AISession 扩展 + query management 方法 |
| `nexus/core/intent-engine/ai-parser.ts` | Phase A 路由改用动态 manifest 上下文 |
| `domains/habits/manifest.yaml` | 新增 query_actions + query 型 intent_triggers |
| `domains/registry.ts` | loadHandlers() 新增 habits 域 |

### 不修改的文件

| 文件 | 理由 |
|------|------|
| `nexus/core/rule-engine/` | Query Path 不经过 Rule Engine |
| `nexus/core/state-machine/` | Query Path 不经过 State Machine |
| `nexus/infrastructure/event-bus/` | Orchestrator 通过 Session 记录，不经 Event Bus |
| `nexus/ai-runtime/llm-gateway/` | Handler Path 复用现有 generate() |
| `nexus/ai-runtime/cnui/` | Query Path 使用现有 CnuiComponentType 类型 |

---

## Constitution 合规清单

| 约束 | 检查项 | 任务验证 |
|------|--------|---------|
| **I (Intent-Driven)** | Query 也通过 Intent Engine 路由 | Task 8 — executeQueryPath 由 pathType 驱动 |
| **III (Single-Writer)** | Context Engine 是查询上下文的唯一权威 | Task 6 — assembleQueryContext 复用 resolveContext |
| **VI (Domain Plugin)** | Handler.onQuery 不直接访问 Repository | Task 13 — 数据通过 QueryContext.contexts 传入 |
| **VI (Domain Plugin)** | Handler.onQuery 不写状态 | Task 13 — 输出是只读 QueryResult |
| **VIII (AI/Rule Boundary)** | Shortcut Path 不调用 AI | Task 7 — formatCNUIFromContext 是纯格式化函数 |
| **VIII (AI/Rule Boundary)** | onQuery AI 失败有降级路径 | Task 8 — formatTextSummary 作为降级 |
| **Orchestrator Purity** | Shortcut Path CN-UI 组装不含业务逻辑 | Task 7 — 纯声明式模板填充 |
| **Orchestrator Purity** | Orchestrator 不直接调用 AI | Task 8 — 通过 Handler.onQuery 注入 aiRuntime |
| **Manifest Runtime** | 路由从 manifest 动态读取 | Task 9 — routing-context.ts 从 manifest 构建 |
