/**
 * @file page
 * @brief Activity Archetype 配置管理页（手写 Next.js page，不走 codegen）
 *
 * 服务端组件：拉取全部 Archetype 数据 → 传递给客户端表格组件。
 * D4：类型归 USOM，运行时数据归 DB。不走 SM（OQ-7）。
 */

import { ActivityArchetypeRepository } from '@/lib/db/repositories/activity-archetype.repository'
import { ArchetypeTable } from '@/domains/timebox/config/archetype-table'

export default async function ActivityArchetypesPage() {
  const repo = new ActivityArchetypeRepository()
  const archetypes = await repo.findByUser('00000000-0000-0000-0000-000000000001') // MVP 固定用户

  return (
    <div className="space-y-4">
      <ArchetypeTable initialData={archetypes} />
    </div>
  )
}