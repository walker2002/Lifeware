import type { DomainManifest } from '@/domains/manifest-loader/schema'

export type PathType = 'contract' | 'generative' | 'query'

/**
 * 根据 Domain manifest 声明判定路径类型。
 * 查找优先级：query_actions > generation_actions > 默认 contract。
 */
export function resolvePathType(
  _domainId: string,
  action: string,
  manifest: DomainManifest | null,
): PathType {
  if (!manifest) return 'contract'

  if (manifest.query_actions?.[action]) return 'query'
  if (manifest.generation_actions?.[action]) return 'generative'
  return 'contract'
}
