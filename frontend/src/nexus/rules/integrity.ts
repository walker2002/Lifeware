/**
 * @file integrity
 * @brief [018-G3] manifest rule.id ↔ registry 完整性校验（纯函数）
 *
 * 消灭「规则只在 manifest 声明、registry 漏注册」的静默 no-op（需求 problem 2 病灶）。
 * 由 scripts/validate-manifest.ts（真实域 build/CI）与框架测试（fixture）共用。
 */
import type { DomainRuleRegistry } from './types'

/** manifest 的 rules 区块形状（仅取所需字段，与 DomainManifest 解耦） */
interface ManifestWithRules {
  rules?: Array<{ id: string; phase: 'submit' | 'both'; fields: string[]; message: string }>
}

/**
 * 校验 manifest 声明的每条规则都在 registry 正确注册。
 * @returns 错误消息数组（空 = 通过）
 */
export function validateRuleIntegrity(
  manifest: ManifestWithRules,
  registry: DomainRuleRegistry,
): string[] {
  const errors: string[] = []
  const rules = manifest.rules
  if (!rules || rules.length === 0) return errors

  const seenIds = new Set<string>()
  for (const rule of rules) {
    // duplicate id
    if (seenIds.has(rule.id)) {
      errors.push(`规则 id 重复: "${rule.id}"`)
    }
    seenIds.add(rule.id)

    // phase ↔ registry 位置一致
    if (rule.phase === 'both') {
      // phase: both 规则必须是单字段（evaluateDomainRules 只取 rule.fields[0]）
      if (rule.fields.length !== 1) {
        errors.push(`规则 "${rule.id}" phase:both 必须恰好包含 1 个字段，当前 ${rule.fields.length} 个（多字段规则请用 phase: submit）`)
      }
      if (!(rule.id in registry.realtime)) {
        errors.push(`规则 "${rule.id}" phase:both 但 registry.realtime 未注册其 check（孤儿 id，将静默 no-op）`)
      }
    } else {
      // phase: submit
      if (!(rule.id in registry.submit)) {
        errors.push(`规则 "${rule.id}" phase:submit 但 registry.submit 未注册其 check（孤儿 id，将静默 no-op）`)
      }
    }
  }
  return errors
}
