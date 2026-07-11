/**
 * @file tier-scheduler
 * @brief [028] T4 Tier0/1/2 槽位分配（纯函数）
 *
 * 替换 orchestration-handler.generateProposals 的「线性贪心」为分层调度：
 *   - Tier0：occupied 已合并 appointments（[028] T2 完成）；游标直接跳过
 *   - Tier1：cursor 沿 [dayStart, 22:00] 推进，跳过 occupied 区间
 *   - Tier2 fallback：当 cursor 推到 22:00 bound 时，检查 item.earliestStart..latestStart 窗口
 *     + minDuration，能塞则塞，否则舍弃 + emit ITEM_UNSCHEDULABLE warning
 *   - 沿用 [023.07] SCHEDULER_BOUND_EXCEEDED bound（"加迭代次数超限" 兜底）
 *
 * 设计原则：
 *   - 纯函数；deps 通过参数注入（不动 orchestration-handler 既有 private 方法）
 *   - isSlotOccupied / findOccupyingSlot / formatTime / computeEnergyMatch 由 caller 注入
 *     ——test 直接复刻一份；orchestration-handler 注入私有方法
 *   - 返回 shape 与原有 generateProposals 一致：{ proposals, warnings }
 *
 * 与 generateProposals 的关系：
 *   generateProposals 在 strategy='schedule' 分支委托本函数
 *   strategy='legacy' 仍走原线性贪心（IRON RULE，adjustRemainingTimeboxes 不变）
 */

import type { GeneratedProposal, Warning } from '@/usom/types/process'

/** 与 orchestration-handler 私有的 TimeboxItem 形状对齐（[028] T2-fold） */
export interface Tier0Item {
  id: string
  title: string
  sourceType: GeneratedProposal['sourceType']
  priority: string
  durationMinutes: number
  energyRequired?: string
  relatedObjectId: string
  /** 最早可开始时间（UTC hour，0-24） */
  earliestStart?: number
  /** 最晚可开始时间（UTC hour，0-24） */
  latestStart?: number
  /** 最小可接受时长（分钟） */
  minDuration?: number
}

/** 与 orchestration-handler 私有 TimeSlot 形状对齐 */
export interface Tier0Slot {
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
}

/** scheduleByTiers 选项 */
export interface ScheduleByTiersOpts {
  /** 一天的起始游标（UTC hour），默认 8（与既有 generateProposals 一致） */
  dayStart?: number
  /** 一天的结束 bound（UTC hour），默认 22（[023.07] 约定） */
  dayEnd?: number
}

/** scheduleByTiers 依赖注入：复用 orchestration-handler 现有纯谓词 */
export interface TierSchedulerDeps {
  isSlotOccupied(
    startHour: number,
    startMinute: number,
    durationMinutes: number,
    occupied: Tier0Slot[],
  ): boolean
  findOccupyingSlot(
    startHour: number,
    startMinute: number,
    durationMinutes: number,
    occupied: Tier0Slot[],
  ): Tier0Slot | undefined
  formatTime(hour: number, minute: number): string
  computeEnergyMatch(
    hour: number,
    energyRequired: string | undefined,
  ): GeneratedProposal['energyMatch']
}

/** 上限 bound 触发警告的 items.length 系数（防御性 bound，参考 [023.07] #3） */
const MAX_ITERATIONS_FACTOR = 48
const MAX_ITERATIONS_BASELINE = 100

/**
 * Tier0/1/2 槽位分配
 *
 * 算法：
 *   for each item in items（已排序）：
 *     1. Tier1：cursor 从 dayStart 推进，跳过 occupied 区间直到 [cursor, cursor+duration) 不冲突
 *     2. 若 cursor+duration > dayEnd（22:00）：
 *        - Tier2 fallback：从 item.earliestStart 起步检查窗口，找到第一个不冲突点
 *        - 能塞：emit proposal（cursor 推进到窗口 end）
 *        - 不能塞：emit ITEM_UNSCHEDULABLE warning
 *     3. 否则 emit proposal（Tier1 主游标）
 *   防御 bound：iteration 超 maxIterations → SCHEDULER_BOUND_EXCEEDED warning + 返 partial。
 */
export function scheduleByTiers(
  items: Tier0Item[],
  occupied: Tier0Slot[],
  opts: ScheduleByTiersOpts,
  deps: TierSchedulerDeps,
): { proposals: GeneratedProposal[]; warnings: Warning[] } {
  const proposals: GeneratedProposal[] = []
  const warnings: Warning[] = []
  const dayStart = opts.dayStart ?? 8
  const dayEnd = opts.dayEnd ?? 22

  let cursorHour = dayStart
  let cursorMinute = 0
  const maxIterations = items.length * MAX_ITERATIONS_FACTOR + MAX_ITERATIONS_BASELINE
  let iterations = 0

  for (const item of items) {
    const earliest = item.earliestStart ?? 0
    const latest = item.latestStart ?? dayEnd
    const minDur = item.minDuration ?? item.durationMinutes

    // ── bound check（[023.07] #3 防御性 iteration bound）：先把 dayEnd bound 转成 break+warning ──
    //   触发条件：cursor 已经 ≥ dayEnd（即前一项把 cursor 推到 22:00 后），
    //   后续 items 必须停止 + emit SCHEDULER_BOUND_EXCEEDED warning。
    if (cursorHour >= dayEnd) {
      warnings.push({
        code: 'SCHEDULER_BOUND_EXCEEDED',
        message: `Tier0/1/2 调度触及 dayEnd=${dayEnd}:00 上限（已编排 ${proposals.length} 项），剩余 ${items.length - proposals.length} 个 item 停止分配。`,
        severity: 'warn',
      })
      break
    }

    // ── Tier1：cursor 推进跳过 occupied ──
    while (deps.isSlotOccupied(cursorHour, cursorMinute, item.durationMinutes, occupied)) {
      if (++iterations > maxIterations) {
        warnings.push({
          code: 'SCHEDULER_BOUND_EXCEEDED',
          message: `Tier0/1/2 调度超出最大推进次数 ${maxIterations}，已返回部分方案（${proposals.length} 项）。可能存在异常占用数据。`,
          severity: 'warn',
        })
        return { proposals, warnings }
      }
      const overlap = deps.findOccupyingSlot(cursorHour, cursorMinute, item.durationMinutes, occupied)
      if (overlap) {
        cursorHour = overlap.endHour
        cursorMinute = overlap.endMinute
      } else {
        // 安全回退：前进 30 分钟（谓词统一后此分支为死代码，bound 兜底）
        cursorMinute += 30
        if (cursorMinute >= 60) {
          cursorHour += Math.floor(cursorMinute / 60)
          cursorMinute = cursorMinute % 60
        }
      }
      // 防御：cursor 推进时也可能跳出 dayEnd，进入下一个循环时由上行 bound check 处理
    }

    const endTotalMin = cursorHour * 60 + cursorMinute + item.durationMinutes
    const endHour = Math.floor(endTotalMin / 60) % 24
    const endMinute = endTotalMin % 60

    // ── Tier2 检查：窗口约束 ──
    //   - 如果 cursor+duration 超 latestStart（窗口尾部），触发 Tier2 fallback
    //   - 如果 cursor < earliestStart（窗口头部），触发 Tier2 fallback
    //   - 如果 duration > (latest - earliest)*60，窗口本身塞不下 → 直接 ITEM_UNSCHEDULABLE
    const cursorTotalMin = cursorHour * 60 + cursorMinute
    const earliestMin = Math.round(earliest * 60)
    const latestStartMin = Math.round(latest * 60)
    const windowSpan = latestStartMin - earliestMin
    const windowTooSmall = minDur > windowSpan

    if (windowTooSmall) {
      // 窗口本身就不够塞 → 舍弃 + warning
      warnings.push({
        code: 'ITEM_UNSCHEDULABLE',
        message: `"${item.title}" 窗口（${earliest}:00–${latest}:00 = ${windowSpan} 分钟）小于最小可接受时长 ${minDur} 分钟，无法排入。`,
        severity: 'warn',
        affectedProposalIds: [item.id],
      })
      continue
    }

    const needsTier2 =
      cursorTotalMin + item.durationMinutes > latestStartMin ||
      cursorTotalMin < earliestMin

    if (needsTier2) {
      // ── Tier2 fallback：在 [earliest, latest] 窗口内查找可用槽 ──
      const fitted = tryFitInWindow(
        item,
        occupied,
        earliest,
        latest,
        minDur,
        deps,
      )
      if (fitted) {
        const { startHour, startMinute, endHour: fitEndHour, endMinute: fitEndMinute } = fitted
        proposals.push(buildProposal(item, startHour, startMinute, fitEndHour, fitEndMinute, '', deps))
        // cursor 推进到已 fit 终点
        cursorHour = fitEndHour
        cursorMinute = fitEndMinute
      } else {
        // 窗口内塞不下 → 舍弃 + emit ITEM_UNSCHEDULABLE warning
        warnings.push({
          code: 'ITEM_UNSCHEDULABLE',
          message: `"${item.title}" 无法在最早-最晚窗口（${earliest}:00–${latest}:00）内找到 ${minDur} 分钟空槽，已舍弃。`,
          severity: 'warn',
          affectedProposalIds: [item.id],
        })
      }
      continue
    }

    // ── Tier1 命中：正常 emit ──
    proposals.push(buildProposal(item, cursorHour, cursorMinute, endHour, endMinute, '', deps))
    cursorHour = endHour
    cursorMinute = endMinute
  }

  return { proposals, warnings }
}

/**
 * 在 [earliest, latest] 窗口内 + minDuration 约束下，寻找第一个不冲突的起始槽位。
 * 返回 { startHour, startMinute, endHour, endMinute } 或 undefined。
 */
function tryFitInWindow(
  item: Tier0Item,
  occupied: Tier0Slot[],
  earliest: number,
  latest: number,
  minDuration: number,
  deps: TierSchedulerDeps,
): { startHour: number; startMinute: number; endHour: number; endMinute: number } | undefined {
  // 起点最早 = earliest hour；从 earliest hour 开始逐分钟推进，找第一个不冲突 + 放得下 minDuration 的点
  let sH = Math.floor(earliest)
  let sM = Math.round((earliest - sH) * 60)

  // latest 边界：startTime + minDuration 不能超过 latest
  // latest 是「最晚可开始时间」，意味着 startTime ≤ latest
  while (sH < latest) {
    if (!deps.isSlotOccupied(sH, sM, minDuration, occupied)) {
      // 成功：算出 endHour/endMinute
      const endTotalMin = sH * 60 + sM + minDuration
      const eH = Math.floor(endTotalMin / 60) % 24
      const eM = endTotalMin % 60
      return { startHour: sH, startMinute: sM, endHour: eH, endMinute: eM }
    }
    // 推进 30 分钟
    sM += 30
    if (sM >= 60) {
      sH += Math.floor(sM / 60)
      sM = sM % 60
    }
  }

  return undefined
}

function buildProposal(
  item: Tier0Item,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
  date: string,
  deps: TierSchedulerDeps,
): GeneratedProposal {
  return {
    id: crypto.randomUUID(),
    action: 'createTimebox',
    payload: {
      title: item.title,
      date,
      startTime: deps.formatTime(startHour, startMinute),
      endTime: deps.formatTime(endHour, endMinute),
      duration: item.durationMinutes,
      sourceObjectId: item.relatedObjectId,
    },
    sourceType: item.sourceType,
    priority: item.priority,
    energyMatch: deps.computeEnergyMatch(startHour, item.energyRequired),
  }
}
