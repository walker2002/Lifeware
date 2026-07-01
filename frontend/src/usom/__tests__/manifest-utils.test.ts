import { describe, it, expect } from 'vitest'
import { getResponseType } from '../manifest-utils'

describe('getResponseType', () => {
  it('viewSchedule（Task 1 显式声明 page）返回 page', () => {
    expect(getResponseType('timebox', 'viewSchedule')).toBe('page') // 依赖 Task 1
  })
  it('createTimebox（response_type:cnui）返回 cnui', () => {
    expect(getResponseType('timebox', 'createTimebox')).toBe('cnui')
  })
  it('未声明 action 返回 unimplemented', () => {
    expect(getResponseType('timebox', 'nonExistent')).toBe('unimplemented')
  })
})