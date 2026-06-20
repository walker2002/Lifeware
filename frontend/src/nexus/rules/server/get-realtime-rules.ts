/**
 * @file get-realtime-rules
 * @brief [018-G3] R1 §4.5 method B — 取 phase: both 规则元数据的 server action
 *
 * loadDomainManifest 是 server-only（import fs），client 组件不可直接调。
 * 本 action 在服务端读取 manifest、过滤 phase: both 规则、返回可序列化元数据，
 * 供 client 表单（useManifestRules）消费。check 函数本身由 client import registry 子集。
 */
'use server'

import { loadDomainManifest } from '@/domains/manifest-loader'
import type { RealtimeRuleMeta } from '../realtime'

/**
 * 取指定域的 phase: both 规则元数据（id/fields）。
 * @param domainId 域 id
 * @returns phase: both 规则元数据数组（加载失败或无规则 → 空数组）
 */
export async function getRealtimeRules(domainId: string): Promise<RealtimeRuleMeta[]> {
  const loaded = loadDomainManifest(domainId)
  if (!loaded.success) return []
  const rules = loaded.manifest.rules ?? []
  return rules.filter((r) => r.phase === 'both').map((r) => ({ id: r.id, fields: r.fields }))
}
