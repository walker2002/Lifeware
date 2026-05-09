// Intent Engine 入口
// 薄封装层，委托给 ai-parser 进行意图解析

import { parseWithAI, parseMultiTask } from './ai-parser'
import type { AIParserResult, MultiTaskParserResult, BatchIntentResult, BatchItemResult } from './ai-parser'
import type { USOM_ID } from '@/usom/types/primitives'

/**
 * 解析用户自然语言输入为结构化意图（单任务）
 */
export async function parse(
  rawInput: string,
  intentionId: USOM_ID,
): Promise<AIParserResult> {
  return parseWithAI(rawInput, intentionId)
}

/**
 * 解析用户自然语言输入中的多个时间盒任务
 */
export async function parseBatch(
  rawInput: string,
  intentionId: USOM_ID,
): Promise<MultiTaskParserResult> {
  return parseMultiTask(rawInput, intentionId)
}

// 重导出 ai-parser 的类型
export type { AIParserResult, MultiTaskParserResult, BatchIntentResult, BatchItemResult } from './ai-parser'
