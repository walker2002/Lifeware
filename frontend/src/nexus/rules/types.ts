/**
 * @file types
 * @brief [018-G3] 规则三层架构 — 规则模型类型（registry 契约）
 *
 * §4.3：realtime 单值同步纯函数；submit 可异步查库。realtime 只硬错误；
 * ClientRuleCtx 无 now（realtime 纯函数零外部依赖）；ServerRuleCtx 带 userId（T-01~T04）+ now。
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
 * 域规则注册表。
 * - realtime：仅 phase: both 规则注册（submit 阶段经适配器重跑同一套 check）
 * - submit：phase: submit 规则注册（phase: both 规则不在此重复注册，权威重跑走 realtime + 适配器）
 */
export interface DomainRuleRegistry {
  realtime: Record<string, RealtimeCheck>
  submit: Record<string, SubmitCheck>
}
