/**
 * @file registry
 * @brief 领域插件注册表
 * 
 * 提供领域插件的注册、查找和快捷方式冲突检测功能
 */

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

/**
 * 查找指定 ID 的领域插件
 * 
 * @param id - 领域 ID
 * @returns 领域插件，未找到返回 undefined
 */
export function findDomain(id: DomainId | string): DomainPlugin | undefined {
  return domainRegistry.find(p => p.manifest.domainId === id)
}

/**
 * 快捷方式冲突错误
 */
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

/**
 * 根据快捷方式查找领域和动作
 * 
 * @param shortcut - 快捷方式字符串
 * @returns 领域 ID 和动作名称，未找到返回 undefined
 */
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

/**
 * 获取指定领域和动作的视图路由
 * 
 * @param domainId - 领域 ID
 * @param action - 动作名称
 * @returns 组件路径和参数，未找到返回 undefined
 */
export function getViewRoute(domainId: string, action: string): { component: string; params?: Record<string, unknown> } | undefined {
  const domain = findDomain(domainId)
  if (!domain?.manifest.viewRoutes) return undefined
  return domain.manifest.viewRoutes[action]
}

/**
 * 获取所有领域的所有动作
 * 
 * @returns 所有领域的动作列表
 */
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
//
// [023.08] T3 [F1 fold]: handler 加载时按需注入 deps（timeboxRepo + userId），
//   让 timebox 域能 wire rule-engine（TimeOverlapRule）做 overlap 检测。
//   无 deps 时走向后兼容 fallback（createTimeboxHandlers() 无参）。
//
// deps 来源：调用 findHandler 时由 caller 提供；目前仅 orchestrator 注入。
// 查找函数保留异步签名以兼容其他域 async load。

type HandlerMap = Record<string, DomainHandler>

interface HandlerDeps {
  timeboxRepo?: import('@/usom/interfaces/irepository').ITimeboxRepository
  userId?: import('@/usom/types/primitives').USOM_ID
}

async function loadHandlers(domainId: string, deps?: HandlerDeps): Promise<HandlerMap> {
  switch (domainId) {
    case 'timebox': {
      const mod = await import('./timebox/handlers')
      // [F1 fold]: 有 deps → 用 factory 注入；无 → 用向后兼容常量（保留原 behavior）
      if (deps?.timeboxRepo && deps?.userId) {
        return mod.createTimeboxHandlers({
          timeboxRepo: deps.timeboxRepo,
          userId: deps.userId,
        }) as HandlerMap
      }
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

/**
 * 查找指定 (domainId, action) 的 handler。
 *
 * [023.08] T3 [F1 fold]: 可选 deps 透传给 timebox 域 factory；其他域忽略。
 * orchestrator 必须传 deps（timeboxRepo + userId）才能 wire rule-engine。
 */
export async function findHandler(
  domainId: string,
  action: string,
  deps?: HandlerDeps,
): Promise<DomainHandler | undefined> {
  const handlers = await loadHandlers(domainId, deps)
  return handlers[action]
}
