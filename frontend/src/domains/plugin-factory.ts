/**
 * @file plugin-factory
 * @brief 领域插件工厂
 * 
 * 根据领域 manifest 创建领域插件实例
 */

import type { DomainPlugin, DomainManifest as ProcessManifest } from '@/usom/types/process'
import type { DomainManifest as FullManifest } from './manifest-loader/schema'
import type { IntentTriggerInfo, ViewRouteInfo } from '@/usom/types/process'
import { createTimeboxHooks } from './timebox/hooks'
import { createHabitsHooks } from './habits/hooks'
import { createOkrsHooks } from './okrs/hooks'
import { createTasksHooks } from './tasks/hooks'

/**
 * 领域钩子接口
 */
interface Hooks {
  /** 验证钩子 */
  onValidate: DomainPlugin['onValidate']
  /** 事件钩子 */
  onEvent: DomainPlugin['onEvent']
  /** 动作面请求钩子 */
  onActionSurfaceRequest: DomainPlugin['onActionSurfaceRequest']
}

/**
 * 从 manifest 提取必填字段列表
 * 
 * @param manifest - 完整领域 manifest
 * @returns 必填字段名列表
 */
function extractRequiredFields(manifest: FullManifest): string[] {
  const fieldSet = new Set<string>()
  for (const fields of Object.values(manifest.required_fields)) {
    for (const field of fields) {
      fieldSet.add(field.name)
    }
  }
  return [...fieldSet]
}

/**
 * 根据领域 ID 获取对应的钩子
 * 
 * @param manifest - 完整领域 manifest
 * @returns 领域钩子
 */
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

/**
 * 创建领域插件
 * 
 * @param fullManifest - 完整领域 manifest
 * @param hooks - 可选的钩子实现
 * @returns 领域插件实例
 */
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
    intentTriggers: fullManifest.intent_triggers.map(t => ({
      action: t.action,
      shortcut: t.shortcut,
      description: t.description,
      view_route: t.view_route,
      response_type: t.response_type,
    })) as IntentTriggerInfo[],
    viewRoutes: fullManifest.view_routes as Record<string, ViewRouteInfo> | undefined,
  }

  return {
    manifest,
    onValidate: resolvedHooks.onValidate,
    onEvent: resolvedHooks.onEvent,
    onActionSurfaceRequest: resolvedHooks.onActionSurfaceRequest,
  }
}
