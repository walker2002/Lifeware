/**
 * @file build-status-transition-actions 测试
 * @brief 验证 STATUS_TRANSITION_ACTIONS 从 manifest lifecycle 正确派生（A1）
 */
import { describe, it, expect } from 'vitest'
import { buildStatusTransitionActions } from '../build-status-transition-actions'

describe('buildStatusTransitionActions', () => {
  it('派生 timebox 状态转换 action（排除 create）', () => {
    const s = buildStatusTransitionActions()
    expect(s.has('logTimebox')).toBe(true)
    expect(s.has('cancelTimebox')).toBe(true)
    expect(s.has('revertTimebox')).toBe(true)
  })

  it('派生 appointment 状态转换 action（排除 create）', () => {
    const s = buildStatusTransitionActions()
    expect(s.has('cancelAppointment')).toBe(true)
    expect(s.has('completeAppointment')).toBe(true)
    expect(s.has('revertAppointment')).toBe(true)
  })

  it('不含 create/edit（需字段校验）', () => {
    const s = buildStatusTransitionActions()
    expect(s.has('createTimebox')).toBe(false)
    expect(s.has('createAppointment')).toBe(false)
    expect(s.has('editTimeboxes')).toBe(false)
    expect(s.has('editAppointment')).toBe(false)
  })

  it('不含 [023.12] 已废的 start/end/overtime/expire 死成员', () => {
    const s = buildStatusTransitionActions()
    expect(s.has('startTimebox')).toBe(false)
    expect(s.has('endTimebox')).toBe(false)
    expect(s.has('overtimeTimebox')).toBe(false)
    expect(s.has('startAppointment')).toBe(false)
    expect(s.has('expireAppointment')).toBe(false)
  })
})