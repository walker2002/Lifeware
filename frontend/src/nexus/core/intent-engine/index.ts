// Intent Engine 入口
// T015: 薄封装层，委托给 ai-parser 进行意图解析

import { parseWithAI } from './ai-parser'
import type { AIParserResult } from './ai-parser'
import type { USOM_ID } from '@/usom/types/primitives'

/**
 * 解析用户自然语言输入为结构化意图
 *
 * @param rawInput    - 用户原始自然语言输入
 * @param intentionId - 关联的 Intention 对象 ID
 * @returns 解析结果，成功时包含 intent，失败时包含 error
 */
export async function parse(
  rawInput: string,
  intentionId: USOM_ID,
): Promise<AIParserResult> {
  return parseWithAI(rawInput, intentionId)
}

// 重导出 ai-parser 的类型，供外部使用
export type { AIParserResult } from './ai-parser'
