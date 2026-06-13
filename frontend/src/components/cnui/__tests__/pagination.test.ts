/**
 * @file pagination.test
 * @brief 分页工具函数测试
 */

import { describe, it, expect } from 'vitest'
import { paginateItems } from '../pagination'

describe('paginateItems', () => {
  it('不超过 pageSize 时不分页', () => {
    const items = [1, 2, 3]
    const result = paginateItems(items, 1, 5)
    expect(result.items).toEqual([1, 2, 3])
    expect(result.pagination).toBeNull()
  })

  it('刚好等于 pageSize 时也不分页', () => {
    const items = [1, 2, 3, 4, 5]
    const result = paginateItems(items, 1, 5)
    expect(result.items).toEqual([1, 2, 3, 4, 5])
    expect(result.pagination).toBeNull()
  })

  it('超过 pageSize 时正确分页', () => {
    const items = [1, 2, 3, 4, 5, 6, 7]
    const result = paginateItems(items, 1, 5)
    expect(result.items).toEqual([1, 2, 3, 4, 5])
    expect(result.pagination).toEqual({ page: 1, totalPages: 2, total: 7 })
  })

  it('第二页返回正确切片', () => {
    const items = [1, 2, 3, 4, 5, 6, 7]
    const result = paginateItems(items, 2, 5)
    expect(result.items).toEqual([6, 7])
    expect(result.pagination).toEqual({ page: 2, totalPages: 2, total: 7 })
  })

  it('page 超出范围时 clamp 到最后一页', () => {
    const items = [1, 2, 3, 4, 5, 6, 7]
    const result = paginateItems(items, 99, 5)
    expect(result.items).toEqual([6, 7])
    expect(result.pagination!.page).toBe(2)
  })

  it('page 为 0 或负数时 clamp 到第一页', () => {
    const items = [1, 2, 3, 4, 5, 6]
    const result = paginateItems(items, 0, 5)
    expect(result.items).toEqual([1, 2, 3, 4, 5])
    expect(result.pagination!.page).toBe(1)
  })

  it('空数组返回空结果且不分页', () => {
    const result = paginateItems([], 1, 5)
    expect(result.items).toEqual([])
    expect(result.pagination).toBeNull()
  })

  it('使用默认参数', () => {
    const items = Array.from({ length: 12 }, (_, i) => i)
    const result = paginateItems(items)
    expect(result.items).toHaveLength(5)
    expect(result.pagination!.totalPages).toBe(3)
  })
})