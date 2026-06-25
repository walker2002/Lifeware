import { describe, it, expect } from 'vitest'
import { resolveThreadFromFilter } from '../task-tree-view'

describe('resolveThreadFromFilter', () => {
  it('具体主线 id 原样返回', () => {
    expect(resolveThreadFromFilter('thread-abc')).toBe('thread-abc')
  })
  it('__all__ 与 __orphan__ → undefined', () => {
    expect(resolveThreadFromFilter('__all__')).toBeUndefined()
    expect(resolveThreadFromFilter('__orphan__')).toBeUndefined()
  })
  it('undefined → undefined', () => {
    expect(resolveThreadFromFilter(undefined)).toBeUndefined()
  })
})
