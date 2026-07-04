/**
 * @file energy-curve-provider
 * @brief 能量曲线上下文提供者（D10 改名自 energy-profile-provider）
 *
 * 实现 ContextProvider 接口，提供用户能量曲线数据。
 * D10 整合：peakHours/lowHours 引用 DEFAULT_ENERGY_CURVE（SSOT），
 * 消除与 orchestration-handler 的默认值不一致。
 *
 * R13：EnergyCurve SSOT 不含 source 字段；source 是 provider 运行时附加的元数据。
 *
 * **F1（[023] A0 post-review）**：spread `{...DEFAULT_ENERGY_CURVE, source}`
 * 仅克隆对象顶层，peak/low 数组仍是同一引用——caller mutate
 * 会破坏 SSOT。改为 spread 数组克隆（`[...DEFAULT_ENERGY_CURVE.peakHours]`），
 * 同时配合 energy-state-manager.ts `deepFreezeEnergyCurve` 双重防御。
 */
import type { ContextProvider } from '@/usom/types/process'
import { DEFAULT_ENERGY_CURVE } from '@/nexus/context-engine/energy-state-manager'

/**
 * 能量曲线上下文提供者
 */
export class EnergyCurveProvider implements ContextProvider {
  /**
   * 提供能量曲线上下文数据
   *
   * @param query - 查询类型
   * @param _params - 查询参数（暂未使用）
   * @returns 能量曲线数据（含运行时附加的 source 元数据）
   *          peakHours/lowHours **独立副本**（spread 克隆），caller mutate 不影响 SSOT
   */
  async provide(query: string, _params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'energy_curve') return null

    return {
      peakHours: [...DEFAULT_ENERGY_CURVE.peakHours],
      lowHours: [...DEFAULT_ENERGY_CURVE.lowHours],
      source: 'system_default',
    }
  }
}