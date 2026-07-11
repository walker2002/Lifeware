/**
 * @file index
 * @brief [023.08] T3 handler factory — 注入 rule-engine + repo + userId [F1 fold]
 *
 * [023.08] T3 把 overlap 检测从内部 proprietary 谓词升级为 rule-engine 评估；
 * 工厂方法 createTimeboxHandlers(deps) 由 orchestrator 调用时传入完整 deps。
 * [F1 fold]: orchestrator 必须用本 factory (而非 findHandler singleton)，否则
 * rule-engine 在生产路径死代码（同 [023.07] TZ bug pattern）。
 */

import { TimeboxOrchestrationHandler } from './orchestration-handler'
import type { DomainHandler } from '@/usom/types/process'
import type { ITimeboxRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'
import { createRuleEngine } from '@/nexus/core/rule-engine'

/** 工厂方法依赖 — orchestrator 注入完整 deps（timeboxRepo + userId） */
export interface HandlerFactoryDeps {
  timeboxRepo?: ITimeboxRepository
  userId?: USOM_ID
}

/**
 * 创建 timebox handler map。
 *
 * 行为：
 *   - 传入 timeboxRepo + userId → rule-engine 启用（TimeOverlapRule 接入）
 *   - 缺省 → handler 无 rule-engine，detectConflicts 走 [023.07] 谓词 fallback
 *
 * 返回 handler map 的 key 必与 manifest.intentTriggers.action 同名
 * （scheduleProposal / adjustRemainingTimeboxes）。
 */
export function createTimeboxHandlers(deps: HandlerFactoryDeps = {}) {
  const ruleEngine = deps.timeboxRepo && deps.userId
    ? createRuleEngine({ timeboxRepo: deps.timeboxRepo, userId: deps.userId })
    : undefined
  return {
    scheduleProposal: new TimeboxOrchestrationHandler({ ruleEngine, ...deps }),
    adjustRemainingTimeboxes: new TimeboxOrchestrationHandler({ ruleEngine, ...deps }),
  }
}

// 向后兼容：无 deps 时仍可用（测试 + 老调用点）
export const timeboxHandlers: Record<string, DomainHandler> = createTimeboxHandlers()
