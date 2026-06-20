/**
 * @file realtime
 * @brief [018-G3] 客户端 realtime 评估纯核心（client-safe）
 *
 * R1（method B）：纯核心不再调 loadDomainManifest（其 import fs 为 server-only，
 * 进 client bundle 会构建失败）。改为接收 realtimeRules 元数据（phase:both 规则的
 * id/fields，由 server action getRealtimeRules 取得后透传），使本模块 client-safe。
 *
 * blur 单字段时跑命中该字段的 phase: both 规则。fail-OPEN：check 抛错吞掉+记日志，
 * 不崩 onBlur handler（submit 权威兜底）。
 */
import type { ClientRuleCtx, DomainRuleRegistry, FieldIssue } from './types'

/** phase: both 规则元数据（client-safe，由 server action 提供） */
export interface RealtimeRuleMeta {
  id: string
  fields: string[]
  /** 规则 message（来自 manifest，供 mapServerErrorsToFields 回填匹配，避免 client 硬编码） */
  message: string
}

/**
 * 评估命中指定字段的所有 phase: both 规则。
 * @param realtimeRules phase: both 规则元数据（id/fields）
 * @param field blur 的字段名
 * @param value 该字段当前值
 * @param ctx 客户端上下文（最小化，无 now）
 * @param registry 本域注册表（realtime check 由 client import）
 */
export function evaluateRealtimeRules(
  realtimeRules: RealtimeRuleMeta[],
  field: string,
  value: unknown,
  ctx: ClientRuleCtx,
  registry: DomainRuleRegistry,
): FieldIssue[] {
  const issues: FieldIssue[] = []
  for (const rule of realtimeRules) {
    if (!rule.fields.includes(field)) continue
    const check = registry.realtime[rule.id]
    if (!check) continue
    try {
      issues.push(...check(value, ctx))
    } catch (e) {
      // fail-OPEN：realtime 坏不阻断用户，吞错+记日志，submit 权威兜底
      console.error(`[rules] realtime 规则 "${rule.id}" 抛错（fail-open，已吞）:`, e)
    }
  }
  return issues
}
