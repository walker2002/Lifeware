/**
 * @file registry
 * @brief Context Capability 注册中心
 */

import type { ContextCapability } from '@/usom/types/process'

/** 能力注册表 */
const capabilities = new Map<string, ContextCapability>()

/**
 * 注册 Context 能力
 * @param cap - 能力定义
 */
export function registerContextCapability(cap: ContextCapability): void {
  capabilities.set(cap.id, cap)
}

/**
 * 解析 Context 能力并校验结果
 * @param capabilityId - 能力 ID
 * @param query - 查询字符串
 * @param params - 参数
 * @param requiredVisibility - 要求的可见性
 * @returns 校验后的数据
 * @throws 当能力未注册、可见性不匹配或数据校验失败时
 */
export async function resolveContext(
  capabilityId: string,
  query: string,
  params: Record<string, unknown>,
  requiredVisibility?: string,
): Promise<unknown> {
  const cap = capabilities.get(capabilityId)
  if (!cap) {
    throw new Error(`Context capability not found: "${capabilityId}"`)
  }

  if (requiredVisibility && cap.visibility !== requiredVisibility && cap.visibility !== 'system') {
    throw new Error(
      `Visibility mismatch: capability "${capabilityId}" has visibility "${cap.visibility}", but "${requiredVisibility}" was required`,
    )
  }

  const raw = await cap.provider.provide(query, params)
  const parsed = cap.schema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Schema validation failed for "${capabilityId}": ${issues}`)
  }

  return parsed.data
}

/**
 * 获取已注册的能力 ID 列表
 * @returns 能力 ID 列表
 */
export function getRegisteredCapabilities(): string[] {
  return Array.from(capabilities.keys())
}

export function clearRegistry(): void {
  capabilities.clear()
}
