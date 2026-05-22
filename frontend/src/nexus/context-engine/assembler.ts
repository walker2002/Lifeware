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

  return { intent, contexts }
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
