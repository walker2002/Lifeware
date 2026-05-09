// TimeOverlapRule — 时间重叠检测规则
// T027: 查询已有时间盒，检测区间冲突，返回 confirm 结果
// 使用闭包工厂模式注入仓库依赖，保持 Rule 接口简洁

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
 * 判断值是否为有效数字
 */
function isValidNumber(value: unknown): boolean {
  return typeof value === 'number' && !isNaN(value)
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
 * 评估逻辑：
 * 1. 从 intent.fields 提取 startTime 和 duration
 * 2. 计算 endTime = startTime + duration
 * 3. 查询 [startTime, endTime] 范围内已有时间盒
 * 4. 对每个已有时间盒检查区间重叠
 * 5. 重叠则返回 confirm，附带冲突时间盒信息
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
      const duration = getField(intent, 'duration')

      // 缺失字段由 FieldCompletenessRule 负责，此处跳过
      if (!isNonEmptyString(startTime) || !isValidNumber(duration)) {
        return { severity: 'pass' }
      }

      const startMs = Date.parse(startTime as string)
      if (isNaN(startMs)) {
        // 无效日期格式由 StartTimeInFutureRule 负责
        return { severity: 'pass' }
      }

      const endMs = startMs + (duration as number) * 60 * 1000
      const startISO = new Date(startMs).toISOString() as Timestamp
      const endISO = new Date(endMs).toISOString() as Timestamp

      // 查询日期范围内的已有时间盒
      const existingTimeboxes = await timeboxRepo.findByDateRange(
        startISO,
        endISO,
        userId,
      )

      // 检查每个已有时间盒是否与新时间盒重叠
      const overlappingTitles: string[] = []

      for (const tb of existingTimeboxes) {
        const tbStartMs = Date.parse(tb.startTime)
        const tbEndMs = Date.parse(tb.endTime)

        if (intervalsOverlap(startMs, endMs, tbStartMs, tbEndMs)) {
          overlappingTitles.push(tb.title)
        }
      }

      if (overlappingTitles.length === 0) {
        return { severity: 'pass' }
      }

      // 格式化冲突信息
      const conflictList = overlappingTitles.join('、')
      return {
        severity: 'confirm',
        message: `与已有时间盒冲突: ${conflictList}`,
      }
    },
  }
}
