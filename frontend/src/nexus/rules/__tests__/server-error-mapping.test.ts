/**
 * @file server-error-mapping.test
 * @brief [018-G3] R1 Task9 — mapServerErrorsToFields：服务端 errors → 字段回填
 */
import { describe, it, expect } from 'vitest'
import { mapServerErrorsToFields } from '../server-error-mapping'
import type { RealtimeRuleMeta } from '../realtime'

const rules: RealtimeRuleMeta[] = [
  { id: 'habit_default_duration_positive', fields: ['defaultDuration'] },
  { id: 'habit_default_time_format', fields: ['defaultTime'] },
]
// 模拟 registry 中规则的 message（映射靠 message 匹配）
const ruleMessages: Record<string, string> = {
  habit_default_duration_positive: '默认时长必须大于 0',
  habit_default_time_format: '默认时间必须是有效的 HH:MM 格式',
}

describe('mapServerErrorsToFields', () => {
  it('能匹配 realtime 规则 message 的 error → 回填到字段', () => {
    const r = mapServerErrorsToFields(['默认时长必须大于 0'], rules, ruleMessages)
    expect(r.fieldErrors).toEqual({ defaultDuration: '默认时长必须大于 0' })
    expect(r.formErrors).toEqual([])
  })
  it('匹配不上的 error（如「标题必填」非 realtime）→ 走 formErrors', () => {
    const r = mapServerErrorsToFields(['标题必填'], rules, ruleMessages)
    expect(r.fieldErrors).toEqual({})
    expect(r.formErrors).toEqual(['标题必填'])
  })
  it('混合：部分匹配字段、部分走表单', () => {
    const r = mapServerErrorsToFields(['标题必填', '默认时间必须是有效的 HH:MM 格式'], rules, ruleMessages)
    expect(r.fieldErrors).toEqual({ defaultTime: '默认时间必须是有效的 HH:MM 格式' })
    expect(r.formErrors).toEqual(['标题必填'])
  })
})
