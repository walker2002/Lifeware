/**
 * @file server-error-mapping
 * @brief [018-G3] R1 §4.4 消费者B回填 — 服务端 errors → 字段映射
 *
 * 服务端 onValidate 返回 Rejected(errors) 时，把能匹配某 realtime 规则 message 的
 * 错误回填到该规则字段（标红）；匹配不上的走表单级提示（toast/banner）。
 */
import type { RealtimeRuleMeta } from './realtime'

export interface MappedServerErrors {
  /** 能映射到字段的错误（field → message） */
  fieldErrors: Record<string, string>
  /** 匹配不上的错误（表单级） */
  formErrors: string[]
}

/**
 * @param serverErrors 服务端 Rejected.errors
 * @param realtimeRules phase: both 规则元数据（id/fields）
 * @param ruleMessages 各 realtime 规则的 message（id → message，由 manifest 元数据提供）
 */
export function mapServerErrorsToFields(
  serverErrors: string[],
  realtimeRules: RealtimeRuleMeta[],
  ruleMessages: Record<string, string>,
): MappedServerErrors {
  const fieldErrors: Record<string, string> = {}
  const formErrors: string[] = []
  for (const err of serverErrors) {
    // 找 message === err 的 realtime 规则，回填其首个字段
    const matched = realtimeRules.find((r) => ruleMessages[r.id] === err)
    if (matched) {
      fieldErrors[matched.fields[0]] = err
    } else {
      formErrors.push(err)
    }
  }
  return { fieldErrors, formErrors }
}
