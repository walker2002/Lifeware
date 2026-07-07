/**
 * @file get-default-energy-actual
 * @brief [023.13] 打卡专区能量默认值——archetype 4 维 EnergyCost 算术均值
 *
 * 绕开 D8（业务表不存 4 维）：取均值作单次度量 reading 默认，用户可调。
 * 无 archetype → undefined（UI 强制手填，不默认 0 防假数据）。
 */
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

/**
 * @param archetype - 活动 archetype（可选）
 * @returns 4 维均值四舍五入；无 archetype 返回 undefined
 */
export function getDefaultEnergyActual(archetype?: Pick<ActivityArchetype, 'energyCost'>): number | undefined {
  if (!archetype) return undefined
  const { physical, mental, emotional, creative } = archetype.energyCost
  return Math.round((physical + mental + emotional + creative) / 4)
}
