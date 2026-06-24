/**
 * @file evaluate
 * @brief 服务端消费者 — evaluateDomainRules（[020] registry 即 SSOT）
 *
 * [020] Phase 2：不再 loadDomainManifest 读 rules，改遍历传入的 registry 参数（registry
 * 自带 { check, fields, message } meta，manifest 不再声明 rules）。
 *
 * D 模式顺序：先跑 submit 聚合规则、再跑 realtime 规则。submit 的 Rejected 先进 results，
 * aggregateValidation 折叠时首个 Rejected 胜出吞粒度（复刻原 manifest L 区「聚合规则置首」语义）。
 * submit fail-CLOSED：SubmitCheck 抛错 → 该条计 Rejected + 记日志（宁可阻断也不放过无效数据）。
 * realtime 重跑同样 fail-CLOSED：抛错计 Rejected（单字段提示，提示级，但服务端权威阶段严判）。
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { ValidationResult } from '@/usom/types/process'
import { aggregateValidation } from '@/nexus/orchestrator'
import { fieldIssuesToValidationResult } from './adapter'
import type { ClientRuleCtx, DomainRuleRegistry, ServerRuleCtx } from './types'
import type { StructuredIntent } from '@/usom/types/objects'

/**
 * 评估域规则（服务端权威，[020] registry 即 SSOT）。
 *
 * @param domainId 域 id（保留供日志/未来扩展；[020] 后不再读 manifest）
 * @param intent 结构化意图
 * @param serverCtx 服务端上下文（repos/userId/now）
 * @param registry 本域规则注册表（SSOT，自带 meta，由各域 hooks 闭包内绑定）
 */
export async function evaluateDomainRules(
  domainId: string,
  intent: StructuredIntent,
  serverCtx: ServerRuleCtx,
  registry: DomainRuleRegistry,
): Promise<ValidationResult> {
  void domainId // [020] 不再读 manifest；保留入参以稳定签名 + 供日志/未来扩展
  const clientCtx: ClientRuleCtx = {} // 最小化；realtime 重跑无需 now（realtime 为纯函数）
  const results: ValidationResult[] = []

  // 1. submit 聚合规则（权威，可查库，fail-CLOSED）
  for (const [id, rule] of Object.entries(registry.submit)) {
    try {
      results.push(await rule.check(intent, serverCtx))
    } catch (e) {
      console.error(`[rules] submit 规则 "${id}" 抛错（fail-closed）:`, e)
      results.push(validationRejected([`规则校验失败，请重试 (${id})`]))
    }
  }

  // 2. realtime 规则 submit 阶段权威重跑（单字段，fail-CLOSED）
  for (const [id, rule] of Object.entries(registry.realtime)) {
    for (const field of rule.fields) {
      try {
        const issues = rule.check(intent.fields[field], clientCtx)
        results.push(fieldIssuesToValidationResult(issues))
      } catch (e) {
        console.error(`[rules] realtime 规则 "${id}" 重跑抛错（fail-closed）:`, e)
        results.push(validationRejected([`规则校验失败，请重试 (${id})`]))
      }
    }
  }

  // 折叠所有结果（复用 VALIDATION_RANK，零新规则；首个 Rejected 胜出吞粒度）
  return results.reduce(
    (acc, r) => aggregateValidation(acc, r),
    validationPassed() as ValidationResult,
  )
}

