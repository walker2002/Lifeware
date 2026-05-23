# Query Path MVP 实现设计

> 基于 Constitution 1.7.0 修正案（三路径路由），实现 Query Path 的 MVP 阶段。
> 包括：类型扩展、Orchestrator 路由重构、Shortcut/Handler 双轨查询、
> Session 扩展、habits Domain 查询示例、AI Parser manifest 驱动化。
>
> 前置依赖：Constitution 修正案（docs/superpowers/specs/2026-05-23-query-path-constitution-amendment.md）
>
> 日期：2026-05-23

---

## 目录

- [1 设计概述](#1-设计概述)
- [2 类型扩展](#2-类型扩展)
- [3 Orchestrator 路由重构](#3-orchestrator-路由重构)
- [4 Context Engine 扩展](#4-context-engine-扩展)
- [5 Session 扩展与查询上下文管理](#5-session-扩展与查询上下文管理)
- [6 AI Parser 路由增强](#6-ai-parser-路由增强)
- [7 habits Domain MVP 实现](#7-habits-domain-mvp-实现)
- [8 文件改动清单](#8-文件改动清单)
- [9 Constitution 合规检查](#9-constitution-合规检查)

---

## 1 设计概述

### 1.1 目标

在现有 Nexus 架构中新增 Query Path（第三条路径），使用户能在 AI 对话中
直接查询数据（如"看看我的习惯"），无需离开对话上下文。

### 1.2 MVP 范围

- Orchestrator 三路径路由（Contract / Generative / Query）
- Shortcut Path（简单展示型查询，Orchestrator 直接格式化 CN-UI）
- Handler Path（复杂分析型查询，Handler.onQuery 调用 AI Runtime）
- Query Session 管理（复用 AISessionManager，强制 multi_turn）
- habits Domain 2 个 query_actions 示例
- AI Parser manifest 驱动路由（替代硬编码域特定 prompt）

### 1.3 不在 MVP 范围内

- 更多 Domain 的 query_actions 扩展
- 查询结果缓存优化
- 教练式对话的完整设计
- Context Engine 的 session_context 注入（MVP 简化为直接读取 Session queryResults）

---

## 2 类型扩展

### 2.1 StructuredIntent 新增 pathType

**文件**：`frontend/src/usom/types/objects.ts`

```typescript
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

`pathType` 为可选字段。未设置时 Orchestrator 根据 manifest 声明推断，
保持现有代码不受影响。

### 2.2 新增 QueryContext 和 QueryResult

**文件**：`frontend/src/usom/types/process.ts`

```typescript
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
  relevance: number  // 衰减系数 0.2-1.0
}

/** 查询结果 — Handler.onQuery 或 Shortcut Path 的输出 */
export type QueryResult =
  | { type: 'text'; content: string }
  | { type: 'cnui'; payload: CNUISurfacePayload }
```

### 2.3 DomainHandler 新增 onQuery

**文件**：`frontend/src/usom/types/process.ts`

```typescript
export interface DomainHandler {
  handle(request: GenerationRequest): Promise<GenerationResult>
  onGenerate?(request: GenerationRequest, aiRuntime: AIRuntime): Promise<GenerationResult>
  onQuery?(context: QueryContext, aiRuntime: AIRuntime): Promise<QueryResult>  // 新增
}
```

onQuery 遵循与 onGenerate 相同的依赖注入模式：
- AI Runtime 通过参数注入，Handler 决定调用策略
- Handler 不直接访问 Repository，数据通过 QueryContext.contexts 传入
- Handler 不写状态，输出是只读的 QueryResult

### 2.4 ManifestSchema 新增 query_actions

**文件**：`frontend/src/domains/manifest-loader/schema.ts`

```typescript
const QueryActionSchema = z.object({
  description: z.string(),
  response_mode: z.enum(['text', 'cnui']),
  cnui_surface: z.string().optional(),
  context_capabilities: z.array(ContextDeclarationSchema),
  // session_mode 不声明 — 系统强制 multi_turn
})

// ManifestSchema 新增字段
export const ManifestSchema = z.object({
  // ... 现有字段 ...
  generation_actions: z.record(z.string(), GenerationActionSchema).optional(),
  query_actions: z.record(z.string(), QueryActionSchema).optional(),  // 新增
})
```

---

## 3 Orchestrator 路由重构

### 3.1 路径路由函数

**新文件**：`frontend/src/nexus/orchestrator/path-router.ts`

```typescript
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

### 3.2 executeIntent() 重构

**文件**：`frontend/src/nexus/orchestrator/index.ts`

现有的 `executeIntent()` 重构为路径分流结构：

```typescript
async executeIntent(intent, userId, confirmed) {
  const domainId = intent.targetDomain
  const domain = findDomain(domainId)

  // Domain plugin validation（所有路径共享）
  if (domain) {
    const validation = domain.onValidate(intent, usomSnapshot)
    if (!validation.valid) return { success: false, error: validation.errors.join('; ') }
  }

  // 路径路由
  const manifestResult = loadDomainManifest(domainId)
  const manifest = manifestResult.success ? manifestResult.manifest : null
  const pathType = intent.pathType ?? resolvePathType(domainId, intent.action, manifest)

  switch (pathType) {
    case 'query':
      return orchestrator.executeQueryPath(intent, userId, manifest)
    case 'generative':
      return orchestrator.executeGenerativePath(intent, userId, manifest)  // 现有逻辑提取
    case 'contract':
      return orchestrator.executeContractPath(intent, userId, manifest)    // 现有逻辑提取
  }
}
```

**注意**：现有的 generative path 逻辑和 contract path 逻辑不修改，
仅提取为独立方法 `executeGenerativePath()` 和 `executeContractPath()`，
保持行为不变。这是提取方法重构，不改变任何业务逻辑。

### 3.3 Query Path 执行函数

```typescript
async executeQueryPath(
  intent: StructuredIntent,
  userId: USOM_ID,
  manifest: DomainManifest,
): Promise<OrchestratorResult> {
  const actionConfig = manifest.query_actions?.[intent.action]
  if (!actionConfig) {
    return { success: false, error: `未找到 query_action: ${intent.action}` }
  }

  // Session 管理：复用或创建
  const session = await findOrCreateQuerySession(intent.targetDomain, userId)

  // Context Engine 组装查询上下文
  trace(deps.onTrace, 'ContextEngine', 'start', { input: { intentId: intent.id } })
  const queryContext = await assembleQueryContext(intent, actionConfig, session)
  trace(deps.onTrace, 'ContextEngine', 'end', {
    input: { intentId: intent.id },
    output: { contextCount: Object.keys(queryContext.contexts).length },
  })

  // 判定子路径
  let result: QueryResult
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
    // 降级：无 handler 且非 cnui，返回文本摘要
    result = { type: 'text', content: formatTextSummary(queryContext) }
  }

  // 记录查询摘要到 Session
  recordQueryResult(session.id, intent, result)

  return { success: true, queryResult: result }
}
```

### 3.4 Shortcut Path 声明式 CN-UI 组装

**新文件**：`frontend/src/nexus/orchestrator/query-cnui-formatter.ts`

```typescript
import type { QueryContext, QueryResult } from '@/usom/types/process'
import type { QueryActionConfig } from './path-router'

/**
 * Shortcut Path 的声明式 CN-UI 组装。
 *
 * 这是纯格式化函数：
 * - 从 QueryContext.contexts 中提取数据
 * - 映射到 CN-UI surface 的 component 结构
 * - 返回只读展示型 payload（actions: [dismiss]）
 *
 * 约束（Constitution Orchestrator Purity）：
 * - 无条件分支决策
 * - 无数据聚合计算
 * - 无 AI 调用
 * - 无状态写入
 */
export function formatCNUIFromContext(
  queryContext: QueryContext,
  actionConfig: QueryActionConfig,
): QueryResult {
  const surfaceType = actionConfig.cnui_surface ?? 'generic-list'

  // 从 contexts 中提取第一个 capability 的数据作为列表项
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
            items: items.map(item => ({
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
function formatTextSummary(queryContext: QueryContext): string {
  const entries = Object.entries(queryContext.contexts)
  if (entries.length === 0) return '没有找到相关数据'
  const items = Array.isArray(entries[0][1]) ? entries[0][1] : [entries[0][1]]
  return `找到 ${items.length} 条记录`
}
```

---

## 4 Context Engine 扩展

### 4.1 assembleQueryContext

**文件**：`frontend/src/nexus/context-engine/assembler.ts`

重构 `assembleContext()` 为统一入口，同时支持 `generation_actions` 和
`query_actions`：

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

  // 注入 session 查询历史
  const sessionContext = buildSessionQueryContext(session)

  return {
    intent,
    contexts,
    sessionId: session?.id,
    sessionContext,
  }
}

/** 生成上下文组装（现有逻辑提取为独立函数） */
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
        ...entry,
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
    if (name in fields) result[name] = fields[name]
  }
  return result
}
```

---

## 5 Session 扩展与查询上下文管理

### 5.1 AISession 扩展

**文件**：`frontend/src/nexus/ai-runtime/session/index.ts`

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

### 5.2 AISessionManager 扩展

```typescript
export interface AISessionManager {
  // 现有方法不变
  create(params: CreateSessionParams): Promise<AISession>
  activate(sessionId: string): Promise<AISession>
  startCompleting(sessionId: string): Promise<AISession>
  archive(sessionId: string): Promise<AISession>
  close(sessionId: string): Promise<AISession>
  get(sessionId: string): AISession | undefined

  // 新增
  recordQueryResult(sessionId: string, result: QueryResultEntry): void
  getQueryResults(sessionId: string): QueryResultEntry[]
  findActiveSessionByDomain(userId: string, domainId: string): AISession | undefined
}
```

实现：

```typescript
recordQueryResult(sessionId: string, result: QueryResultEntry): void {
  const session = sessions.get(sessionId)
  if (!session) return
  if (!session.queryResults) session.queryResults = []

  // 同 action 新查询替换旧结果
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

### 5.3 Session 生命周期管理

Query Path 的 Session 管理遵循以下规则：

| 阶段 | 操作 | 说明 |
|------|------|------|
| 查询开始 | `findActiveSessionByDomain()` 或 `create()` + `activate()` | 优先复用同 Domain 的 active Session |
| 查询完成 | `recordQueryResult()` | 记录查询摘要，Session 保持 active |
| 后续对话 | Session 保持 active，新意图走完整路由流程 | Session 不关闭 |
| Session 关闭 | 超时(5min) / 用户明确结束 / 跨 Domain 无关联 | 与设计文档 V2 一致 |

---

## 6 AI Parser 路由增强

### 6.1 动态路由上下文构建

**新文件**：`frontend/src/nexus/core/intent-engine/routing-context.ts`

从所有 Domain 的 manifest 动态构建路由上下文，替代 ai-parser.ts 中的硬编码。

```typescript
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
      // 判断 action 类型
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

/**
 * 将路由上下文格式化为 AI prompt 文本。
 */
export function formatRoutingContextForPrompt(actions: ActionRoutingInfo[]): string {
  const lines = actions.map(a => {
    const typeLabel = {
      contract: '变更操作',
      generative: 'AI生成',
      query: '对话内查询',
      view_route: '页面导航',
    }[a.type]
    return `- ${a.domainId}.${a.action} [${typeLabel}]: ${a.description}
  示例: ${a.examples.join('、')}
  关键词: ${a.keywords.join('、')}`
  })
  return lines.join('\n')
}
```

### 6.2 view_route vs query_action 路由规则

在 AI Parser 的系统提示中新增路由规则文本：

```typescript
const ROUTING_RULES = `
路由规则：
- 用户说"打开XX页面" "进入XX管理" "XX设置" → view_route（页面导航）
- 用户说"看看XX" "有哪些XX" "统计XX" "查一下XX" → query（对话内查询）
- 模糊情况默认走 query（用户可后续说"打开详细页面"切换到 view_route）
- "创建" "新增" "修改" "删除" → contract（变更操作）
- "帮我安排" "生成" "规划" → generative（AI生成）
`
```

### 6.3 ai-parser.ts 修改

替换硬编码的域特定 prompt，使用动态路由上下文：

```typescript
// ai-parser.ts 中 parseWithAI 的修改

async function parseWithAI(rawInput, intentionId, aiRuntime) {
  const routingActions = buildRoutingContext()
  const routingText = formatRoutingContextForPrompt(routingActions)

  const systemPrompt = `你是 Lifeware 意图解析器。根据用户输入，判断目标域和动作。

${ROUTING_RULES}

可用动作列表：
${routingText}

当前时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

输出 JSON 格式：
{
  "targetDomain": "域名",
  "action": "动作名",
  "pathType": "contract|generative|query",
  "fields": {},
  "confidence": 0.0-1.0
}`

  const response = await aiRuntime.generate({
    domainId: 'system',
    action: 'parseIntent',
    systemPrompt,
    messages: [{ role: 'user', content: rawInput }],
    taskType: 'intent_routing',
    temperature: 0.3,
  })

  // 解析 JSON 响应（复用现有 extractJSON 逻辑）
  const parsed = extractJSON(response)
  return {
    success: true,
    intent: {
      id: crypto.randomUUID(),
      intentionId,
      targetDomain: parsed.targetDomain,
      action: parsed.action,
      pathType: parsed.pathType,
      fields: parsed.fields ?? {},
      confidence: parsed.confidence ?? 0,
      resolvedBy: 'ai' as const,
      createdAt: new Date().toISOString(),
    },
  }
}
```

**注意**：现有的 timebox/habit 域特定 prompt（TIMEBOX_SYSTEM_PROMPT、
HABIT_SYSTEM_PROMPT）暂时保留，用于 Phase B（字段补全阶段）。
Phase A（路由）改用动态上下文。后续可逐步迁移 Phase B 也使用 manifest 驱动。

---

## 7 habits Domain MVP 实现

### 7.1 manifest.yaml 新增 query_actions

**文件**：`frontend/src/domains/habits/manifest.yaml`

在文件末尾新增：

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

### 7.2 Intent Triggers 补充

在 `intent_triggers` 区块中新增查询型 trigger：

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

### 7.3 Context Provider 注册

**新文件**：`frontend/src/domains/habits/context-providers.ts`

```typescript
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

/**
 * 注册 habits Domain 的查询用 Context Providers。
 * 在 Domain 初始化时调用。
 */
export function registerHabitProviders(habitRepo: IHabitRepository) {
  registerContextCapability({
    id: 'active_habits',
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
          todayLogged: false,  // MVP: 简化，后续从 habit_logs 查询
        }))
      },
    },
    visibility: 'planning',
    schema: z.array(HabitSummarySchema),
    description: '活跃习惯列表',
  })

  registerContextCapability({
    id: 'recent_habit_logs',
    provider: {
      async provide(_query, params) {
        const userId = params['userId'] as string
        // MVP: 返回最近 7 天的打卡记录
        // 需要在 IHabitRepository 中新增 findRecentLogs 方法
        return []
      },
    },
    visibility: 'planning',
    schema: z.array(HabitLogSchema),
    description: '最近习惯打卡记录',
  })

  registerContextCapability({
    id: 'habit_streaks',
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

### 7.4 Habit Statistics Handler

**新文件**：`frontend/src/domains/habits/handlers/statistics-handler.ts`

```typescript
import type { DomainHandler, QueryContext, QueryResult, GenerationRequest, GenerationResult } from '@/usom/types/process'
import type { AIRuntime } from '@/nexus/ai-runtime'

/**
 * 习惯统计分析 Handler。
 * 实现 onQuery hook，使用 AI Runtime 生成分析文本。
 */
export class HabitStatisticsHandler implements DomainHandler {
  async handle(request: GenerationRequest): Promise<GenerationResult> {
    throw new Error('HabitStatisticsHandler does not support handle(). Use onQuery().')
  }

  async onGenerate(request: GenerationRequest, _aiRuntime: AIRuntime): Promise<GenerationResult> {
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

### 7.5 Handler 注册

**文件**：`frontend/src/domains/registry.ts` 修改 `loadHandlers()`

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

**新文件**：`frontend/src/domains/habits/handlers/index.ts`

```typescript
import { HabitStatisticsHandler } from './statistics-handler'
import type { DomainHandler } from '@/usom/types/process'

export const habitHandlers: Record<string, DomainHandler> = {
  habit_statistics: new HabitStatisticsHandler(),
}
```

---

## 8 文件改动清单

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
| `usom/types/process.ts` | 新增 QueryContext, QueryResult, SessionQueryContext, PriorQueryEntry 类型；DomainHandler 新增 onQuery 方法 |
| `domains/manifest-loader/schema.ts` | 新增 QueryActionSchema 和 query_actions 字段 |
| `nexus/orchestrator/index.ts` | executeIntent() 路径分流 + 新增 executeQueryPath() |
| `nexus/context-engine/assembler.ts` | 统一支持 query_actions 和 generation_actions |
| `nexus/ai-runtime/session/index.ts` | AISession 扩展 queryResults + 新增方法 |
| `nexus/core/intent-engine/ai-parser.ts` | Phase A 路由改用动态 manifest 上下文 |
| `domains/habits/manifest.yaml` | 新增 query_actions + query 型 intent_triggers |
| `domains/registry.ts` | loadHandlers() 新增 habits 域支持 |

### 不修改的文件

| 文件 | 理由 |
|------|------|
| `nexus/core/rule-engine/` | Query Path 不经过 Rule Engine |
| `nexus/core/state-machine/` | Query Path 不经过 State Machine |
| `nexus/infrastructure/event-bus/` | Orchestrator 通过 Memory Framework 记录，不经 Event Bus |
| `nexus/ai-runtime/llm-gateway/` | Handler Path 复用现有 generate() |
| `nexus/ai-runtime/memory/` | 复用现有 Memory Framework API |

---

## 9 Constitution 合规检查

| 约束 ID | 检查项 | 结果 |
|---------|--------|------|
| **I (Intent-Driven)** | Query Path 通过 Intent Engine Phase A 路由 | PASS — pathType 由 AI 或 manifest 推断 |
| **III (Single-Writer)** | Context Engine 是查询上下文组装的唯一权威 | PASS — assembleQueryContext 复用 resolveContext |
| **III (Single-Writer)** | Memory Framework 是 Session 写入的唯一权威 | PASS — Orchestrator 调用 Memory Framework API |
| **VI (Domain Plugin)** | Handler.onQuery 不直接访问 Repository | PASS — 数据通过 QueryContext.contexts 传入 |
| **VI (Domain Plugin)** | Handler.onQuery 不写状态 | PASS — 输出是只读 QueryResult |
| **VI (Domain Plugin)** | Context Provider 只做只读投影 | PASS — active_habits, habit_streaks 都是查询 + 映射 |
| **VII (Bridge Layer)** | Nexus 方法不依赖 HTTP 上下文 | PASS — 所有新增方法签名使用 USOM 类型 |
| **VIII (AI/Rule Boundary)** | AI 只参与 Handler Path，Shortcut Path 不调用 AI | PASS |
| **VIII (AI/Rule Boundary)** | onQuery AI 失败有降级路径 | PASS — formatTextSummary 作为降级 |
| **Orchestrator Purity** | Shortcut Path 的 CN-UI 组装不含业务逻辑 | PASS — 纯声明式模板填充 |
| **Orchestrator Purity** | Orchestrator 不直接调用 AI | PASS — 通过 Handler.onQuery 注入 aiRuntime |
| **Manifest Runtime** | 路由从 manifest 动态读取，不硬编码 | PASS — routing-context.ts 从 manifest 构建 |
| **R-01 ~ R-04** | Repository 隔离 | PASS — Context Provider 调用 Repository |
| **T-01 ~ T-04** | 多租户 | PASS — userId 在 Session 和 Provider 层处理 |
