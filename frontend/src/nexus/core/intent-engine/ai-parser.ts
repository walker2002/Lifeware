// AI Parser — 意图引擎的自然语言解析模块
// 使用 LLM 将用户输入解析为 StructuredIntent

import { chat } from '@/lib/llm/client'
import type { StructuredIntent, USOM_ID, Timestamp } from '@/usom'

// ─── 系统提示词 ─────────────────────────────────────────────────

const TIMEBOX_SYSTEM_PROMPT = (now: Date) => `
你是 Lifeware 时间盒意图解析器。将用户的自然语言输入解析为结构化意图。

当前时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'full', timeStyle: 'short' })}
时区：Asia/Shanghai (UTC+8)

输出 JSON 格式：
{
  "targetDomain": "timebox",
  "action": "create_timebox",
  "fields": {
    "title": "string",
    "startTime": "ISO 8601（含时区，如 2026-05-04T09:00:00+08:00）",
    "duration": number（分钟）
  },
  "confidence": 0-1
}

规则：
- "今天" → ${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}
- "2小时" → 120 分钟
- "上午9点" → 当天 09:00
- 缺少必需字段时 confidence 设低
- 只处理时间盒相关意图，其他意图返回 confidence < 0.5
`

// ─── 返回类型 ────────────────────────────────────────────────────

export interface AIParserResult {
  success: boolean
  intent?: StructuredIntent
  error?: string
}

// ─── LLM 响应中间类型 ────────────────────────────────────────────

interface LLMIntentResponse {
  targetDomain: string
  action: string
  fields: Record<string, unknown>
  confidence: number
}

// ─── 核心解析函数 ─────────────────────────────────────────────────

/**
 * 使用 AI 将自然语言输入解析为 StructuredIntent
 *
 * @param rawInput  - 用户原始自然语言输入
 * @param intentionId - 关联的 Intention 对象 ID
 * @returns 解析结果，成功时包含 intent，失败时包含 error
 */
export async function parseWithAI(
  rawInput: string,
  intentionId: USOM_ID,
): Promise<AIParserResult> {
  try {
    // 1. 调用 LLM
    const response = await chat(
      [
        { role: 'system', content: TIMEBOX_SYSTEM_PROMPT(new Date()) },
        { role: 'user', content: rawInput },
      ],
      { temperature: 0.3 },
    )

    const content = response.choices[0]?.message?.content
    if (!content) {
      return {
        success: false,
        error: 'LLM 返回内容为空，请重试或使用表单模式',
      }
    }

    // 2. 从响应中提取 JSON（处理 markdown 代码块包裹的情况）
    const jsonStr = extractJSON(content)

    let parsed: LLMIntentResponse
    try {
      parsed = JSON.parse(jsonStr) as LLMIntentResponse
    } catch {
      return {
        success: false,
        error: `无法解析 JSON 响应，请重试或使用表单模式。原始内容：${content.slice(0, 100)}`,
      }
    }

    // 3. 验证必需字段
    const validationError = validateResponse(parsed)
    if (validationError) {
      return {
        success: false,
        error: validationError,
      }
    }

    // 4. 检查置信度
    if (parsed.confidence < 0.5) {
      return {
        success: false,
        error: `AI 置信度过低（${parsed.confidence.toFixed(2)}），建议使用表单模式输入`,
      }
    }

    // 5. 补全 endTime（LLM 通常返回 duration 而非 endTime）
    const fields = { ...parsed.fields }
    if (!fields.endTime && fields.startTime && fields.duration) {
      const start = new Date(fields.startTime as string)
      start.setMinutes(start.getMinutes() + Number(fields.duration))
      fields.endTime = start.toISOString()
    }

    // 6. 构建 StructuredIntent 并返回
    const intent: StructuredIntent = {
      id: generateUUID(),
      intentionId,
      targetDomain: parsed.targetDomain,
      action: parsed.action,
      fields,
      confidence: parsed.confidence,
      resolvedBy: 'ai',
      createdAt: new Date().toISOString() as Timestamp,
    }

    return { success: true, intent }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : '未知错误'
    return {
      success: false,
      error: `AI 解析失败：${message}`,
    }
  }
}

// ─── 辅助函数 ─────────────────────────────────────────────────────

/**
 * 从 LLM 响应内容中提取 JSON 字符串
 * 支持纯 JSON 和 markdown 代码块包裹的 JSON
 */
function extractJSON(content: string): string {
  const trimmed = content.trim()

  // 尝试匹配 markdown 代码块 ```json ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // 尝试匹配直接的花括号包裹
  const braceMatch = trimmed.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    return braceMatch[0]
  }

  // 原样返回，后续 JSON.parse 会报错
  return trimmed
}

/**
 * 验证 LLM 返回的响应结构是否完整
 */
function validateResponse(parsed: LLMIntentResponse): string | null {
  if (!parsed.targetDomain) {
    return 'AI 响应缺少 targetDomain 字段，请重试或使用表单模式'
  }

  if (!parsed.action) {
    return 'AI 响应缺少 action 字段，请重试或使用表单模式'
  }

  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
    return 'AI 响应的 confidence 字段无效，请重试或使用表单模式'
  }

  if (!parsed.fields || typeof parsed.fields !== 'object') {
    return 'AI 响应缺少 fields 字段，请重试或使用表单模式'
  }

  return null
}

/**
 * 生成 UUID v4
 */
function generateUUID(): string {
  return crypto.randomUUID()
}
