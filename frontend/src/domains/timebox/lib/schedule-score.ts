/**
 * @file schedule-score
 * @brief [028] T7 rule-based 5 维评分（fold-in T7-fix 数学定义）
 *
 * 设计依据：docs/superpowers/specs/2026-07-09-028-schedule-proposal-design.md §P6
 * + fold-in T7-fix（数学定义 + 归一 + 三态区分）
 *
 * 5 维评分（每维 0-10，等权平均；跳过的维不计入分母）：
 *   1. coverage        — scheduledItems / totalCandidates × 10（空集 guard：跳过）
 *   2. noConflicts     — 无 SCHEDULE_OVERLAP ? 10 : 0
 *   3. energyMatch     — avg(proposal.energyMatch.score) × 10/0.9（空 proposals 跳过）
 *   4. highPriorityHit — scheduledP0P1 / totalP0P1 × 10（空集 guard：跳过）
 *   5. restMeal        — 睡眠/饮食 archetype item 已安排 ? 10 : 0
 *                       archetype 标签缺失 = 数据不可得 → 跳过（不归 0）
 *                       archetype 有但没安排 = 条件不满足 → 0 分
 *
 * 三态语义区分（fold-in T7-fix 核心）：
 *   - 空集（totalCandidates=0 / totalP0P1=0 / proposals=[]）= 无数据可算 → 跳过维
 *   - archetype 标签缺失（hasArchetypeData=false）= 数据不可得 → 跳过维
 *   - archetype 有但条件未满足（restMealScheduled=false）= 条件不满足 → 0 分
 *
 * 纯函数：不修改入参；返回 shape = { score, dimensions }。
 */

import type { GeneratedProposal } from '@/usom/types/process'

// ─── 入参类型 ──────────────────────────────────────────────────────

/**
 * scoreSchedule 选项。
 *
 * 三态语义：
 *   - 空集 guard：totalCandidates=0 / totalP0P1=0 → 跳过对应维
 *   - 数据不可得：hasArchetypeData=false → restMeal 跳过
 *   - 条件不满足：hasArchetypeData=true 但 restMealScheduled=false → restMeal=0
 */
export interface ScoreScheduleOptions {
  /** 总候选数（含 habits+tasks+templates+NL events，不含 appointments） */
  totalCandidates?: number
  /** 是否存在 SCHEDULE_OVERLAP 警告（来自 detectConflicts） */
  hasOverlap?: boolean
  /** P0/P1 候选总数（来自 collectMaterials 的 activeTasks） */
  totalP0P1?: number
  /** 命中并安排的 P0/P1 数（从 proposals 中数 priority in {P0,P1}） */
  scheduledP0P1?: number
  /**
   * 是否能访问 archetype 标签数据。
   * false = 数据不可得（无 archetypeMap 注入 / 无睡眠/饮食 archetype 标签）
   * true = 数据可得，需进一步判断 restMealScheduled
   */
  hasArchetypeData?: boolean
  /** 睡眠/饮食 archetype item 是否已安排进 proposals */
  restMealScheduled?: boolean
}

/**
 * scoreSchedule 返回值。
 *
 * - score: 5 维等权平均（跳过的维不计入分母），范围 [0, 10]
 * - dimensions: 只含实际计分的维（跳过的维不在内）
 *
 * handle() 末尾调 scoreSchedule；score < 6 时追加 warn（不 block，design doc P6）。
 */
export interface ScoreScheduleResult {
  /** 总分 [0, 10]；null 表示所有维都跳过（无任何数据） */
  score: number
  /** 各维明细（只有实际计分的维） */
  dimensions: Record<string, number>
}

// ─── 内部常量 ──────────────────────────────────────────────────────

/** energyMatch 归一系数：score 原范围 0-0.9 → 0-10 */
const ENERGY_MATCH_NORM = 10 / 0.9

/** handle 末尾 warn 阈值（design doc P6：<6 不 block） */
export const SCORE_WARN_THRESHOLD = 6

// ─── 主体：scoreSchedule ──────────────────────────────────────────

/**
 * 纯函数：对一组编排 proposals 做 5 维评分。
 *
 * 三态语义（fold-in T7-fix）：
 *   - coverage 空集 guard：totalCandidates=0 → 跳过该维
 *   - energyMatch 空 proposals：proposals=[] → 跳过该维
 *   - highPriorityHit 空集 guard：totalP0P1=0 → 跳过该维
 *   - restMeal 数据不可得：hasArchetypeData=false → 跳过该维（不归 0）
 *   - restMeal 条件不满足：hasArchetypeData=true 且 restMealScheduled=false → 该维 = 0
 *
 * 注：本函数不直接读 archetypeMap — 由调用方（orchestration-handler）预先判定
 * hasArchetypeData + restMealScheduled 后注入。本函数保持纯函数 + 不读 DB。
 */
export function scoreSchedule(
  proposals: GeneratedProposal[],
  opts: ScoreScheduleOptions = {},
): ScoreScheduleResult {
  const dims: Array<{ key: string; value: number }> = []

  // ─── 维 1：coverage ─────────────────────────────────────────────
  // 空集 guard：totalCandidates=0 → 跳过
  const totalCandidates = opts.totalCandidates ?? 0
  if (totalCandidates > 0) {
    dims.push({
      key: 'coverage',
      value: clamp01((proposals.length / totalCandidates) * 10),
    })
  }

  // ─── 维 2：noConflicts ─────────────────────────────────────────
  // 总是计分（最简单一维）
  dims.push({
    key: 'noConflicts',
    value: opts.hasOverlap ? 0 : 10,
  })

  // ─── 维 3：energyMatch ─────────────────────────────────────────
  // 空 proposals → 跳过；score 范围 0-0.9 → 归一 ×10/0.9；clamp 到 [0, 10]
  if (proposals.length > 0) {
    const scores = proposals.map(p => p.energyMatch?.score ?? 0)
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length
    dims.push({
      key: 'energyMatch',
      value: clamp01(avg * ENERGY_MATCH_NORM),
    })
  }

  // ─── 维 4：highPriorityHit ─────────────────────────────────────
  // 空集 guard：totalP0P1=0 → 跳过
  const totalP0P1 = opts.totalP0P1 ?? 0
  if (totalP0P1 > 0) {
    const scheduledP0P1 = opts.scheduledP0P1 ?? 0
    dims.push({
      key: 'highPriorityHit',
      value: clamp01((scheduledP0P1 / totalP0P1) * 10),
    })
  }

  // ─── 维 5：restMeal ─────────────────────────────────────────────
  // 数据不可得 vs 条件不满足（fold-in T7-fix 关键区分）：
  //   - hasArchetypeData=false → 数据不可得 → 跳过（不归 0）
  //   - hasArchetypeData=true → 数据可得 → 按 restMealScheduled 算 10 或 0
  if (opts.hasArchetypeData === true) {
    dims.push({
      key: 'restMeal',
      value: opts.restMealScheduled ? 10 : 0,
    })
  }

  // ─── 等权平均（跳过的维不计入分母） ────────────────────────────
  // 全维都跳过 → score = 0（defensive default；实际不会触发因为 noConflicts 必计分）
  const score = dims.length === 0
    ? 0
    : dims.reduce((s, d) => s + d.value, 0) / dims.length

  return {
    score,
    dimensions: Object.fromEntries(dims.map(d => [d.key, d.value])),
  }
}

// ─── 工具：把数值钳到 [0, 10] ─────────────────────────────────────

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 10) return 10
  return value
}