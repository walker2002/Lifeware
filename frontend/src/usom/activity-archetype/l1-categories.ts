/**
 * @file l1-categories
 * @brief L1 一级分类 7 大类 const + 反向映射（D4 拆分方案）
 *
 * 7 大类写死为 const，不可运行时增删。L2 二级由用户通过配置页管理。
 * L1_CATEGORY_KEYS 提供中文→key 反向映射，供 UI 渲染和查询过滤。
 */

/** L1 一级分类（7 大类，写死） */
export const L1_CATEGORIES = {
  work: '工作',
  survival: '生存',
  investment: '投资',
  relationships: '关系',
  relaxation: '放松',
  health: '健康',
  waste: '浪费',
} as const

/** L1 分类类型（中文值） */
export type L1Category = (typeof L1_CATEGORIES)[keyof typeof L1_CATEGORIES]

/** L1 分类 key 类型 */
export type L1CategoryKey = keyof typeof L1_CATEGORIES

/** 反向映射：中文→key */
export const L1_CATEGORY_KEYS: Record<string, L1CategoryKey> = Object.fromEntries(
  Object.entries(L1_CATEGORIES).map(([key, value]) => [value, key as L1CategoryKey])
) as Record<string, L1CategoryKey>
