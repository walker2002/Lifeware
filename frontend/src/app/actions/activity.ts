'use server'

import { ActivityRepository } from '@/lib/db/repositories/activity.repository'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

export interface FrequentIntent {
  targetDomain: string
  targetAction: string
  label: string
  shortcut: string
  score: number
}

async function buildTriggerLabelMap(): Promise<Map<string, { label: string; shortcut: string }>> {
  const { domainRegistry } = await import('@/domains/registry')
  const map = new Map<string, { label: string; shortcut: string }>()
  for (const plugin of domainRegistry) {
    const items = plugin.manifest.intentTriggers
    if (!items) continue
    for (const t of items) {
      map.set(`${plugin.manifest.domainId}:${t.action}`, {
        label: t.description || t.action,
        shortcut: t.shortcut ?? '',
      })
    }
  }
  return map
}

export async function fetchFrequentIntents(limit: number = 5, sinceDays: number = 30): Promise<FrequentIntent[]> {
  const repo = new ActivityRepository()
  const rows = await repo.fetchFrequentIntents(MVP_USER_ID, limit * 2, sinceDays)

  const triggerMap = await buildTriggerLabelMap()

  const result: FrequentIntent[] = []
  for (const row of rows) {
    const key = `${row.targetDomain}:${row.targetAction}`
    const trigger = triggerMap.get(key)
    result.push({
      targetDomain: row.targetDomain,
      targetAction: row.targetAction,
      label: trigger?.label ?? row.targetAction,
      shortcut: trigger?.shortcut ?? '',
      score: row.totalScore,
    })
    if (result.length >= limit) break
  }

  return result
}

export async function fetchActivityStats(sinceDays: number = 30) {
  const repo = new ActivityRepository()
  const since = new Date()
  since.setDate(since.getDate() - sinceDays)
  const [typeCounts, dailyCounts] = await Promise.all([
    repo.fetchActivityTypeCounts(MVP_USER_ID, since),
    repo.fetchDailyActivityCounts(MVP_USER_ID, since),
  ])
  return { typeCounts, dailyCounts, sinceDays }
}
