import type { DomainId } from '@/usom/types/primitives'
import type { DomainPlugin, DomainHandler } from '@/usom/types/process'
import { timeboxPlugin } from './timebox'
import { habitsPlugin } from './habits'
import { okrsPlugin } from './okrs'
import { tasksPlugin } from './tasks'
import { loadDomainManifest } from './manifest-loader'
import type { DomainManifest } from './manifest-loader/schema'

type FieldPrompt = DomainManifest['required_fields'][string][number]

const DOMAIN_IDS = ['timebox', 'habits', 'okrs', 'tasks'] as const

const allPlugins = [timeboxPlugin, habitsPlugin, okrsPlugin, tasksPlugin]

// 跳过加载失败的域（manifest 加载失败时 plugin 为 null）
export const domainRegistry: DomainPlugin[] = allPlugins.filter(Boolean) as DomainPlugin[]

export function findDomain(id: DomainId | string): DomainPlugin | undefined {
  return domainRegistry.find(p => p.manifest.domainId === id)
}

export class ShortcutConflictError extends Error {
  constructor(
    public readonly shortcut: string,
    public readonly domain1: string,
    public readonly domain2: string,
  ) {
    super(`Shortcut "${shortcut}" 冲突: ${domain1} 和 ${domain2} 都定义了此快捷方式`)
    this.name = 'ShortcutConflictError'
  }
}

export function getActionByShortcut(shortcut: string): { domainId: string; action: string } | undefined {
  for (const plugin of domainRegistry) {
    const triggers = plugin.manifest.intentTriggers
    if (!triggers) continue
    for (const t of triggers) {
      if (t.shortcut === shortcut) {
        return { domainId: plugin.manifest.domainId, action: t.action }
      }
    }
  }
  return undefined
}

export function getViewRoute(domainId: string, action: string): { component: string; params?: Record<string, unknown> } | undefined {
  const domain = findDomain(domainId)
  if (!domain?.manifest.viewRoutes) return undefined
  return domain.manifest.viewRoutes[action]
}

export function getAllDomainActions(): Array<{
  domainId: string
  domainName: string
  actions: Array<{ action: string; shortcut?: string; description: string; response_type?: string }>
}> {
  return domainRegistry.map(plugin => ({
    domainId: plugin.manifest.domainId,
    domainName: plugin.manifest.domainId,
    actions: plugin.manifest.intentTriggers ?? [],
  }))
}

export function getMarkdownTemplate(_domainId: string, _action: string): string | undefined {
  // MVP: 从 manifest templates.markdown 获取模板路径
  // 目前返回 undefined，T034-T037 时实现
  return undefined
}

export function getFullManifest(domainId: string): DomainManifest | undefined {
  const result = loadDomainManifest(domainId)
  return result.success ? result.manifest : undefined
}

export function getRequiredFields(domainId: string, action: string): FieldPrompt[] {
  const full = getFullManifest(domainId)
  if (!full?.required_fields) return []
  return full.required_fields[action] ?? []
}

export function hasRequiredFields(domainId: string, action: string): boolean {
  return getRequiredFields(domainId, action).length > 0
}

export function getActionDescription(domainId: string, action: string): string {
  const domain = findDomain(domainId)
  if (!domain?.manifest.intentTriggers) return ''
  const trigger = domain.manifest.intentTriggers.find(t => t.action === action)
  return trigger?.description ?? ''
}

/** 获取 intent trigger 中定义的 view_route URL（如 /habits），用于导航类意图直接跳转 */
export function getIntentTriggerViewRoute(domainId: string, action: string): string | undefined {
  const domain = findDomain(domainId)
  if (!domain?.manifest.intentTriggers) return undefined
  const trigger = domain.manifest.intentTriggers.find(t => t.action === action)
  return trigger?.view_route
}

export function validateShortcutUniqueness(): void {
  const shortcutMap = new Map<string, string>()
  for (const plugin of domainRegistry) {
    const triggers = plugin.manifest.intentTriggers
    if (!triggers) continue
    for (const t of triggers) {
      if (!t.shortcut) continue
      const existing = shortcutMap.get(t.shortcut)
      if (existing) {
        throw new ShortcutConflictError(t.shortcut, existing, plugin.manifest.domainId)
      }
      shortcutMap.set(t.shortcut, plugin.manifest.domainId)
    }
  }
}

// 启动时校验 shortcut 唯一性
validateShortcutUniqueness()

// ─── Handler 查找（Generative Path）───────────────────────────

type HandlerMap = Record<string, DomainHandler>

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
    case 'tasks': {
      const mod = await import('./tasks/cnui/handlers')
      return { createTask: mod.taskCnuiHandler as unknown as DomainHandler }
    }
    default:
      return {}
  }
}

export async function findHandler(domainId: string, action: string): Promise<DomainHandler | undefined> {
  const handlers = await loadHandlers(domainId)
  return handlers[action]
}
