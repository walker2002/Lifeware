/**
 * @file transitions
 * @brief OKRs 状态转换工具（Cycle SM 仍在使用）
 *
 * [022.01] Phase 3：Objective/KR 不再有独立状态机。
 *  - objectiveTransitions / keyResultTransitions 已删除
 *  - Cycle 状态机由 manifest.yaml lifecycle.cycle 驱动，本文件保留通用
 *    Transition<T> 与 findTransition 辅助函数。
 * Objective 字段写：通过 mutation-service 直写；KR 完成判定：由 progressRate 触发。
 */

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
