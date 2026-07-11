/** @file templates-provider @brief [028] T1 时间盒模板上下文 provider — 用户日常时间规律 */
import type { ContextProvider } from '@/usom/types/process'
// fold-in T1-fix：裸 class
import { TimeboxTemplateRepository, type TimeboxTemplate } from '@/lib/db/repositories/timebox-template'
import type { USOM_ID } from '@/usom/types/primitives'

export class TemplatesProvider implements ContextProvider {
  constructor(private readonly repo: InstanceType<typeof TimeboxTemplateRepository>) {}

  async provide(query: string, params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'templates_for_date') return []
    const { date, userId } = params as { date: string; userId: USOM_ID }
    const templates: TimeboxTemplate[] = await this.repo.findByUser(userId)

    // fold-in T1-fix：按当日星期过滤（UTC midday parse 避 TZ 漂移，[023.10] deriveDayOfWeek 同源）
    const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay()
    const matched = templates.filter(t => (t.daysOfWeek ?? []).includes(dayOfWeek))

    // fold-in T1-fix：flatMap(t.rows)（非 map(t)）；字段名对齐 TemplateRow（schema.ts:734）
    // earliestStart/latestStart 是 HH:MM string|null 透传，T2 buildTimeboxItems 转 UTC hour number
    return matched.flatMap(t => t.rows.map(r => ({
      id: r.id,
      title: r.activityName,
      defaultStart: r.defaultStart,
      defaultDuration: r.defaultDuration,
      earliestStart: r.earliestStart ?? null,    // HH:MM string|null
      latestStart: r.latestStart ?? null,         // HH:MM string|null
      shortestDuration: r.shortestDuration ?? null,  // 非 minDuration
      activityArchetypeId: r.activityArchetypeId ?? null,
      source: r.source,                           // 非 sourceType
    })))
  }
}