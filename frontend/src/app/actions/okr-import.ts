"use server"

import type { ParsedObjective, ImportReport, ImportResult, SaveImportResult } from "@/lib/okr-import/types"
import { renderOKRsToMarkdown, parseOKRMarkdown } from "@/lib/okr-import/markdown-parser"
import { createAIRuntime } from "@/nexus/ai-runtime"
import { createObjective, createKeyResult } from "./okr"

// ─── LLM Prompt ─────────────────────────────────────────────

const SYSTEM_PROMPT = `你是 OKR（目标与关键结果）提取助手。从用户提供的文本中提取 OKR 信息。

## 输出格式

返回纯 JSON（不要用 markdown 代码块包裹），严格遵循以下结构：

{
  "objectives": [
    {
      "title": "目标标题（必填）",
      "description": "描述（可选）",
      "okrType": "committed 或 visionary",
      "priority": "P0、P1 或 P2",
      "periodType": "weekly/monthly/quarterly/semi_annual/annual",
      "periodStart": "YYYY-MM-DD",
      "periodEnd": "YYYY-MM-DD",
      "keyResults": [
        {
          "title": "关键结果标题（必填）",
          "description": "描述（可选）",
          "targetValue": 100,
          "unit": "单位",
          "dueDate": "YYYY-MM-DD（可选）"
        }
      ]
    }
  ],
  "report": {
    "totalObjectives": 0,
    "totalKRs": 0,
    "missingFields": [],
    "warnings": [],
    "confidence": "high"
  }
}

## 枚举映射

- 类型：承诺型 → committed，愿景型 → visionary
- 优先级：P0/P1/P2（原样保留）
- 周期：周 → weekly，月 → monthly，季 → quarterly，半年 → semi_annual，年 → annual

## 规则

1. 如果文本中未指定某个字段，在 missingFields 中记录，不要编造
2. periodStart 和 periodEnd 必须是 YYYY-MM-DD 格式；如果文本只写了"2026年Q2"，请推算出具体日期
3. targetValue 必须是数字，如果文本中没有明确数值，不要编造
4. 如果完全无法提取任何 OKR，返回空 objectives 数组，confidence 设为 low
5. warnings 中记录可能不准确或需要人工确认的字段`

// ─── importOKRFromFile ───────────────────────────────────────

export async function importOKRFromFile(
  fileContent: string,
  fileName: string,
): Promise<ImportResult> {
  try {
    if (!fileContent.trim()) {
      return {
        markdown: '',
        report: { totalObjectives: 0, totalKRs: 0, missingFields: ['文件内容为空'], warnings: [], confidence: 'low' },
        parsedOKRs: [],
      }
    }

    const aiRuntime = createAIRuntime()

    const response = await aiRuntime.generate({
      domainId: 'okrs',
      action: 'importOKR',
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `文件名: ${fileName}\n\n${fileContent}` }],
      taskType: 'field_extraction',
      temperature: 0.3,
      maxTokens: 4096,
    })

    const rawText = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content)

    const jsonStr = extractJSON(rawText)
    const parsed = JSON.parse(jsonStr)

    const objectives: ParsedObjective[] = parsed.objectives ?? []
    const report: ImportReport = parsed.report ?? buildDefaultReport(objectives)

    const markdown = renderOKRsToMarkdown(objectives)

    return { markdown, report, parsedOKRs: objectives }
  } catch (err) {
    return {
      markdown: '',
      report: {
        totalObjectives: 0,
        totalKRs: 0,
        missingFields: [],
        warnings: [`AI 提取失败: ${err instanceof Error ? err.message : '未知错误'}`],
        confidence: 'low',
      },
      parsedOKRs: [],
    }
  }
}

// ─── saveImportedOKRs ────────────────────────────────────────

export async function saveImportedOKRs(markdown: string): Promise<SaveImportResult> {
  try {
    const okrs = parseOKRMarkdown(markdown)

    if (okrs.length === 0) {
      return { success: false, error: '未识别到有效的 OKR 内容' }
    }

    const criticalErrors: string[] = []
    for (const [idx, okr] of okrs.entries()) {
      if (!okr.title || !okr.title.trim()) {
        criticalErrors.push(`目标${idx + 1} 缺少标题`)
      }
      if (!okr.periodStart || !okr.periodEnd) {
        criticalErrors.push(`目标${idx + 1} 缺少周期信息`)
      }
    }
    if (criticalErrors.length > 0) {
      return { success: false, error: criticalErrors.join('；') }
    }

    let savedCount = 0
    for (const okr of okrs) {
      const objResult = await createObjective({
        title: okr.title,
        description: okr.description,
        okrType: okr.okrType ?? 'committed',
        priority: okr.priority ?? 'P1',
        periodType: okr.periodType ?? inferPeriodType(okr.periodStart!, okr.periodEnd!),
        periodStart: okr.periodStart,
        periodEnd: okr.periodEnd,
      })

      if (!objResult.success || !objResult.data) {
        return { success: false, error: `创建目标"${okr.title}"失败: ${objResult.error ?? '未知错误'}` }
      }

      const objectiveId = objResult.data.id

      for (const kr of okr.keyResults) {
        if (!kr.title?.trim()) continue
        await createKeyResult(objectiveId, {
          title: kr.title,
          description: kr.description,
          targetValue: kr.targetValue ?? 100,
          unit: kr.unit ?? '个',
        })
      }
      savedCount++
    }

    return { success: true, savedCount }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '保存失败' }
  }
}

// ─── 内部工具函数 ─────────────────────────────────────────────

function inferPeriodType(start: string, end: string): string {
  const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000)
  if (days <= 8) return 'weekly'
  if (days <= 35) return 'monthly'
  if (days <= 100) return 'quarterly'
  if (days <= 200) return 'semi_annual'
  return 'annual'
}

function extractJSON(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) return codeBlockMatch[1].trim()

  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    return text.slice(jsonStart, jsonEnd + 1)
  }

  return text.trim()
}

function buildDefaultReport(objectives: ParsedObjective[]): ImportReport {
  let totalKRs = 0
  const missingFields: string[] = []

  objectives.forEach((obj, idx) => {
    totalKRs += obj.keyResults.length
    if (!obj.okrType) missingFields.push(`目标${idx + 1} 缺少类型`)
    if (!obj.periodStart || !obj.periodEnd) missingFields.push(`目标${idx + 1} 缺少周期`)
    if (obj.keyResults.length === 0) missingFields.push(`目标${idx + 1} 没有关键结果`)
  })

  return {
    totalObjectives: objectives.length,
    totalKRs,
    missingFields,
    warnings: [],
    confidence: missingFields.length === 0 ? 'high' : missingFields.length <= 2 ? 'medium' : 'low',
  }
}
