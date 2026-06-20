/**
 * @file index
 * @brief [018-G3] 规则三层架构框架 barrel
 *
 * ⚠️ 服务端专用 barrel：re-export 了 evaluateDomainRules（→ loadDomainManifest → node:fs）。
 * **client 组件（'use client'）禁止从此 barrel import**——会经 evaluate→loader 把 node:fs
 * 泄漏进 client bundle（next build 报 Can't resolve 'fs'）。client 表单须直接 import 各
 * client-safe 子模块：use-manifest-rules / realtime / server-error-mapping / server/get-realtime-rules。
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
