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
