/**
 * @file register-providers.test
 * @brief ensureProvidersRegistered 幂等注册守护测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ensureProvidersRegistered } from '../register-providers'
import { clearRegistry, getRegisteredCapabilities } from '../registry'

describe('ensureProvidersRegistered', () => {
  beforeEach(() => clearRegistry())

  it('首次调用注册全部 capability', () => {
    expect(getRegisteredCapabilities()).toEqual([])
    ensureProvidersRegistered()
    const caps = getRegisteredCapabilities()
    expect(caps).toEqual(expect.arrayContaining([
      'existingTimeboxes', 'activeTasks', 'completedTasks',
      'pendingHabits', 'activeHabits', 'energyCurve',
    ]))
  })

  it('幂等：二次调用不重复注册（capability 数不变）', () => {
    ensureProvidersRegistered()
    const first = getRegisteredCapabilities().length
    ensureProvidersRegistered()
    expect(getRegisteredCapabilities().length).toBe(first)
  })
})
