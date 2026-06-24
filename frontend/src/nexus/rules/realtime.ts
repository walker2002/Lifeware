/**
 * @file realtime
 * @brief 客户端 realtime 评估纯核心（client-safe）
 *
 * [020] registry 即 SSOT：本模块直接读 registry.realtime（rule 自带 fields/message/check），
 * 不再接收外部传入的 realtimeRules 元数据，也不再经 get-realtime-rules server action 中转。
 * registry 为 client-safe 纯 TS，前端可直 import。
 *
 * blur 单字段时跑命中该字段的 realtime 规则。fail-OPEN：check 抛错吞掉+记日志，
 * 不崩 onBlur handler（submit 权威兜底）。
 */
import type { ClientRuleCtx, DomainRuleRegistry, FieldIssue } from './types'

/** realtime 规则元数据（client-safe，由 realtimeMetaFromRegistry 从 registry 派生） */
export interface RealtimeRuleMeta {
  id: string
  fields: string[]
  /** 规则 message（供 mapServerErrorsToFields 回填匹配，避免 client 硬编码） */
  message: string
}

/**
 * 从 registry 派生 realtime 规则元数据（[020] registry 即 SSOT，取代 get-realtime-rules server action 中转）。
 * 供 useManifestRules / useServerErrorBackfill 等客户端消费者按需取 meta。
 */
export function realtimeMetaFromRegistry(registry: DomainRuleRegistry): RealtimeRuleMeta[] {
  return Object.entries(registry.realtime).map(([id, rule]) => ({
    id,
    fields: rule.fields,
    message: rule.message,
  }))
}

/**
 * 评估命中指定字段的所有 realtime 规则（[020] 直接读 registry）。
 * @param registry 本域注册表（realtime rule 自带 fields/message/check）
 * @param field blur 的字段名
 * @param value 该字段当前值
 * @param ctx 客户端上下文（最小化，无 now）
 */
export function evaluateRealtimeRules(
  registry: DomainRuleRegistry,
  field: string,
  value: unknown,
  ctx: ClientRuleCtx,
): FieldIssue[] {
  const issues: FieldIssue[] = []
  for (const [id, rule] of Object.entries(registry.realtime)) {
    if (!rule.fields.includes(field)) continue
    try {
      issues.push(...rule.check(value, ctx))
    } catch (e) {
      // fail-OPEN：realtime 坏不阻断用户，吞错+记日志，submit 权威兜底
      console.error(`[rules] realtime 规则 "${id}" 抛错（fail-open，已吞）:`, e)
    }
  }
  return issues
}
