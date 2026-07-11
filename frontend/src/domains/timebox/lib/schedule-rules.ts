/**
 * @file schedule-rules @brief [028] T3 §04 硬规则词典序排序
 *
 * 设计依据：docs/superpowers/specs/2026-07-09-028-schedule-proposal-design.md §04
 *
 * §04 硬规则 4 层 cascade（从最严到最宽）：
 *   Layer 1：截止紧迫 — fixedTime（NL 明确指定时间，如「16:00 接娃」）永远排前
 *   Layer 2：能量匹配 — 睡眠（l1=生存+l2=睡眠，固定时段）+ interruptTolerance=high 的灵活项
 *   Layer 3：timebox lock — 饮食（l1=生存+l2=饮食，固定时段）
 *   Layer 4：OKR 对齐 — 其余（含无 archetype / interruptTolerance=medium/low / 普通任务）
 *
 * Cascade 语义：每个 item 被分到 4 层中的某一层（primary），层号小者排前；
 * 同层内按 sub-rank 应用次级排序。
 *
 *   - Layer 1 > Layer 2 > Layer 3 > Layer 4（严格词典序，layer 3 永远 > layer 4）
 *   - 测试 `层间严格词典序：层 1 的低优 item 排在层 4 的高优前` 即此约束
 *   - 测试 `层间严格词典序：层 3 饮食 lock 排在层 4 P0 任务前` 即此约束
 *
 * Layer 4 内排序：interruptTolerance（high→low 灵活先）→ priority（P0→P3）→ sourceType
 *   - 测试 `层 2 ... low 排到 non-archetype 之后`：无 archetype 默认 medium interrupt，
 *     low interrupt 严格排后（虽然都是 Layer 4）。
 *
 * 纯函数：不修改入参；archetype 标签通过 opts.archetypeMap 注入（避免直接 DB），
 * opts.archetypeMap 缺省视为空（缺失 archetype 视作「无标签」，默认 medium interrupt）。
 */

import type { ActivityArchetype, ActivityLabel } from '@/usom/activity-archetype/types'

// ─── 公共类型 ──────────────────────────────────────────────────

/**
 * sortByHardRules 入参 item 的最小契约。
 * orchestration-handler.TimeboxItem 是其超集（直接兼容）。
 */
export interface HardRulesSortableItem {
  id: string
  /** 优先级（P0/P1/P2/P3 或 critical/high/medium/low），影响 Layer 4 内排序 */
  priority?: string
  /** 来源类型，影响 Layer 4 同 priority 时的次级排序 */
  sourceType?: string
  /** 关联 archetype id（用于查 opts.archetypeMap） */
  archetypeId?: string | null
  /**
   * NL 明确指定的固定时间（仅当用户输入「16:00 接娃」之类时被解析填入）。
   * 一旦存在 → 强制分到 Layer 1。
   */
  fixedTime?: { hour: number; minute?: number } | null
}

/**
 * sortByHardRules 选项。
 */
export interface HardRulesSortOptions {
  /** archetypeId → ActivityArchetype 映射，由调用方注入（保持纯函数） */
  archetypeMap?: Record<string, ActivityArchetype>
  /**
   * 当前默认 PRIORITY 权重（缺省 = orchestrator.PRIORITY_WEIGHT 兼容值）。
   * 注入以避免与 orchestrator 内常量重复定义。
   */
  priorityWeight?: Record<string, number>
  /**
   * 当前默认 SOURCE 权重（缺省 = orchestrator.SOURCE_WEIGHT 兼容值）。
   */
  sourceWeight?: Record<string, number>
}

// ─── 默认权重（与 orchestrator.PRIORITY_WEIGHT / SOURCE_WEIGHT 兼容） ────

const DEFAULT_PRIORITY_WEIGHT: Record<string, number> = {
  P0: 0,
  critical: 0,
  P1: 1,
  high: 1,
  P2: 2,
  medium: 2,
  P3: 3,
  low: 3,
}

const DEFAULT_SOURCE_WEIGHT: Record<string, number> = {
  planned: 0,
  habit: 1,
  task: 2,
  adhoc: 3,
}

// ─── archetype 标签查询 ────────────────────────────────────────

/**
 * 安全查 archetype（缺省返回 undefined = 「无标签」fallback）。
 */
function lookupArchetype(
  archetypeId: string | null | undefined,
  archetypeMap: Record<string, ActivityArchetype> | undefined,
): ActivityArchetype | undefined {
  if (!archetypeId || !archetypeMap) return undefined
  return archetypeMap[archetypeId]
}

/**
 * 检查 archetype 是否「睡眠」（l1=生存+l2=睡眠 → 固定时段，Layer 2）。
 */
function isSleepArchetype(a: ActivityArchetype | undefined): boolean {
  return !!a && a.l1Category === '生存' && a.l2Name === '睡眠'
}

/**
 * 检查 archetype 是否「饮食」（l1=生存+l2=饮食 → 固定时段 lock，Layer 3）。
 */
function isMealArchetype(a: ActivityArchetype | undefined): boolean {
  return !!a && a.l1Category === '生存' && a.l2Name === '饮食'
}

/**
 * 中断容忍度排序权重（越小越灵活，越排前）。
 *   - high：0（最灵活）
 *   - medium：1（默认；无 archetype 视作 medium）
 *   - low：2（不可中断，最难排）
 */
function interruptToleranceRank(label: ActivityLabel | undefined): number {
  if (!label) return 1  // 无 archetype 视作 medium（默认）
  switch (label.interruptTolerance) {
    case 'high': return 0
    case 'medium': return 1
    case 'low': return 2
    default: return 1
  }
}

// ─── 4 层 cascade 主逻辑 ────────────────────────────────────────

interface LayerAssignment {
  /** 主层（1/2/3/4，cascade 顺序） */
  primaryLayer: 1 | 2 | 3 | 4
  /**
   * 层内 sub-rank（数字越小越前）。
   *  - Layer 1: fixedTime.hour
   *  - Layer 2: 0=睡眠；1=high interrupt
   *  - Layer 3: 0（饮食单档）
   *  - Layer 4: interruptToleranceRank（高灵活→低灵活）
   */
  subRank: number
  /** 仅 Layer 4 内：priority 权重（默认 9） */
  priorityRank: number
  /** 仅 Layer 4 内同 priority 时次级排：sourceType 权重（默认 9） */
  sourceRank: number
}

/**
 * 把一个 item 分到 §04 4 层中的某一层（cascade 决策）。
 *
 * 决策顺序（cascade，按设计 §04）：
 *   1. 有 fixedTime → Layer 1（截止紧迫永远排前）
 *   2. archetype 是「睡眠」 → Layer 2（固定时段睡眠）
 *   3. archetype 是「饮食」 → Layer 3（timebox lock）
 *   4. archetype.interruptTolerance === 'high' → Layer 2（能量匹配 - 灵活）
 *   5. 其余（含无 archetype / medium / low） → Layer 4（OKR 对齐主战场，
 *      内按 interruptTolerance → priority → sourceType 排）
 */
function assignLayer(
  item: HardRulesSortableItem,
  opts: HardRulesSortOptions,
): LayerAssignment {
  const archetype = lookupArchetype(item.archetypeId, opts.archetypeMap)
  const priorityWeight = opts.priorityWeight ?? DEFAULT_PRIORITY_WEIGHT
  const sourceWeight = opts.sourceWeight ?? DEFAULT_SOURCE_WEIGHT

  // Layer 1：截止紧迫（fixedTime 永远排前）
  if (item.fixedTime) {
    return {
      primaryLayer: 1,
      subRank: item.fixedTime.hour ?? 0,
      priorityRank: 0,
      sourceRank: 0,
    }
  }

  // Layer 2a：睡眠（固定时段，sub-rank = 0，最严）
  if (isSleepArchetype(archetype)) {
    return { primaryLayer: 2, subRank: 0, priorityRank: 0, sourceRank: 0 }
  }

  // Layer 3：饮食（timebox lock，单档）
  if (isMealArchetype(archetype)) {
    return { primaryLayer: 3, subRank: 0, priorityRank: 0, sourceRank: 0 }
  }

  // Layer 2b：能量匹配（interruptTolerance=high 灵活项）
  if (archetype?.activityLabel?.interruptTolerance === 'high') {
    return { primaryLayer: 2, subRank: 1, priorityRank: 0, sourceRank: 0 }
  }

  // Layer 4：其余（无 archetype / medium / low / 默认）
  //   内排：interruptTolerance（默认 medium=1 < low=2） → priority → sourceType
  return {
    primaryLayer: 4,
    subRank: interruptToleranceRank(archetype?.activityLabel),
    priorityRank: priorityWeight[item.priority ?? ''] ?? 9,
    sourceRank: sourceWeight[item.sourceType ?? ''] ?? 9,
  }
}

// ─── 主体：sortByHardRules ─────────────────────────────────────

/**
 * §04 硬规则词典序排序（4 层 cascade）。
 *
 * 排序 key（多级比较）：
 *   1. primaryLayer（cascade：1 < 2 < 3 < 4）
 *   2. subRank（层内次序）
 *   3. priorityRank（仅 Layer 4 内：priority 权重）
 *   4. sourceRank（仅 Layer 4 内同 priority：sourceType 权重）
 *   5. 入参 index（保持 stable order）
 *
 * 纯函数：返回新数组，不修改入参。
 */
export function sortByHardRules<T extends HardRulesSortableItem>(
  items: T[],
  opts: HardRulesSortOptions = {},
): T[] {
  if (items.length <= 1) return [...items]

  // 计算每个 item 的 layer assignment；带原下标作为 final tiebreaker
  type Decorated = { item: T; assignment: LayerAssignment; index: number }
  const decorated: Decorated[] = items.map((item, index) => ({
    item,
    assignment: assignLayer(item, opts),
    index,
  }))

  decorated.sort((a, b) => {
    const aa = a.assignment
    const ba = b.assignment

    if (aa.primaryLayer !== ba.primaryLayer) return aa.primaryLayer - ba.primaryLayer
    if (aa.subRank !== ba.subRank) return aa.subRank - ba.subRank
    if (aa.priorityRank !== ba.priorityRank) return aa.priorityRank - ba.priorityRank
    if (aa.sourceRank !== ba.sourceRank) return aa.sourceRank - ba.sourceRank

    // 全部 assignment 等 → 保持入参顺序（stable sort 保证）
    return a.index - b.index
  })

  return decorated.map(d => d.item)
}
