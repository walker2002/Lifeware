/**
 * @file evaluate
 * @brief [018-G3] 服务端消费者 — evaluateDomainRules
 *
 * 读 manifest 取 phase∈{both,submit} 规则：
 * - both：用 registry.realtime[id] 重跑 RealtimeCheck（单字段）→ fieldIssuesToValidationResult 适配
 * - submit：用 registry.submit[id] 跑 SubmitCheck（异步，可查库）
 * 全部结果经 aggregateValidation 折叠（复用 VALIDATION_RANK，零新规则）。
 * submit fail-CLOSED：SubmitCheck 抛错 → 该条计 Rejected + 记日志（宁可阻断也不放过无效数据）。
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { ValidationResult } from '@/usom/types/process'
import { aggregateValidation } from '@/nexus/orchestrator'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { fieldIssuesToValidationResult } from './adapter'
import type { ClientRuleCtx, DomainRuleRegistry, ServerRuleCtx } from './types'
import type { StructuredIntent } from '@/usom/types/objects'

/**
 * 评估域规则（服务端权威）。
 * @param domainId 域 id（闭包绑定本域）
 * @param intent 结构化意图
 * @param serverCtx 服务端上下文（repos/userId/now）
 * @param registry 本域规则注册表（由各域注入；真实域在 hooks 闭包内绑定，fixture 在测试直传）
 */
export async function evaluateDomainRules(
  domainId: string,
  intent: StructuredIntent,
  serverCtx: ServerRuleCtx,
  registry: DomainRuleRegistry,
): Promise<ValidationResult> {
  const loaded = loadDomainManifest(domainId)
  // 域不存在或加载失败 → 无规则可跑 → Passed（兼容真实域 R0 无 rules）
  if (!loaded.success) return validationPassed()
  const rules = loaded.manifest.rules
  if (!rules || rules.length === 0) return validationPassed()

  const clientCtx: ClientRuleCtx = {} // 最小化；realtime 重跑无需 now（both 规则不含时序）
  const results: ValidationResult[] = []

  for (const rule of rules) {
    if (rule.phase === 'both') {
      const check = registry.realtime[rule.id]
      if (!check) continue // id 完整性由 validateRuleIntegrity 兜底；运行期缺 check 跳过（realtime 是提示）
      const fieldValue = intent.fields[rule.fields[0]]
      const issues = check(fieldValue, clientCtx)
      results.push(fieldIssuesToValidationResult(issues))
    } else {
      // phase: submit
      const check = registry.submit[rule.id]
      if (!check) continue
      try {
        results.push(await check(intent, serverCtx))
      } catch (e) {
        // fail-CLOSED：submit 抛错 → Rejected + 记日志
        console.error(`[rules] submit 规则 "${rule.id}" 抛错（fail-closed）:`, e)
        results.push(validationRejected([`规则校验失败，请重试 (${rule.id})`]))
      }
    }
  }

  // 折叠所有结果（复用 VALIDATION_RANK，零新规则）
  return results.reduce((acc, r) => aggregateValidation(acc, r), validationPassed() as ValidationResult)
}
