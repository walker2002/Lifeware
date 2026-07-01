/**
 * @file manifest-utils
 * @brief manifest 读取集中层 — 显式声明 SSOT，消除 getActionResponse 的 'text' fallback
 *
 * [023-01] autoplan H-2/codex Point 3：原 plan 含 view_routes fallback，与 Task 1
 * 守门员（显式声明哲学）冲突且字段读取不一致。删 fallback，统一为显式声明 SSOT。
 */
import { getFullManifest } from '@/domains/registry'

export type ResponseType = 'cnui' | 'page' | 'text' | 'unimplemented'

export function getResponseType(domainId: string, action: string): ResponseType {
  const manifest = getFullManifest(domainId)
  if (!manifest) return 'unimplemented'
  const trigger = (manifest.intent_triggers ?? []).find((t) => t.action === action)
  if (!trigger) return 'unimplemented'
  // 显式声明优先（Task 1 守门员保证有 view_route 的 trigger 必声明 page）
  if (trigger.response_type === 'page' || trigger.response_type === 'cnui' || trigger.response_type === 'text') {
    return trigger.response_type
  }
  // cnui_surface 推断（generation action 经 cnui_surface_type 声明）
  if (trigger.cnui_surface) return 'cnui'
  return 'text'
}