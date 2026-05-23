import type { AITaskType, TokenUsage } from '../types'

export interface TokenBudgetRecord {
  taskType: AITaskType
  model: string
  usage: TokenUsage
  timestamp: number
  domainId: string
  action: string
}

export interface DailyTokenSummary {
  date: string
  totalTokens: number
  byTaskType: Record<string, number>
  callCount: number
}

export interface TokenBudgetManager {
  record(usage: TokenUsage, meta: { taskType: AITaskType; model: string; domainId: string; action: string }): void
  getDailySummary(date: string): DailyTokenSummary
}

export function createTokenBudgetManager(): TokenBudgetManager {
  const records: TokenBudgetRecord[] = []

  return {
    record(usage: TokenUsage, meta: { taskType: AITaskType; model: string; domainId: string; action: string }): void {
      records.push({
        taskType: meta.taskType,
        model: meta.model,
        usage,
        timestamp: Date.now(),
        domainId: meta.domainId,
        action: meta.action,
      })
    },

    getDailySummary(date: string): DailyTokenSummary {
      const dayRecords = records.filter(r => {
        const d = new Date(r.timestamp)
        const recordDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        return recordDate === date
      })

      const byTaskType: Record<string, number> = {}
      let totalTokens = 0

      for (const r of dayRecords) {
        totalTokens += r.usage.totalTokens
        byTaskType[r.taskType] = (byTaskType[r.taskType] ?? 0) + r.usage.totalTokens
      }

      return { date, totalTokens, byTaskType, callCount: dayRecords.length }
    },
  }
}
