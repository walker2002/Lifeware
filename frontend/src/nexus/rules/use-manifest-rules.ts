/**
 * @file use-manifest-rules
 * @brief 客户端 realtime 校验 React hooks（client-safe，委托 realtime 纯核心）
 *
 * [020] registry 即 SSOT：realtimeRules 元数据从 registry 派生（realtimeMetaFromRegistry），
 * 不再接收外部传入的元数据，也不再经 get-realtime-rules server action 中转。
 * 本 hook 持 errors state，blur 时调 evaluateRealtimeRules（读 registry），submit 前
 * validateAll 跑全部 realtime 字段做尽力预检。ctx 经 useMemo 稳定 identity。
 *
 * useServerErrorBackfill：派生服务端错误 → 字段/表单级映射，使用 useMemo 避免
 * set-state-in-effect lint 警告。统一消费组件的回填逻辑（HabitForm + 3 CNUI surfaces + page-level）。
 */
'use client'

import { useState, useCallback, useMemo } from 'react'
import { evaluateRealtimeRules, realtimeMetaFromRegistry, type RealtimeRuleMeta } from './realtime'
import { mapServerErrorsToFields } from './server-error-mapping'
import type { ClientRuleCtx, DomainRuleRegistry } from './types'

export interface UseManifestRulesResult {
  errors: Record<string, string>
  validateField: (field: string, value: unknown) => void
  clearField: (field: string) => void
  /** submit 前预检：跑所有 realtime 规则覆盖的字段，返回是否全通过 */
  validateAll: (values: Record<string, unknown>) => boolean
}

/**
 * [020] registry 即 SSOT：realtime meta 从 registry 派生，不再经 get-realtime-rules server action。
 * @param registry 本域注册表（client import，realtime rule 自带 fields/message/check）
 * @param ctx 客户端上下文（最小化）
 */
export function useManifestRules(
  registry: DomainRuleRegistry,
  ctx: ClientRuleCtx = {},
): UseManifestRulesResult {
  const [errors, setErrors] = useState<Record<string, string>>({})
  // 稳定 ctx identity。若 ClientRuleCtx 未来增加字段，须将依赖加入数组并移除下方 eslint-disable。
  const stableCtx = useMemo<ClientRuleCtx>(() => ctx, []) // eslint-disable-line react-hooks/exhaustive-deps
  const realtimeRules = useMemo<RealtimeRuleMeta[]>(() => realtimeMetaFromRegistry(registry), [registry])

  const validateField = useCallback(
    (field: string, value: unknown) => {
      const issues = evaluateRealtimeRules(registry, field, value, stableCtx)
      setErrors((prev) => {
        const next = { ...prev }
        const hit = issues.find((i) => i.field === field)
        if (hit) next[field] = hit.message
        else delete next[field]
        return next
      })
    },
    [registry, stableCtx],
  )

  const validateAll = useCallback(
    (values: Record<string, unknown>): boolean => {
      const fields = new Set(realtimeRules.flatMap((r) => r.fields))
      const next: Record<string, string> = {}
      for (const f of fields) {
        const issues = evaluateRealtimeRules(registry, f, values[f], stableCtx)
        const hit = issues.find((i) => i.field === f)
        if (hit) next[f] = hit.message
      }
      setErrors(next)
      return Object.keys(next).length === 0
    },
    [registry, realtimeRules, stableCtx],
  )

  const clearField = useCallback((field: string) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  return { errors, validateField, clearField, validateAll }
}

export interface ServerErrorBackfillResult {
  serverFieldErrors: Record<string, string>
  formErrors: string[]
}

/**
 * [020] realtimeRules 从 registry 派生。
 * @param serverErrors 服务端 Rejected.errors（或 CNUI handler errors[] 透传），undefined 时返回空
 * @param registry 本域注册表
 */
export function useServerErrorBackfill(
  serverErrors: string[] | undefined,
  registry: DomainRuleRegistry,
): ServerErrorBackfillResult {
  return useMemo(() => {
    if (!serverErrors || serverErrors.length === 0) {
      return { serverFieldErrors: {} as Record<string, string>, formErrors: [] as string[] }
    }
    const realtimeRules = realtimeMetaFromRegistry(registry)
    const ruleMessages: Record<string, string> = {}
    for (const r of realtimeRules) {
      ruleMessages[r.id] = r.message
    }
    const mapped = mapServerErrorsToFields(serverErrors, realtimeRules, ruleMessages)
    return { serverFieldErrors: mapped.fieldErrors, formErrors: mapped.formErrors }
  }, [serverErrors, registry])
}
