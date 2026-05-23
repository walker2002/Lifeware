// Intent Engine 入口
// 薄封装层，委托给 ai-parser 进行意图解析

import { parseWithAI, parseMultiTask } from './ai-parser'
import type { AIParserResult, MultiTaskParserResult, BatchIntentResult, BatchItemResult } from './ai-parser'
import { matchShortcut } from './shortcut-matcher'
import type { ShortcutMatch } from './shortcut-matcher'
import type { USOM_ID } from '@/usom/types/primitives'
import type { AIRuntime } from '@/nexus/ai-runtime'

/**
 * 将 ShortcutMatch 转换为 AIParserResult
 * 快捷方式命中时 fields 为空对象，由调用方根据 action 填充
 */
function shortcutToResult(match: ShortcutMatch, intentionId: USOM_ID): AIParserResult {
  return {
    success: true,
    intent: {
      id: crypto.randomUUID(),
      intentionId,
      targetDomain: match.domainId,
      action: match.action,
      fields: {},
      confidence: match.confidence,
      resolvedBy: 'template_form' as const,
      createdAt: new Date().toISOString(),
    },
  }
}

/**
 * 解析用户自然语言输入为结构化意图（单任务）
 * 快捷方式（/开头）优先匹配，命中则跳过 AI 解析
 */
export async function parse(
  rawInput: string,
  intentionId: USOM_ID,
  aiRuntime: AIRuntime,
): Promise<AIParserResult> {
  const shortcut = matchShortcut(rawInput)
  if (shortcut) return shortcutToResult(shortcut, intentionId)

  return parseWithAI(rawInput, intentionId, aiRuntime)
}

/**
 * 解析用户自然语言输入中的多个时间盒任务
 */
export async function parseBatch(
  rawInput: string,
  intentionId: USOM_ID,
  aiRuntime: AIRuntime,
): Promise<MultiTaskParserResult> {
  return parseMultiTask(rawInput, intentionId, aiRuntime)
}

// 重导出 ai-parser 的类型
export type { AIParserResult, MultiTaskParserResult, BatchIntentResult, BatchItemResult } from './ai-parser'
export type { ShortcutMatch } from './shortcut-matcher'
