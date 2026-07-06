/**
 * @file transitions
 * @brief OKRs 状态转换工具（Cycle SM 仍在使用）
 *
 * [022.01] Phase 3：Objective/KR 不再有独立状态机。
 *  - objectiveTransitions / keyResultTransitions 已删除
 *  - Cycle 状态机由 manifest.yaml lifecycle.cycle 驱动，本文件保留通用
 *    Transition<T> 与 findTransition 辅助函数 + cycleTransitions 常量表。
 * Objective 字段写：通过 mutation-service 直写；KR 完成判定：由 progressRate 触发。
 *
 * [023.12] T6：cycleTransitions 表显式 4 态收敛：
 *   (none) → draft → approved → finished
 *                                ↘ reviewed
 *                                    ↑     │
 *                                    └─────┘ (revert, [AM10])
 *   plan / start / end 三个旧动作整体退役。
 */

import type { CycleStatus } from '@/usom/types/primitives'
import type { SystemEventType } from '@/usom/types/process'

/**
 * 状态转换定义
 */
export interface Transition<T extends string = string> {
  /** 源状态（null 表示初始创建） */
  from: T | null
  /** 目标状态 */
  to: T
  /** 动作名称 */
  action: string
  /** 系统事件类型 */
  eventType: SystemEventType
}

/**
 * [023.12] T6：Cycle SM 转换表（4 态收敛）。
 *
 * 与 manifest.yaml lifecycle.cycle 块 1:1 同步（[019] SSOT 治理：
 * manifest 仍是权威源，本常量供客户端 / 测试代码复用，避免重复维护）。
 * 5 条转换：
 *   1. null       → draft     (create)
 *   2. draft      → approved  (approve)
 *   3. approved   → finished  (finish)
 *   4. finished   → reviewed  (review)
 *   5. reviewed   → finished  (revert, [AM10] 一致性回退)
 */
export const cycleTransitions: Transition<CycleStatus>[] = [
  { from: null,       to: 'draft',     action: 'create',  eventType: 'CycleCreated' },
  { from: 'draft',    to: 'approved',  action: 'approve', eventType: 'CycleApproved' },
  { from: 'approved', to: 'finished',  action: 'finish',  eventType: 'CycleFinished' },
  { from: 'finished', to: 'reviewed',  action: 'review',  eventType: 'CycleReviewed' },
  // [AM10] 一致性回退：reviewed→finished，保留复盘证据（reviewedAt），
  // 允许再次走 finish→review。
  { from: 'reviewed', to: 'finished',  action: 'revert',  eventType: 'CycleReverted' },
]

/**
 * 查找状态转换
 *
 * @param transitions - 转换列表
 * @param from - 源状态
 * @param action - 动作名称
 * @returns 匹配的转换，未找到返回 null
 */
export function findTransition<T extends string>(
  transitions: Transition<T>[],
  from: T | null,
  action: string,
): Transition<T> | null {
  return transitions.find(
    (t) => t.from === from && t.action === action,
  ) ?? null
}
