/**
 * @file types
 * @brief 规则模型类型（registry 契约）。
 *
 * - [018-G3] §4.3：realtime 单值同步纯函数；submit 可异步查库。realtime 只硬错误；
 *   ClientRuleCtx 无 now（realtime 纯函数零外部依赖）；ServerRuleCtx 带 userId（T-01~T04）+ now。
 * - [020] registry 即 SSOT：每条 rule 自带 { check, fields, message } meta，
 *   manifest 不再声明 rules，本文件为唯一权威类型来源。
 * @see docs/superpowers/specs/2026-06-20-rules-three-tier-architecture-design.md §4.3
 */

import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import type { ValidationResult } from '@/usom/types/process'

/**
 * 字段级问题：realtime 检查产出。
 * field 用于 §4.4 提交失败按字段回填标红。
 */
export interface FieldIssue {
  field: string
  message: string
}

/**
 * 客户端 realtime 上下文：最小化。
 * 刻意不携带 now / userId —— 保证 RealtimeCheck 为纯函数（§4.3 不变式 3）。
 * StartTimeInFuture 等需时序的规则走 submit（ServerRuleCtx.now），不进 realtime。
 */
export interface ClientRuleCtx {
  /* 占位：当前无字段。未来若需透传只读元数据在此扩展，禁止携带可变/时序状态。 */
}

/**
 * 服务端 submit 上下文。
 * - repos：域仓储（多租户查询须带 userId，T-01~T-04）
 * - now：取自 USOMSnapshot.currentTime，供 StartTimeInFuture 等 submit 规则使用
 */
export interface ServerRuleCtx {
  repos: unknown
  userId: USOM_ID
  now: number
}

/**
 * realtime 检查：同步、纯函数、无 repo、不读 now/随机。
 * 按【单字段值】判定（多字段规则进 SubmitCheck）。
 */
export type RealtimeCheck = (value: unknown, ctx: ClientRuleCtx) => FieldIssue[]

/**
 * submit 检查：可异步、可查 repo。按【整个 Intent】判定（多字段/查库）。
 * 返回 5 变体 ValidationResult（复用已就绪判定模型）。
 */
export type SubmitCheck = (intent: StructuredIntent, ctx: ServerRuleCtx) => Promise<ValidationResult>

/**
 * realtime 规则：check + 元数据（[020] registry 即 SSOT，meta 自带）。
 * - check：同步、纯函数、无 repo、不读 now/随机。按【单字段值】判定。
 * - fields：phase: both 恰好 1 字段。
 * - message：客户端 blur 提示 + 服务端错误回填匹配。
 */
export interface RealtimeRule {
  check: RealtimeCheck
  fields: string[]
  message: string
}

/**
 * submit 规则：check + 元数据。
 * - check：可异步、可查 repo，按【整个 Intent】判定，返回 5 变体 ValidationResult。
 * - fields/message：记录覆盖字段与提示（meta）。
 */
export interface SubmitRule {
  check: SubmitCheck
  fields: string[]
  message: string
}

/**
 * 域规则注册表（[020] registry 即 SSOT）。
 * - realtime：phase: both 规则（自带 fields/message meta，客户端直 import）
 * - submit：phase: submit 规则（自带 fields/message meta）
 * manifest 不再声明 rules；本注册表为唯一权威来源。
 */
export interface DomainRuleRegistry {
  realtime: Record<string, RealtimeRule>
  submit: Record<string, SubmitRule>
}
