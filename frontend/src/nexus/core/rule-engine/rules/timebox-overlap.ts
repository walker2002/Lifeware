/**
 * @file timebox-overlap.ts
 * @brief [023.04] TimeOverlapRule — 改读 endTime + status-aware severity
 *
 * 历史：duration 字段已撤（[023] A2 OV#P1-#1），改为读 intent.fields.endTime；
 *       与活跃（planned/running/overtime）已有时间盒重叠 → confirm；
 *       与终态（ended/cancelled/logged）重叠 → pass（不阻断）。
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
 * 评估逻辑（[023.04] 改读 endTime）：
 * 1. 从 intent.fields 提取 startTime 和 endTime
 *    （[023] A2 OV#P1-#1 后 duration 已撤，由客户端把 duration 折成 endTime 上送）
 * 2. 查询 [startTime, endTime] 范围内已有时间盒
 * 3. 对每个 status ∈ {planned, running, overtime} 的活跃时间盒检查区间重叠
 * 4. 与活跃重叠 → confirm；与已结束/已取消/已记录 重叠 → pass（不阻断）
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

      // [023.04]：status-aware 分级。
      // 仅与活跃（planned/running/overtime）重叠 → confirm；
      // 与已结束（ended/cancelled/logged）重叠 → pass。
      // 原因：活跃时间盒是真的会撞；终态不再占时间，重复覆盖无副作用。
      const activeStatuses = new Set(['planned', 'running', 'overtime'])
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
