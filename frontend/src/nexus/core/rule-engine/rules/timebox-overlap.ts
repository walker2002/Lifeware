/**
 * @file timebox-overlap.ts
 * @brief [023.12] T7 TimeOverlapRule — 仅 planned 状态参与冲突检测
 *
 * 历史：duration 字段已撤（[023] A2 OV#P1-#1），改为读 intent.fields.endTime；
 *       [023.04] 旧 status-aware 分级（planned/running/overtime → confirm；
 *         ended/cancelled/logged → pass）—— 但 running/overtime/ended 在
 *         [023.12] lifecycle 收敛后不再持久化（[023.12] T2 status union
 *         = 'planned' | 'logged' | 'cancelled'）。
 *       [023.12] T7 (AM9)：activeStatuses 收窄到 ['planned'] —— 唯一持久化
 *         的"会占时间"状态。logged/cancelled 终态对规划新 timebox 不产生
 *         冲突（与历史分级逻辑结论一致，但代码侧走最小集）。
 */

import type { Rule, RuleResult } from '../evaluator'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot } from '@/usom/types/process'
import type { ITimeboxRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'

// ─── 辅助函数 ─────────────────────────────────────────────────

/**
 * 从 intent.fields 中安全获取字段值
 */
function getField(intent: StructuredIntent, key: string): unknown {
  return intent.fields[key]
}

/**
 * 判断值是否为非空字符串
 */
function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * 两个区间 [s1,e1] 和 [s2,e2] 重叠的条件: s1 < e2 && s2 < e1
 *
 * 注意：半开区间语义——区间边界正好相接不算重叠
 * （例如 09:00-10:00 和 10:00-11:00 不重叠）
 */
function intervalsOverlap(
  s1: number, e1: number,
  s2: number, e2: number,
): boolean {
  return s1 < e2 && s2 < e1
}

// ─── 工厂函数 ─────────────────────────────────────────────────

/**
 * 创建 TimeOverlapRule 实例
 *
 * 依赖注入方式：闭包工厂模式
 * - timeboxRepo: 用于查询日期范围内的时间盒
 * - userId: 多租户过滤
 *
 * 评估逻辑（[023.12] T7 (AM9)）：
 * 1. 从 intent.fields 提取 startTime 和 endTime
 *    （[023] A2 OV#P1-#1 后 duration 已撤，由客户端把 duration 折成 endTime 上送）
 * 2. 查询 [startTime, endTime] 范围内已有时间盒
 * 3. 对 status === 'planned' 的时间盒检查区间重叠（[023.12] status union
 *    = 'planned' | 'logged' | 'cancelled' —— running/overtime/ended 不再持久化）
 * 4. 与 planned 重叠 → confirm；与 logged/cancelled 重叠 → pass（不阻断）
 *
 * @param timeboxRepo - 时间盒仓库实例
 * @param userId      - 当前用户 ID
 * @returns Rule 实例
 */
export function createTimeOverlapRule(
  timeboxRepo: ITimeboxRepository,
  userId: USOM_ID,
): Rule {
  return {
    name: 'TimeOverlapRule',

    async evaluate(intent: StructuredIntent, _snapshot: ContextSnapshot): Promise<RuleResult> {
      const startTime = getField(intent, 'startTime')
      const endTime = getField(intent, 'endTime')

      // 缺失字段由 FieldCompletenessRule 负责，此处跳过（[023.04] 兼容无 endTime 的历史 intent）
      if (!isNonEmptyString(startTime) || !isNonEmptyString(endTime)) {
        return { severity: 'pass' }
      }

      const startMs = Date.parse(startTime as string)
      const endMs = Date.parse(endTime as string)
      if (isNaN(startMs) || isNaN(endMs)) {
        // 无效日期格式由 StartTimeInFutureRule 负责
        return { severity: 'pass' }
      }
      if (endMs <= startMs) {
        // endTime<=startTime 由 EndTimeAfterStartRule 负责
        return { severity: 'pass' }
      }

      const startISO = new Date(startMs).toISOString() as Timestamp
      const endISO = new Date(endMs).toISOString() as Timestamp

      const existingTimeboxes = await timeboxRepo.findByDateRange(
        startISO,
        endISO,
        userId,
      )

      // [023.12] T7 (AM9)：activeStatuses 收窄到 ['planned']。
      // 旧分级 [023.04]（planned/running/overtime vs ended/cancelled/logged）
      // 已无意义——running/overtime/ended 在 [023.12] lifecycle 收敛后
      // 不再持久化，read-time 派生显示（[023.12] T3 derive-display-status）。
      // 结论不变：仅"会占时间"的状态 → confirm；终态 → pass。
      const activeStatuses = new Set(['planned'])
      const overlappingTitles: string[] = []
      for (const tb of existingTimeboxes) {
        if (!activeStatuses.has(tb.status)) continue
        const tbStartMs = Date.parse(tb.startTime)
        const tbEndMs = Date.parse(tb.endTime)
        if (isNaN(tbStartMs) || isNaN(tbEndMs)) continue
        if (intervalsOverlap(startMs, endMs, tbStartMs, tbEndMs)) {
          overlappingTitles.push(tb.title)
        }
      }

      if (overlappingTitles.length === 0) {
        return { severity: 'pass' }
      }

      const conflictList = overlappingTitles.join('、')
      return {
        severity: 'confirm',
        message: `与已有时间盒冲突: ${conflictList}`,
      }
    },
  }
}
