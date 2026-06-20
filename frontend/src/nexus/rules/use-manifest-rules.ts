/**
 * @file use-manifest-rules
 * @brief [018-G3] 客户端 realtime 校验 React hook（薄壳，委托 realtime 纯核心）
 *
 * §4.5 method B（R1 Task7 临时适配）：realtime 规则元数据（id/fields）由调用方透传；
 * R1 Task8 将引入 getRealtimeRules server action 生成此元数据。本 hook 持 errors state，
 * blur 时调 evaluateRealtimeRules。
 * React 集成测试（renderHook + 真实表单）留 R1；R0 只测纯核心。
 */
'use client'

import { useState, useCallback } from 'react'
import { evaluateRealtimeRules, type RealtimeRuleMeta } from './realtime'
import type { ClientRuleCtx, DomainRuleRegistry } from './types'

export interface UseManifestRulesResult {
  errors: Record<string, string>
  validateField: (field: string, value: unknown) => void
  clearField: (field: string) => void
}

/**
 * @param realtimeRules phase: both 规则元数据（id/fields，由 server action 提供）
 * @param registry realtime check 注册表（client import 子集；仅 phase: both 规则）
 * @param ctx 客户端上下文（最小化）
 */
export function useManifestRules(
  realtimeRules: RealtimeRuleMeta[],
  registry: DomainRuleRegistry,
  ctx: ClientRuleCtx = {},
): UseManifestRulesResult {
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateField = useCallback(
    (field: string, value: unknown) => {
      const issues = evaluateRealtimeRules(realtimeRules, field, value, ctx, registry)
      setErrors((prev) => {
        const next = { ...prev }
        const hit = issues.find((i) => i.field === field)
        if (hit) next[field] = hit.message
        else delete next[field]
        return next
      })
    },
    [realtimeRules, registry, ctx],
  )

  const clearField = useCallback((field: string) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  return { errors, validateField, clearField }
}
