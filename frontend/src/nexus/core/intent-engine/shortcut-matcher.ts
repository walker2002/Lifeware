import { getActionByShortcut, findDomain } from '@/domains/registry'

export interface ShortcutMatch {
  domainId: string
  action: string
  confidence: 1.0
}

const LONG_FORMAT_RE = /^\/(\w+):([\w-]+)$/
const SHORT_FORMAT_RE = /^\/([\w-]+)$/

export function matchShortcut(rawInput: string): ShortcutMatch | undefined {
  if (!rawInput || !rawInput.startsWith('/')) return undefined

  // Rule 1: Long format /domain:action
  const longMatch = rawInput.match(LONG_FORMAT_RE)
  if (longMatch) {
    const [, domainId, action] = longMatch
    const domain = findDomain(domainId)
    if (!domain) return undefined
    const triggers = domain.manifest.intentTriggers
    if (!triggers?.some(t => t.action === action)) return undefined
    return { domainId, action, confidence: 1.0 }
  }

  // Rule 2: Short format /action (shortcut lookup)
  const shortMatch = rawInput.match(SHORT_FORMAT_RE)
  if (shortMatch) {
    const [, shortcut] = shortMatch
    // The shortcut in manifest includes the leading '/', so we match as-is
    const result = getActionByShortcut(rawInput)
    if (result) return { ...result, confidence: 1.0 }
    return undefined
  }

  return undefined
}
