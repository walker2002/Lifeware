/**
 * @file load-activity-archetypes
 * @brief 服务端预取 Activity Archetype（lib/server 目录约定：仅 server 调用）
 *
 * 从 app/config/activity-archetypes/page.tsx 抽出。page 退化为 thin wrapper 后
 * 由 domains/timebox/config/activity-archetypes-page.tsx 调用。
 * 不加 'server-only' 标记——入口组件本身是 async server component，边界已隔离。
 */
import { ActivityArchetypeRepository } from '@/lib/db/repositories/activity-archetype.repository'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

/** MVP 固定用户 ID（与 app/actions 现状一致，待多租户落地替换） */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * 预取当前用户全部 archetype（按 l1Category/l2Name 排序，repo 内置）
 * @returns ActivityArchetype 列表
 */
export async function loadActivityArchetypes(): Promise<ActivityArchetype[]> {
  const repo = new ActivityArchetypeRepository()
  return repo.findByUser(MVP_USER_ID)
}
