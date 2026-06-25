import { describe, it, expect } from 'vitest'
import { rootBreadcrumbLabel } from '../task-detail-drawer'

describe('rootBreadcrumbLabel', () => {
  it('有主线名 → 显示主线名', () => {
    expect(rootBreadcrumbLabel(true, '健康主线')).toBe('健康主线')
  })
  it('有 threadId 但未取到名 → 兜底「主线」', () => {
    expect(rootBreadcrumbLabel(true, null)).toBe('主线')
  })
  it('无主线（普通任务）→ 「普通任务」', () => {
    expect(rootBreadcrumbLabel(false, null)).toBe('普通任务')
    expect(rootBreadcrumbLabel(false, undefined)).toBe('普通任务')
  })
})
