/**
 * @file realtime
 * @brief [018-G3] 客户端 realtime 评估纯核心
 *
 * blur 单字段时，跑命中该字段的 phase: both 规则（fields 含该字段）。
 * fail-OPEN：realtime 是附加提示，check 抛错吞掉+记日志，不崩 onBlur handler（submit 权威兜底）。
 */
import { loadDomainManifest } from '@/domains/manifest-loader'
import type { ClientRuleCtx, DomainRuleRegistry, FieldIssue } from './types'

/**
 * 评估命中指定字段的所有 phase: both 规则。
 * @param domainId 域 id
 * @param field blur 的字段名
 * @param value 该字段当前值
 * @param ctx 客户端上下文（最小化，无 now）
 * @param registry 本域注册表（realtime 元数据+check 由 Server Component props 透传，见 §4.5）
 */
export function evaluateRealtimeRules(
  domainId: string,
  field: string,
  value: unknown,
  ctx: ClientRuleCtx,
  registry: DomainRuleRegistry,
): FieldIssue[] {
  const loaded = loadDomainManifest(domainId)
  if (!loaded.success) return []
  const rules = loaded.manifest.rules
  if (!rules) return []

  const issues: FieldIssue[] = []
  for (const rule of rules) {
    if (rule.phase !== 'both') continue // submit 规则不进 realtime
    if (!rule.fields.includes(field)) continue // 未命中该字段
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
