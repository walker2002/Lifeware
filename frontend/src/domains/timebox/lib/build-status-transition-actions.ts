/**
 * @file build-status-transition-actions
 * @brief 从 manifest.lifecycle 派生 STATUS_TRANSITION_ACTIONS（[023.13] TD-019 A1）
 *
 * 复刻 buildActionMap（nexus/orchestrator/lifecycle-configs.ts:59-109）的 camelCase
 * 派生规则：对每条 lifecycle[objectType].transitions[*].action 生成
 * `${action}${PascalCase(objectType)}`（log+Timebox→logTimebox）。
 * 排除 `create`（create 需字段必含校验，不跳过）。
 *
 * 结构：
 * - `deriveStatusTransitionActions(rawManifest)`：纯函数,接受已加载的 raw manifest
 *   对象,无副作用。validator 可静态 import 复用(避开 manifest-loader 的 @/ alias + 副作用链)。
 * - `buildStatusTransitionActions()`:wrapper,负责加载 + 失败兜底;消费方应调它。
 *
 * timebox + appointment 两 objectType 同在 domains/timebox/manifest.yaml。
 */
import { loadDomainManifest } from '@/domains/manifest-loader'

/** snake_case_objectType → PascalCaseObjectType（timebox→Timebox, appointment→Appointment） */
function toPascalCase(snake: string): string {
  return snake.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

/** rawManifest 形态（与 manifest-loader 输出一致的最窄子集） */
export interface RawManifestLike {
  lifecycle?: Record<string, { transitions?: Array<{ action?: string }> }>
}

/**
 * 派生状态转换 action 集合（跳过字段必含校验的那些）。
 *
 * 纯函数：无 import 副作用、无 I/O。validator 与单测可直接传入 mock manifest
 * 验证逻辑,无需走 loadDomainManifest。
 *
 * 语义:这些 action 在 submitDynamicIntent 时 fields 仅 { objectId }。
 */
export function deriveStatusTransitionActions(rawManifest: RawManifestLike | null | undefined): Set<string> {
  const result = new Set<string>()
  if (!rawManifest) return result
  const lifecycle = rawManifest.lifecycle ?? {}
  for (const [objectType, def] of Object.entries(lifecycle)) {
    const pascal = toPascalCase(objectType)
    for (const t of def.transitions ?? []) {
      const action = t.action
      if (!action) continue
      if (action === 'create') continue
      result.add(`${action}${pascal}`)
    }
  }
  return result
}

/**
 * 运行时 wrapper:加载 timebox manifest 后调纯函数。
 * manifest 加载失败返回空集,让字段校验兜底(fail-closed,不静默放行)。
 */
export function buildStatusTransitionActions(): Set<string> {
  const loaded = loadDomainManifest('timebox')
  if (!loaded.success) {
    return deriveStatusTransitionActions(null)
  }
  return deriveStatusTransitionActions(loaded.manifest as RawManifestLike)
}