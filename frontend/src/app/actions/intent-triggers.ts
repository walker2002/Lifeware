'use server'

export interface IntentTrigger {
  label: string
  shortcut: string
  domainId: string
  action: string
}

/** 从所有 Domain manifest 的 intent_triggers 动态读取有 shortcut 的意图 */
export async function fetchIntentTriggers(): Promise<IntentTrigger[]> {
  const { domainRegistry } = await import("@/domains/registry")
  const triggers: IntentTrigger[] = []
  for (const plugin of domainRegistry) {
    const items = plugin.manifest.intentTriggers
    if (!items) continue
    for (const t of items) {
      if (t.shortcut && !t.view_route) {
        triggers.push({
          label: t.description || t.action,
          shortcut: t.shortcut,
          domainId: plugin.manifest.domainId,
          action: t.action,
        })
      }
    }
  }
  return triggers
}
