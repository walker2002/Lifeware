import type { ContextCapability } from '@/usom/types/process'

const capabilities = new Map<string, ContextCapability>()

export function registerContextCapability(cap: ContextCapability): void {
  capabilities.set(cap.id, cap)
}

export async function resolveContext(
  capabilityId: string,
  query: string,
  params: Record<string, unknown>,
  requiredVisibility?: string,
): Promise<unknown> {
  const cap = capabilities.get(capabilityId)
  if (!cap) {
    throw new Error(`Context capability not found: "${capabilityId}"`)
  }

  if (requiredVisibility && cap.visibility !== requiredVisibility && cap.visibility !== 'system') {
    throw new Error(
      `Visibility mismatch: capability "${capabilityId}" has visibility "${cap.visibility}", but "${requiredVisibility}" was required`,
    )
  }

  const raw = await cap.provider.provide(query, params)
  const parsed = cap.schema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Schema validation failed for "${capabilityId}": ${issues}`)
  }

  return parsed.data
}

export function getRegisteredCapabilities(): string[] {
  return Array.from(capabilities.keys())
}

export function clearRegistry(): void {
  capabilities.clear()
}
