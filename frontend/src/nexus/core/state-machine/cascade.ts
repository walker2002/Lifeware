/**
 * @file cascade
 * @brief SM Cascade 机制 — parent_child_status 类型处理器
 *
 * 当父对象完成状态转换后，根据 manifest cascade_rules
 * 自动触发子对象的批量状态变更。
 *
 * @see docs/superpowers/specs/2026-06-04-nexus-orchestrator-constitutional-fix-design.md §3.3
 */

import type { USOM_ID } from '@/usom/types/primitives'
import type { GenericRepo } from './index'

// ─── 类型定义 ──────────────────────────────────────────────────

/**
 * parent_child_status 类型的 cascade 规则
 */
export interface ParentChildStatusRule {
  type: 'parent_child_status'
  /** 父对象类型名 */
  parent_object: string
  /** 子对象类型名 */
  child_object: string
  /** GenericRepo 上的查询方法名（findByParent） */
  child_query: string
  /** 父 action → 子对象过滤 → 子目标状态的映射规则 */
  rules: Array<{
    parent_action: string
    child_filter: string
    child_to_status: string
    event_type: string
  }>
}

/**
 * Cascade 执行结果
 */
export interface CascadeResult {
  /** 子对象类型 */
  objectType: string
  /** 受影响的子对象 ID */
  objectIds: USOM_ID[]
  /** 受影响数量 */
  count: number
  /** 子对象目标状态 */
  toStatus: string
  /** 事件类型 */
  eventType: string
}

/**
 * Cascade 执行参数
 */
export interface CascadeParams {
  rule: ParentChildStatusRule
  parentObjectType: string
  parentAction: string
  parentId: USOM_ID
  userId: USOM_ID
  getRepo: (domainId: string, objectType: string) => GenericRepo
}

// ─── 过滤器 ────────────────────────────────────────────────────

/**
 * 简单的子对象过滤器
 *
 * 支持：`status == 'value'`、`status in ['a','b']`、
 * `status != 'value'`、`status not in ['a','b']`
 *
 * @param obj - 子对象
 * @param filter - 过滤表达式
 * @returns 是否匹配
 */
function matchesFilter(obj: Record<string, unknown>, filter: string): boolean {
  // status == 'value'
  const eqMatch = filter.match(/^(\w+)\s*==\s*'([^']*)'$/)
  if (eqMatch) return obj[eqMatch[1]] === eqMatch[2]

  // status != 'value'
  const neqMatch = filter.match(/^(\w+)\s*!=\s*'([^']*)'$/)
  if (neqMatch) return obj[neqMatch[1]] !== neqMatch[2]

  // status in ['a','b']
  const inMatch = filter.match(/^(\w+)\s+in\s+\[([^\]]+)\]$/)
  if (inMatch) {
    const values = inMatch[2].split(',').map(s => s.trim().replace(/'/g, ''))
    return values.includes(obj[inMatch[1]] as string)
  }

  // status not in ['a','b']
  const notInMatch = filter.match(/^(\w+)\s+not\s+in\s+\[([^\]]+)\]$/)
  if (notInMatch) {
    const values = notInMatch[2].split(',').map(s => s.trim().replace(/'/g, ''))
    return !values.includes(obj[notInMatch[1]] as string)
  }

  return false
}

// ─── 主入口 ────────────────────────────────────────────────────

/**
 * 执行 parent_child_status 类型的 cascade
 *
 * @param params - 执行参数
 * @returns cascade 结果列表（可能为空）
 */
export async function executeCascade(params: CascadeParams): Promise<CascadeResult[]> {
  const { rule, parentObjectType, parentAction, parentId, userId, getRepo } = params

  // 只处理匹配的父对象类型
  if (parentObjectType !== rule.parent_object) return []

  // 找到匹配 parent_action 的规则
  const matchedRules = rule.rules.filter(r => r.parent_action === parentAction)
  if (matchedRules.length === 0) return []

  const childRepo = getRepo('', rule.child_object)
  const results: CascadeResult[] = []

  for (const matchRule of matchedRules) {
    // 查询子对象
    const children = childRepo.findByParent
      ? await childRepo.findByParent(parentId, userId)
      : []

    // 过滤并批量更新
    const toUpdate = children.filter(child => matchesFilter(child, matchRule.child_filter))

    if (toUpdate.length === 0) continue

    const objectIds: USOM_ID[] = []
    for (const child of toUpdate) {
      // [022.01] Phase 3：updateStatus 为可选（Obj/KR 无 status 字段）。
      // cascade 规则对 Obj/KR 已被 manifest 移除，故此路径在生产中不会触达 Obj/KR。
      if (typeof childRepo.updateStatus === 'function') {
        await childRepo.updateStatus(child.id as USOM_ID, matchRule.child_to_status, userId)
      }
      objectIds.push(child.id as USOM_ID)
    }

    results.push({
      objectType: rule.child_object,
      objectIds,
      count: toUpdate.length,
      toStatus: matchRule.child_to_status,
      eventType: matchRule.event_type,
    })
  }

  return results
}
