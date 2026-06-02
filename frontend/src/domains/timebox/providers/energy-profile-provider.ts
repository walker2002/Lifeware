/**
 * @file energy-profile-provider
 * @brief 能量曲线上下文提供者
 * 
 * 实现 ContextProvider 接口，提供用户能量曲线数据的查询能力
 */

import type { ContextProvider } from '@/usom/types/process'

/**
 * 能量曲线上下文提供者
 */
export class EnergyProfileProvider implements ContextProvider {
  /**
   * 提供能量曲线上下文数据
   * 
   * @param query - 查询类型
   * @param _params - 查询参数（暂未使用）
   * @returns 能量曲线数据
   */
  async provide(query: string, _params: Record<string, unknown>): Promise<unknown> {
    if (query !== 'energy_profile') return null

    return {
      peakHours: [9, 10, 11],
      lowHours: [14, 15, 16],
      source: 'system_default',
    }
  }
}
