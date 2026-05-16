import type { DomainPlugin, DomainManifest as ProcessManifest } from '@/usom/types/process'
import type { DomainManifest as FullManifest } from './manifest-loader/schema'
import { createTimeboxHooks } from './timebox/hooks'
import { createHabitsHooks } from './habits/hooks'
import { createOkrsHooks } from './okrs/hooks'
import { createTasksHooks } from './tasks/hooks'

interface Hooks {
  onValidate: DomainPlugin['onValidate']
  onEvent: DomainPlugin['onEvent']
  onActionSurfaceRequest: DomainPlugin['onActionSurfaceRequest']
}

function extractRequiredFields(manifest: FullManifest): string[] {
  const fieldSet = new Set<string>()
  for (const fields of Object.values(manifest.required_fields)) {
    for (const field of fields) {
      fieldSet.add(field.name)
    }
  }
  return [...fieldSet]
}

function getHooksForDomain(manifest: FullManifest): Hooks {
  switch (manifest.id) {
    case 'timebox':
      return createTimeboxHooks(manifest)
    case 'habits':
      return createHabitsHooks(manifest)
    case 'okrs':
      return createOkrsHooks(manifest)
    case 'tasks':
      return createTasksHooks(manifest)
    default:
      throw new Error(`Unknown domain: ${manifest.id}`)
  }
}

export function createDomainPlugin(
  fullManifest: FullManifest,
  hooks?: Hooks,
): DomainPlugin {
  const resolvedHooks = hooks ?? getHooksForDomain(fullManifest)

  const manifest: ProcessManifest = {
    domainId: fullManifest.id as ProcessManifest['domainId'],
    version: fullManifest.version,
    requiredFields: extractRequiredFields(fullManifest),
    subscribedEvents: fullManifest.subscribed_events as ProcessManifest['subscribedEvents'],
  }

  return {
    manifest,
    onValidate: resolvedHooks.onValidate,
    onEvent: resolvedHooks.onEvent,
    onActionSurfaceRequest: resolvedHooks.onActionSurfaceRequest,
  }
}
