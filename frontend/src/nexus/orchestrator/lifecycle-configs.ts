// Lifecycle 配置 — 从各域 manifest 动态加载
// 已废弃内联对象，改为从 registry 读取

import type { LifecycleDefinition, FieldMetadata } from '@/usom/types/domain-types'
import { findDomain } from '@/domains/registry'

/**
 * 从 manifest 获取指定域的 lifecycle 定义
 * @deprecated 直接使用 manifest.lifecycle 替代
 */
export function getLifecycleFromManifest(domainId: string, objectType: string): LifecycleDefinition | undefined {
  const plugin = findDomain(domainId)
  if (!plugin) return undefined

  // plugin.manifest 是 process 层的简化版，需要从完整 manifest 获取
  // 通过 loadDomainManifest 获取完整 manifest
  try {
    const { loadDomainManifest } = require('@/domains/manifest-loader')
    const path = require('node:path')
    const domainDir = path.resolve(process.cwd(), `src/domains/${domainId}`)
    const result = loadDomainManifest(domainDir)
    if (result.success) {
      return result.manifest.lifecycle[objectType]
    }
  } catch {
    // fallback
  }
  return undefined
}

// ─── 动态 ACTION_MAP 构建 ─────────────────────────────────────

const DOMAIN_IDS = ['timebox', 'habits', 'okrs', 'tasks']

function toPascalCase(snake: string): string {
  return snake.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

/**
 * 从所有域 manifest 动态构建 intent action → SM action 映射。
 * 规则：
 *   1. lifecycle 转换：{action}{PascalCaseObjectType} → {action}
 *   2. legacy snake_case：{action}_{snake_case_object_type} → {action}
 *   3. intent_triggers 中含有多个对象名的情况（如 updateKeyResultProgress）
 *      剥离已知对象名后得到 shortAction
 */
export function buildActionMap(): Record<string, string> {
  const map: Record<string, string> = {}

  for (const domainId of DOMAIN_IDS) {
    let manifest: { lifecycle?: Record<string, { transitions: Array<{ action: string }> }>; intent_triggers?: Array<{ action: string }> }
    try {
      const { loadDomainManifest } = require('@/domains/manifest-loader')
      const path = require('node:path')
      const domainDir = path.resolve(process.cwd(), `src/domains/${domainId}`)
      const result = loadDomainManifest(domainDir)
      if (!result.success) continue
      manifest = result.manifest
    } catch {
      continue
    }

    const lifecycle = manifest.lifecycle ?? {}
    const objectTypes = Object.keys(lifecycle)
    const pascalNames = objectTypes.map(toPascalCase)

    // 从 lifecycle transitions 生成映射
    for (const [objectType, def] of Object.entries(lifecycle)) {
      const pascal = toPascalCase(objectType)
      for (const t of def.transitions) {
        // camelCase 约定：createTimebox → create
        map[`${t.action}${pascal}`] = t.action
        // snake_case 约定：create_timebox → create（legacy 兼容）
        map[`${t.action}_${objectType}`] = t.action
      }
    }

    // 从 intent_triggers 补充映射（处理 updateKeyResultProgress 等复合名）
    for (const trigger of manifest.intent_triggers ?? []) {
      if (map[trigger.action]) continue // 已有映射则跳过
      let short = trigger.action
      for (const pascal of pascalNames) {
        if (short.includes(pascal)) {
          short = short.replace(pascal, '')
          break
        }
      }
      if (short !== trigger.action) {
        map[trigger.action] = short
      }
    }
  }

  return map
}

// ─── 动态 getObjectType 替代 ─────────────────────────────────────

/**
 * 从域 manifest.lifecycle 的键动态推导目标对象类型（snake_case）。
 *
 * - 单键域（timebox → 'timebox'，habits → 'habit'）：直接返回该键。
 * - 多键域（okrs → 'objective' | 'key_result'）：将每个键转为 PascalCase
 *   后在 action 名中匹配，返回匹配到的键；无匹配时返回第一个键。
 */
export function resolveObjectType(domainId: string, action: string): string {
  try {
    const { loadDomainManifest } = require('@/domains/manifest-loader')
    const path = require('node:path')
    const domainDir = path.resolve(process.cwd(), `src/domains/${domainId}`)
    const result = loadDomainManifest(domainDir)
    if (!result.success) return domainId.replace(/s$/, '')

    const lifecycle = result.manifest.lifecycle ?? {}
    const keys = Object.keys(lifecycle)
    if (keys.length === 0) return domainId.replace(/s$/, '')
    if (keys.length === 1) return keys[0]

    // 多键域：将 snake_case 键转为 PascalCase 后在 action 中匹配
    const pascalToKey = new Map<string, string>()
    for (const key of keys) {
      const pascal = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
      pascalToKey.set(pascal, key)
    }
    for (const [pascal, key] of pascalToKey) {
      if (action.includes(pascal)) return key
    }
    return keys[0]
  } catch {
    return domainId.replace(/s$/, '')
  }
}

// ─── 域 transitions 导入替代 ─────────────────────────────────────

function findLifecycleTransition(
  lifecycle: { transitions: Array<{ from: string | string[] | null; action: string }> },
  fromState: string | null,
  action: string,
): { from: string | string[] | null; action: string; to: string; event_type: string } | undefined {
  for (const t of lifecycle.transitions) {
    const fromMatch = t.from === null
      ? fromState === null
      : Array.isArray(t.from)
        ? t.from.includes(fromState!)
        : t.from === fromState
    if (fromMatch && t.action === action) return t as ReturnType<typeof findLifecycleTransition>
  }
  return undefined
}

/**
 * 从域 manifest.lifecycle 动态加载转换规则，替代直接导入域 transitions 文件。
 * 返回匹配的 LifecycleTransition（含 eventType 字段，从 manifest event_type 映射）；若无匹配返回 undefined。
 */
export function getTransitionFromManifest(
  domainId: string,
  objectType: string,
  fromState: string | null,
  action: string,
): { from: string | string[] | null; action: string; to: string; eventType: string } | undefined {
  try {
    const { loadDomainManifest } = require('@/domains/manifest-loader')
    const path = require('node:path')
    const domainDir = path.resolve(process.cwd(), `src/domains/${domainId}`)
    const result = loadDomainManifest(domainDir)
    if (!result.success) return undefined

    const lifecycle = result.manifest.lifecycle?.[objectType]
    if (!lifecycle) return undefined

    const t = findLifecycleTransition(lifecycle as Parameters<typeof findLifecycleTransition>[0], fromState, action)
    if (!t) return undefined
    // manifest 使用 event_type，调用方期望 eventType
    return { from: t.from, action: t.action, to: t.to, eventType: (t as any).event_type ?? (t as any).eventType }
  } catch {
    return undefined
  }
}

// ─── 以下为过渡期保留的内联对象，标记 @deprecated ───

/** @deprecated 使用 getLifecycleFromManifest('timebox', 'timebox') 替代 */
export const timeboxLifecycle: LifecycleDefinition = {
  states: ['planned', 'running', 'overtime', 'ended', 'cancelled', 'logged'],
  initial_state: 'planned',
  transitions: [
    { from: null, to: 'planned', trigger: 'intent', action: 'create', event_type: 'TimeboxCreated' },
    { from: 'planned', to: 'running', trigger: 'intent', action: 'start', event_type: 'TimeboxStarted' },
    { from: 'running', to: 'ended', trigger: 'intent', action: 'end', event_type: 'TimeboxEnded' },
    { from: 'running', to: 'overtime', trigger: 'time', action: 'overtime', event_type: 'TimeboxOvertime' },
    { from: 'overtime', to: 'ended', trigger: 'intent', action: 'end', event_type: 'TimeboxEnded' },
    { from: 'planned', to: 'cancelled', trigger: 'intent', action: 'cancel', event_type: 'TimeboxCancelled' },
    { from: 'ended', to: 'logged', trigger: 'intent', action: 'log', event_type: 'TimeboxLogged' },
  ],
  terminal_states: ['cancelled', 'logged'],
}

/** @deprecated 从 manifest.field_metadata 中 type=lifecycle_timestamp 字段获取 */
export const timeboxFieldMeta: Record<string, FieldMetadata> = {
  startedAt: { type: 'lifecycle_timestamp', label: '开始时间', required: false },
  endedAt: { type: 'lifecycle_timestamp', label: '结束时间', required: false },
  overtimeAt: { type: 'lifecycle_timestamp', label: '超时时间', required: false },
}
