/**
 * @file activity
 * @brief 用户活动统计 Server Action 模块
 * 
 * 提供用户活动数据查询功能，包括频繁意图、活动统计等
 */

'use server'

import { ActivityRepository } from '@/lib/db/repositories/activity.repository'

/** MVP 用户 ID（临时使用） */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * 频繁意图接口
 */
export interface FrequentIntent {
  /** 目标域 */
  targetDomain: string
  /** 目标动作 */
  targetAction: string
  /** 显示标签 */
  label: string
  /** 快捷键 */
  shortcut: string
  /** 分数（活跃度） */
  score: number
}

/**
 * 构建意图触发器标签映射
 * @returns 触发器标签映射
 */
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

/**
 * 获取用户频繁使用的意图
 * 
 * @param limit - 返回数量限制（默认 5）
 * @param sinceDays - 统计天数范围（默认 30）
 * @returns 频繁意图列表
 */
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

/**
 * 获取用户活动统计
 * 
 * @param sinceDays - 统计天数范围（默认 30）
 * @returns 活动统计数据
 */
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
