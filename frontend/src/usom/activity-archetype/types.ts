/**
 * @file types
 * @brief Activity Archetype USOM 类型定义（D8 + D4 拆分方案）
 *
 * EnergyCost 4 维仅在 Archetype 侧（D8）。ActivityLabel 6 维仅在配置表存储（T3）。
 * 业务表（tasks/habits/timebox）只引用 activityArchetypeId，不存 4 维/6 维。
 *
 * @see docs/usom-design.md §3.11
 */

import type { USOM_ID, Timestamp } from '@/usom/types/primitives'

// ─── EnergyCost：4 维能量消耗（D8 最终方案）─────────────────────

/**
 * 活动对 4 个维度的能量消耗（各 1-10，10=最高消耗）。
 *
 * D8：4 维仅在 Archetype 侧。业务表只引用 activityArchetypeId。
 * 用户可校准（未来个性化模型的粉底）。
 */
export interface EnergyCost {
  /** 体力消耗 1-10（如跑步=9，冥想=1） */
  physical: number
  /** 脑力消耗 1-10（如写论文=10，打扫卫生=2） */
  mental: number
  /** 情绪消耗 1-10（如吵架=9，闲聊=2） */
  emotional: number
  /** 创造力消耗 1-10（如设计 UI=9，copy-paste=1） */
  creative: number
}

// ─── ActivityLabel：6 维执行特征（T3 决议保留）─────────────────

/**
 * 活动的执行特征标签（6 维），仅 ActivityArchetype 配置表存储。
 *
 * T3 决议：保留，但不存业务表。未来复盘做 6 维指标利于 AI Scheduler。
 */
export interface ActivityLabel {
  /** 喜欢度 1-10（10=非常喜欢） */
  enjoyment: number
  /** 典型时长（分钟） */
  typicalDuration: number
  /** 中断容忍度：low=不可中断 / medium=可短暂中断 / high=随时可中断 */
  interruptTolerance: 'low' | 'medium' | 'high'
  /** 环境标签（如 ['安静', '电脑', '站立']） */
  environment: string[]
  /** 地点标签（如 ['办公室', '家', '户外']） */
  location: string[]
  /** 是否可与其他活动并行（如散步+听播客=true） */
  parallelizable: boolean
}

// ─── ActivityArchetype：核心对象 ────────────────────────────────

import type { L1Category } from './l1-categories'

/**
 * Activity Archetype — 跨域共享能量词典的核心实体。
 *
 * 属性：
 * - l1Category + l2Name 构成二级分类体系
 * - energyCost 描述"完成该活动对各维度的消耗"
 * - activityLabel 描述"该活动如何被执行"
 * - isSystem 标记系统内置条目（不可删除）
 *
 * 生命周期：无状态机（OQ-7：配置变更不走 SM）。增删改走 Repository + user_audit_log。
 */
export interface ActivityArchetype {
  id: USOM_ID
  userId: USOM_ID
  /** L1 一级分类（7 选 1） */
  l1Category: L1Category
  /** L2 二级名称（如"深度专注"、"有氧运动"）*/
  l2Name: string
  /** 4 维能量消耗 */
  energyCost: EnergyCost
  /** 6 维执行特征 */
  activityLabel: ActivityLabel
  /** 同义词/范围描述短语（用于标题→archetype 匹配；[] 表示未维护） */
  synonyms: string[]
  /** 系统内置（不可删除） */
  isSystem: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}
