/**
 * @file path-router
 * @brief 路径路由器
 * 
 * 根据 Domain manifest 声明判定意图路径类型
 */

import type { DomainManifest } from '@/domains/manifest-loader/schema'

/** 路径类型：契约式、生成式、查询式 */
export type PathType = 'contract' | 'generative' | 'query'

/**
 * 根据 Domain manifest 声明判定路径类型。
 * 查找优先级：query_actions > generation_actions > 默认 contract。
 * @param action - 动作名称
 * @param manifest - 领域 manifest
 * @returns 路径类型
 */
export function resolvePathType(
  action: string,
  manifest: DomainManifest | null,
): PathType {
  if (!manifest) return 'contract'

  if (manifest.query_actions?.[action]) return 'query'
  if (manifest.generation_actions?.[action]) return 'generative'
  return 'contract'
}
