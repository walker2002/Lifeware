/**
 * @file energy-curve-provider
 * @brief 能量曲线上下文提供者（D10 改名自 energy-profile-provider）
 *
 * 实现 ContextProvider 接口，提供用户能量曲线数据。
 * D10 整合：peakHours/lowHours 引用 DEFAULT_ENERGY_CURVE（SSOT），
 * 消除与 scheduling-handler 的默认值不一致。
 *
 * R13：EnergyCurve SSOT 不含 source 字段；source 是 provider 运行时附加的元数据。
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
   */
  async provide(query: string, _params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'energy_curve') return null

    return {
      ...DEFAULT_ENERGY_CURVE,
      source: 'system_default',
    }
  }
}
