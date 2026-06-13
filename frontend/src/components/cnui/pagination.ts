/**
 * @file pagination
 * @brief CN-UI Surface 分页工具函数
 *
 * 纯函数，负责列表分页计算，不依赖任何 UI 状态
 */

/** 分页状态元信息 */
export interface PaginationMeta {
  /** 当前页码（1-based） */
  page: number
  /** 总页数 */
  totalPages: number
  /** 总项目数 */
  total: number
}

/** 分页结果 */
export interface PaginateResult<T = unknown> {
  /** 当前页的数据切片 */
  items: T[]
  /** 分页元信息（不超过 pageSize 时为 null） */
  pagination: PaginationMeta | null
}

/**
 * 对数组进行分页切片
 *
 * @param items - 原始数组
 * @param page - 当前页码（1-based，默认 1）
 * @param pageSize - 每页项目数（默认 5）
 * @returns 分页结果
 */
export function paginateItems<T = unknown>(
  items: T[],
  page: number = 1,
  pageSize: number = 5,
): PaginateResult<T> {
  if (items.length <= pageSize) {
    return { items, pagination: null }
  }

  const totalPages = Math.ceil(items.length / pageSize)
  const safePage = Math.max(1, Math.min(page, totalPages))
  const start = (safePage - 1) * pageSize
  const end = start + pageSize

  return {
    items: items.slice(start, end),
    pagination: { page: safePage, totalPages, total: items.length },
  }
}