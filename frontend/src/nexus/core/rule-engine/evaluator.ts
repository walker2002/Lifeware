// Rule Engine 评估器
// T016: 顺序执行规则，聚合结果，返回最高严重级别

import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot, GenerationResult, GeneratedProposal } from '@/usom/types/process'

// ─── 规则接口 ─────────────────────────────────────────────────

/** 单条规则的计算结果 */
export type RuleResult =
  | { severity: 'pass' }
  | { severity: 'warning'; message: string }
  | { severity: 'confirm'; message: string }

/** 规则定义 */
export interface Rule {
  name: string
  evaluate(intent: StructuredIntent, snapshot: ContextSnapshot): RuleResult | Promise<RuleResult>
}

// ─── 聚合结果类型 ─────────────────────────────────────────────

/** 所有规则评估后的聚合结果 */
export interface AggregatedResult {
  /** 最高严重级别：pass < warning < confirm */
  severity: 'pass' | 'warning' | 'confirm'
  /** 所有 warning 消息 */
  warnings: string[]
  /** 所有 confirm 消息 */
  confirmations: string[]
}

// ─── 严重级别排序 ─────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  pass: 0,
  warning: 1,
  confirm: 2,
}

/**
 * 返回两个严重级别中更高的那个
 */
function higherSeverity(
  a: 'pass' | 'warning' | 'confirm',
  b: 'pass' | 'warning' | 'confirm',
): 'pass' | 'warning' | 'confirm' {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b
}

// ─── 核心评估函数 ─────────────────────────────────────────────

/**
 * 顺序执行规则数组，聚合所有结果
 *
 * 评估逻辑：
 * 1. 逐条执行规则（支持异步），收集 warning 和 confirm 消息
 * 2. 返回最高严重级别作为聚合结果的 severity
 * 3. 即使遇到 confirm 也不中断，继续评估以收集所有问题
 *
 * @param rules    - 规则数组
 * @param intent   - 待评估的结构化意图
 * @param snapshot - 当前上下文快照
 * @returns 聚合评估结果
 */
export async function evaluateRules(
  rules: Rule[],
  intent: StructuredIntent,
  snapshot: ContextSnapshot,
): Promise<AggregatedResult> {
  let highestSeverity: 'pass' | 'warning' | 'confirm' = 'pass'
  const warnings: string[] = []
  const confirmations: string[] = []

  for (const rule of rules) {
    const result = await rule.evaluate(intent, snapshot)

    switch (result.severity) {
      case 'warning':
        warnings.push(result.message)
        break
      case 'confirm':
        confirmations.push(result.message)
        break
    }

    highestSeverity = higherSeverity(highestSeverity, result.severity)
  }

  return {
    severity: highestSeverity,
    warnings,
    confirmations,
  }
}

// ─── 生成型 Proposal 验证 ───────────────────────────────────

export interface ProposalValidationResult {
  proposalId: string
  status: 'pass' | 'warning' | 'reject'
  reasons: string[]
}

/**
 * 验证 GenerationResult 中每个 proposal 的时间冲突和能量匹配
 * 纯函数，不含外部 IO
 */
export function evaluateProposals(
  generationResult: GenerationResult,
  _snapshot?: ContextSnapshot,
): ProposalValidationResult[] {
  const proposals = generationResult.proposalSet.proposals

  return proposals.map(proposal => {
    const reasons: string[] = []

    // 检查提案内部的时间冲突（与其他 proposal 重叠）
    const overlap = findProposalOverlap(proposal, proposals)
    if (overlap) {
      reasons.push(`时间重叠: 与提案 "${overlap.payload.title}" (${overlap.payload.startTime}-${overlap.payload.endTime}) 冲突`)
    }

    // 检查能量匹配分数
    if (proposal.energyMatch && proposal.energyMatch.score < 0.3) {
      reasons.push(`能量不匹配: 需要 ${proposal.energyMatch.required}，实际 ${proposal.energyMatch.actual}（分数 ${proposal.energyMatch.score.toFixed(1)}）`)
    }

    const status = reasons.length === 0 ? 'pass' : 'warning' as const

    return {
      proposalId: proposal.id,
      status,
      reasons,
    }
  })
}

function findProposalOverlap(
  proposal: GeneratedProposal,
  allProposals: GeneratedProposal[],
): GeneratedProposal | undefined {
  const pStart = timeToMinutes(proposal.payload.startTime as string)
  const pEnd = timeToMinutes(proposal.payload.endTime as string)

  for (const other of allProposals) {
    if (other.id === proposal.id) continue
    const oStart = timeToMinutes(other.payload.startTime as string)
    const oEnd = timeToMinutes(other.payload.endTime as string)
    if (pStart < oEnd && pEnd > oStart) return other
  }
  return undefined
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m ?? 0)
}
