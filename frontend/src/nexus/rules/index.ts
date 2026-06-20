/**
 * @file index
 * @brief [018-G3] 规则三层架构框架 barrel
 */
export type {
  FieldIssue,
  ClientRuleCtx,
  ServerRuleCtx,
  RealtimeCheck,
  SubmitCheck,
  DomainRuleRegistry,
} from './types'
export { fieldIssuesToValidationResult } from './adapter'
export { validateRuleIntegrity } from './integrity'
export { evaluateDomainRules } from './evaluate'
export { evaluateRealtimeRules, type RealtimeRuleMeta } from './realtime'
export { useManifestRules } from './use-manifest-rules'
export type { UseManifestRulesResult } from './use-manifest-rules'
export { getRealtimeRules } from './server/get-realtime-rules'
