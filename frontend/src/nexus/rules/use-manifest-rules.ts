/**
 * @file use-manifest-rules
 * @brief [018-G3] 客户端 realtime 校验 React hooks（client-safe，委托 realtime 纯核心）
 *
 * §4.5 method B：realtimeRules 元数据由 server action getRealtimeRules 取得后传入；
 * check 函数由 client import registry 子集。本 hook 持 errors state，blur 时调
 * evaluateRealtimeRules，submit 前 validateAll 跑全部 both 规则做尽力预检。
 * M3：ctx 经 useMemo 稳定，避免 validateField 每次 render 变更 identity。
 *
 * useServerErrorBackfill：派生服务端错误 → 字段/表单级映射，使用 useMemo 避免
 * set-state-in-effect lint 警告。统一 4 个消费组件的回填逻辑（HabitForm + 3 CNUI surfaces）。
 */
'use client'

import { useState, useCallback, useMemo } from 'react'
import { evaluateRealtimeRules, type RealtimeRuleMeta } from './realtime'
import { mapServerErrorsToFields } from './server-error-mapping'
import type { ClientRuleCtx, DomainRuleRegistry } from './types'

export interface UseManifestRulesResult {
  errors: Record<string, string>
  validateField: (field: string, value: unknown) => void
  clearField: (field: string) => void
  /** submit 前预检：跑所有 both 规则覆盖的字段，返回是否全通过 */
  validateAll: (values: Record<string, unknown>) => boolean
}

/**
 * @param realtimeRules phase: both 规则元数据（server action 提供）
 * @param registry realtime check 注册表（client import 子集）
 * @param ctx 客户端上下文（最小化）
 */
export function useManifestRules(
  realtimeRules: RealtimeRuleMeta[],
  registry: DomainRuleRegistry,
  ctx: ClientRuleCtx = {},
): UseManifestRulesResult {
  const [errors, setErrors] = useState<Record<string, string>>({})
  // M3：稳定 ctx identity。ClientRuleCtx 当前无字段，刻意空依赖。
  // 若 ClientRuleCtx 未来增加字段，须将依赖加入数组并移除下方 eslint-disable。
  const stableCtx = useMemo<ClientRuleCtx>(() => ctx, []) // eslint-disable-line react-hooks/exhaustive-deps

  const validateField = useCallback(
    (field: string, value: unknown) => {
      const issues = evaluateRealtimeRules(realtimeRules, field, value, stableCtx, registry)
      setErrors((prev) => {
        const next = { ...prev }
        const hit = issues.find((i) => i.field === field)
        if (hit) next[field] = hit.message
        else delete next[field]
        return next
      })
    },
    [realtimeRules, registry, stableCtx],
  )

  const validateAll = useCallback(
    (values: Record<string, unknown>): boolean => {
      const fields = new Set(realtimeRules.flatMap((r) => r.fields))
      const next: Record<string, string> = {}
      for (const f of fields) {
        const issues = evaluateRealtimeRules(realtimeRules, f, values[f], stableCtx, registry)
        const hit = issues.find((i) => i.field === f)
        if (hit) next[f] = hit.message
      }
      setErrors(next)
      return Object.keys(next).length === 0
    },
    [realtimeRules, registry, stableCtx],
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
 * [018-G3] code review R1：将服务端 submit 返回的 errors[] 映射为字段级/表单级错误。
 *
 * 使用 useMemo 派生（避免 useEffect+setState 的 set-state-in-effect lint 警告）。
 * ruleMessages 从 realtimeRules 元数据动态构建，与 manifest.yaml 保持同步（DRY）。
 *
 * @param serverErrors 服务端 Rejected.errors（或 CNUI handler errors[] 透传），undefined 时返回空
 * @param realtimeRules phase: both 规则元数据（由 getRealtimeRules server action 提供）
 */
export function useServerErrorBackfill(
  serverErrors: string[] | undefined,
  realtimeRules: RealtimeRuleMeta[],
): ServerErrorBackfillResult {
  return useMemo(() => {
    if (!serverErrors || serverErrors.length === 0) {
      return { serverFieldErrors: {} as Record<string, string>, formErrors: [] as string[] }
    }
    const ruleMessages: Record<string, string> = {}
    for (const r of realtimeRules) {
      ruleMessages[r.id] = r.message
    }
    const mapped = mapServerErrorsToFields(serverErrors, realtimeRules, ruleMessages)
    return { serverFieldErrors: mapped.fieldErrors, formErrors: mapped.formErrors }
  }, [serverErrors, realtimeRules])
}
