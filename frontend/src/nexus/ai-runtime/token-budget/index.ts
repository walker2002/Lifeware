/**
 * @file index
 * @brief Token 预算管理
 * 
 * 记录 LLM 调用的 Token 使用量并提供每日汇总
 */

import type { AITaskType, TokenUsage } from '../types'

/** Token 预算记录 */
export interface TokenBudgetRecord {
  /** 任务类型 */
  taskType: AITaskType
  /** 模型 */
  model: string
  /** Token 使用量 */
  usage: TokenUsage
  /** 时间戳 */
  timestamp: number
  /** 领域 ID */
  domainId: string
  /** 动作名称 */
  action: string
}

/** 每日 Token 汇总 */
export interface DailyTokenSummary {
  /** 日期 */
  date: string
  /** 总 Token 数 */
  totalTokens: number
  /** 按任务类型分组的 Token 数 */
  byTaskType: Record<string, number>
  /** 调用次数 */
  callCount: number
}

/** Token 预算管理器接口 */
export interface TokenBudgetManager {
  /**
   * 记录一次 Token 使用
   * @param usage - Token 使用量
   * @param meta - 元信息
   */
  record(usage: TokenUsage, meta: { taskType: AITaskType; model: string; domainId: string; action: string }): void
  /**
   * 获取指定日期的 Token 汇总
   * @param date - 日期（YYYY-MM-DD）
   * @returns 每日汇总
   */
  getDailySummary(date: string): DailyTokenSummary
}

/**
 * 创建 Token 预算管理器实例
 * @returns TokenBudgetManager 实例
 */
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
