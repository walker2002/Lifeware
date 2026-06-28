/**
 * @file energy-state-manager
 * @brief 能量状态管理器骨架（D9 / R2）
 *
 * 本文件为 A0.1 阶段文件壳：
 * - DEFAULT_ENERGY_CURVE 常量定义（R2 + R7：Object.freeze 防误改）
 * - re-export 必要的 USOM 类型供未来 createEnergyStateManager / current / trend / curve 使用
 *
 * 完整实现（createEnergyStateManager / current / trend / curve 等）在 A0.3 阶段填充。
 *
 * @see docs/usom-design.md (A0.1 章节)
 */
import type { EnergyState, EnergyScore, EnergyCurve } from '@/usom/types/primitives'

/**
 * 默认能量曲线（D10 SSOT）。
 *
 * 整合前各处不一致：provider 用 [9,10,11]/[14,15,16]，
 * scheduling-handler fallback 用 [9,10,11]/[13,14]。统一为本常量。
 * MVP 静态（符合"只做静态设置"），未来用户校准走 EnergyStateManager.curve()。
 *
 * R7：`Object.freeze` 防运行时误改；配合 `EnergyCurve` interface 的 `readonly` 修饰。
 */
export const DEFAULT_ENERGY_CURVE: EnergyCurve = Object.freeze({
  peakHours: [9, 10, 11],
  lowHours: [14, 15, 16],
}) as EnergyCurve

// 类型 re-export 占位（A0.3 阶段用于 EnergyStateManager 接口签名）
export type { EnergyState, EnergyScore, EnergyCurve }