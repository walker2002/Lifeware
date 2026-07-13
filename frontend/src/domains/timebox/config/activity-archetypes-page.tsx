/**
 * @file activity-archetypes-page
 * @brief Activity Archetype 配置页 domain 入口（async server component）
 *
 * 从 app/config/activity-archetypes/page.tsx 抽出：server 预取 + space-y-4 容器渲染。
 * page 退化为 thin wrapper 后由 codegen 生成 <ActivityArchetypesPage />。
 * ArchetypeTable 经 git mv 后从同目录相对导入，供本入口与设置页共享。
 * D4：类型归 USOM，运行时数据归 DB。不走 SM（OQ-7）。
 */
import { loadActivityArchetypes } from '@/domains/timebox/lib/server/load-activity-archetypes'
import { ArchetypeTable } from './archetype-table'

export async function ActivityArchetypesPage() {
  const archetypes = await loadActivityArchetypes()
  return (
    <div className="space-y-4">
      <ArchetypeTable initialData={archetypes} />
    </div>
  )
}
