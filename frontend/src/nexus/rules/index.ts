/**
 * @file index
 * @brief [018-G3] 规则三层架构框架 barrel
 *
 * ⚠️ 服务端专用 barrel：re-export 了 evaluateDomainRules（服务端权威评估，[020] 起改读传入的
 * registry 参数，不再 loadDomainManifest）。仍判服务端专用：evaluate 经 orchestrator 在
 * 服务端执行，且本 barrel 还 re-export 了 use-manifest-rules / server-error-mapping 等 client
 * 路径——client 组件（'use client'）禁止从此 barrel import，直接 import 各 client-safe 子模块。
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
export { useManifestRules, useServerErrorBackfill } from './use-manifest-rules'
export type { UseManifestRulesResult, ServerErrorBackfillResult } from './use-manifest-rules'
export { getRealtimeRules } from './server/get-realtime-rules'
export { mapServerErrorsToFields } from './server-error-mapping'
