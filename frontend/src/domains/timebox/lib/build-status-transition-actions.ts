/**
 * @file build-status-transition-actions
 * @brief 从 manifest.lifecycle 派生 STATUS_TRANSITION_ACTIONS（[023.13] TD-019 A1）
 *
 * 复刻 buildActionMap（nexus/orchestrator/lifecycle-configs.ts:59-109）的 camelCase
 * 派生规则：对每条 lifecycle[objectType].transitions[*].action 生成
 * `${action}${PascalCase(objectType)}`（log+Timebox→logTimebox）。
 * 排除 `create`（create 需字段必含校验，不跳过）。
 *
 * 不 import orchestrator（会循环依赖），改用 loadDomainManifest 叶子模块。
 * timebox + appointment 两 objectType 同在 domains/timebox/manifest.yaml。
 */
import { loadDomainManifest } from '@/domains/manifest-loader'

/** snake_case_objectType → PascalCaseObjectType（timebox→Timebox, appointment→Appointment） */
function toPascalCase(snake: string): string {
  return snake.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

/**
 * 派生状态转换 action 集合（跳过字段必含校验的那些）。
 * 语义：这些 action 在 submitDynamicIntent 时 fields 仅 { objectId }。
 */
export function buildStatusTransitionActions(): Set<string> {
  const result = new Set<string>()
  const loaded = loadDomainManifest('timebox')
  if (!loaded.success) {
    // manifest 加载失败：返回空集，让字段校验兜底（fail-closed，不静默放行）
    return result
  }
  const lifecycle = loaded.manifest.lifecycle ?? {}
  for (const [objectType, def] of Object.entries(lifecycle)) {
    const pascal = toPascalCase(objectType)
    for (const t of (def as { transitions: Array<{ action: string }> }).transitions) {
      if (t.action === 'create') continue // create 需字段校验
      result.add(`${t.action}${pascal}`)
    }
  }
  return result
}