/**
 * @file energy-state-manager
 * @brief 能量状态管理器（D9 / R2 / R6 / R7）
 *
 * 整合 A0.1 + A0.3 阶段产物：
 * - A0.1：DEFAULT_ENERGY_CURVE 常量定义（R7：Object.freeze 防误改）
 * - A0.3：createEnergyStateManager 工厂 + current / curve / trend 实现
 *         （R6：current 推断基础用 calibratedLevel ?? activeLevel，尊重手动校准）
 *
 * MVP 范围（D8/D9/OQ-6）：
 * - current()：读时推断 inferredLevel（peak 时段 +2 / low 时段 -2 / 否则不变），
 *   activeLevel 不变（D8 单维，手动校准走 SM）
 * - curve()：返回 frozen DEFAULT_ENERGY_CURVE 引用（MVP 静态）
 * - trend()：历史快照透传（未来增强为趋势计算）
 * - applyEvent：**不接线**（MVP 不做自动扣减，B1 单写者问题消失）；
 *   未来 AI Energy Scheduler 落地时在此扩展 + optimistic locking
 *
 * 全纯函数（不耦合 repo/IO），易测。hour 由调用方传入（避免 new Date()）。
 *
 * @see docs/usom-design.md (A0.1 + A0.3 章节)
 */
import type { EnergyState, EnergyScore, EnergyCurve } from '@/usom/types/primitives'

/**
 * 默认能量曲线（D10 SSOT）。
 *
 * 整合前各处不一致：provider 用 [9,10,11]/[14,15,16]，
 * scheduling-handler fallback 用 [9,10,11]/[13,14]。统一为本常量。
 * MVP 静态（符合"只做静态设置"），未来用户校准走 EnergyStateManager.curve()。
 *
 * R7：`Object.freeze` 防运行时误改。**EnergyCurve interface 不带 readonly 字段**
 * （R7 修正：drizzle `$type<>` 与 readonly 不兼容，A0.1 commit 7538a52 去掉 readonly）。
 * 类型上允许 mutate 但运行时 frozen 抛错——双重防御。
 */
export const DEFAULT_ENERGY_CURVE: EnergyCurve = Object.freeze({
  peakHours: [9, 10, 11],
  lowHours: [14, 15, 16],
}) as EnergyCurve

/** inferredLevel 推断的调整幅度 */
const PEAK_ADJUSTMENT = 2
const LOW_ADJUSTMENT = 2

/** 能量分数边界（1-10） */
const MIN_LEVEL: EnergyScore = 1
const MAX_LEVEL: EnergyScore = 10

/** 限定到 [MIN_LEVEL, MAX_LEVEL] */
function clamp(score: number): EnergyScore {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, score)) as EnergyScore
}

/**
 * EnergyStateManager（D9 骨架）
 */
export interface EnergyStateManager {
  /**
   * 当前能量状态（读时推断 inferredLevel）。
   *
   * @param state 持久化的 EnergyState
   * @param hour 当前小时（24h 制，由调用方传入避免 new Date()）
   * @returns 推断后的 EnergyState（新对象，inferredLevel 按 EnergyCurve 调整）
   */
  current(state: EnergyState, hour: number): EnergyState

  /**
   * 能量曲线（D10：归 ContextEngine，MVP 静态默认）。
   *
   * R7：返回 frozen DEFAULT_ENERGY_CURVE 引用（Object.freeze 防误改）。
   * 注意：EnergyCurve interface 字段**不带** readonly 修饰
   * （R7 修正，drizzle $type<> 兼容）—— 类型上允许 mutate 但
   * 运行时 frozen 抛错。
   *
   * @returns DEFAULT_ENERGY_CURVE 引用（frozen）
   */
  curve(): EnergyCurve

  /**
   * 历史趋势（MVP 透传，未来增强）。
   *
   * @param snapshots 历史 EnergyState 快照（调用方从 context_snapshots 查）
   * @returns 透传快照（MVP）；未来按窗口聚合/趋势计算
   */
  trend(snapshots: EnergyState[]): EnergyState[]

  // /**
  //  * 应用完成事件扣减 EnergyState（D9：MVP 不接线）。
  //  *
  //  * 未来 AI Energy Scheduler 落地时实现：
  //  * - archetypeId → 查 EnergyCost → 扣减 activeLevel（下限保护 1）
  //  * - optimistic locking + event_id 幂等 + dead_letter_events 兜底
  //  * 当前签名预留，不实现（B1 单写者问题因此消失）。
  //  */
  // applyEvent(event: DomainEvent): Promise<void>
}

/**
 * 创建 EnergyStateManager 实例（工厂模式，对齐 Nexus 组件风格）
 */
export function createEnergyStateManager(): EnergyStateManager {
  return {
    current(state: EnergyState, hour: number): EnergyState {
      const curve = DEFAULT_ENERGY_CURVE
      // R6：推断基础用 calibratedLevel ?? activeLevel（尊重手动校准，D8）
      const base = state.calibratedLevel ?? state.activeLevel
      const isPeak = curve.peakHours.includes(hour)
      const isLow = curve.lowHours.includes(hour)

      let inferred: EnergyScore
      if (isPeak) {
        inferred = clamp(base + PEAK_ADJUSTMENT)
      } else if (isLow) {
        inferred = clamp(base - LOW_ADJUSTMENT)
      } else {
        inferred = base
      }

      return { ...state, inferredLevel: inferred }
    },

    curve(): EnergyCurve {
      return DEFAULT_ENERGY_CURVE
    },

    trend(snapshots: EnergyState[]): EnergyState[] {
      // MVP 透传；未来在此做窗口聚合/趋势计算
      return snapshots
    },
  }
}
