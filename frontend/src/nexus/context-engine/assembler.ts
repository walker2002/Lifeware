import type { StructuredIntent } from '@/usom/types/objects'
import type { GenerationRequest } from '@/usom/types/process'
import type { DomainManifest } from '@/domains/manifest-loader/schema'
import { resolveContext } from './registry'

export async function assembleContext(
  intent: StructuredIntent,
  manifest: DomainManifest,
): Promise<GenerationRequest> {
  const actionConfig = manifest.generation_actions?.[intent.action]
  if (!actionConfig) {
    throw new Error(`No generation_actions for "${intent.action}"`)
  }

  const contexts: Record<string, unknown> = {}
  for (const ctx of actionConfig.contexts) {
    const params = extractParams(ctx.params ?? [], intent.fields)
    contexts[ctx.id] = await resolveContext(ctx.id, ctx.query, params)
  }

  const request: GenerationRequest = { intent, contexts }

  // 注入 manifest 声明的扩展字段（Session、修订等）
  if (actionConfig.session_enabled) {
    request.sessionId = undefined // 由 Orchestrator 在运行时注入
  }

  return request
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
