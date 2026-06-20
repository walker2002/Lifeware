/**
 * @file rules-registry
 * @brief [018-G3] R0 fixture 域规则注册表（2 条 tracer，打通两层）
 *
 * - fixture_name_required (phase: both)：单字段 RealtimeCheck，空字符串→FieldIssue
 * - fixture_count_positive (phase: submit)：SubmitCheck，count<=0→Rejected
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { DomainRuleRegistry, RealtimeCheck, SubmitCheck } from '@/nexus/rules/types'

const nameRequired: RealtimeCheck = (value, _ctx) => {
  if (typeof value !== 'string' || value.trim() === '') {
    return [{ field: 'name', message: '名称不能为空' }]
  }
  return []
}

const countPositive: SubmitCheck = async (intent, _ctx) => {
  const count = intent.fields['count']
  if (typeof count === 'number' && count <= 0) {
    return validationRejected(['数量必须为正数'])
  }
  return validationPassed()
}

export const fixtureRuleRegistry: DomainRuleRegistry = {
  realtime: { fixture_name_required: nameRequired },
  submit: { fixture_count_positive: countPositive },
}
