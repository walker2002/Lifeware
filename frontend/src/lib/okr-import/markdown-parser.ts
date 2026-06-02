/**
 * @file markdown-parser
 * @brief OKR Markdown 解析器
 * 
 * 解析和渲染 OKR 的 Markdown 格式文本
 */

import type { ParsedObjective, ParsedKeyResult } from './types'

/** 中文周期类型 → 系统英文值映射 */
const PERIOD_TYPE_CN_TO_EN: Record<string, string> = {
  '周': 'weekly',
  '月': 'monthly',
  '季': 'quarterly',
  '半年': 'semi_annual',
  '年': 'annual',
}

/** 系统英文值 → 中文周期类型映射 */
const PERIOD_TYPE_EN_TO_CN: Record<string, string> = {
  'weekly': '周',
  'monthly': '月',
  'quarterly': '季',
  'semi_annual': '半年',
  'annual': '年',
}

/** OKR 类型中文 → 英文映射 */
const OKR_TYPE_CN_TO_EN: Record<string, 'committed' | 'visionary'> = {
  '承诺型': 'committed',
  '愿景型': 'visionary',
}

/** OKR 类型英文 → 中文映射 */
const OKR_TYPE_EN_TO_CN: Record<string, string> = {
  'committed': '承诺型',
  'visionary': '愿景型',
}

/**
 * 解析规范的 OKR Markdown 文本为 ParsedObjective 数组
 * @param markdown - Markdown 文本
 * @returns 解析后的 Objective 数组
 */
export function parseOKRMarkdown(markdown: string): ParsedObjective[] {
  if (!markdown.trim()) return []

  const blocks = markdown.split(/(?=^## Objective:)/m).filter(b => b.trim().startsWith('## Objective:'))

  return blocks.map(block => {
    const lines = block.trim().split('\n')
    const objective: ParsedObjective = { title: '', keyResults: [] }
    let currentKR: ParsedKeyResult | null = null

    for (const line of lines) {
      const objMatch = line.match(/^##\s+Objective:\s*(.+)/)
      if (objMatch) {
        objective.title = objMatch[1].trim()
        continue
      }

      const krMatch = line.match(/^###\s+KR\s+\d+:\s*(.+)/)
      if (krMatch) {
        currentKR = { title: krMatch[1].trim() }
        objective.keyResults.push(currentKR)
        continue
      }

      const fieldMatch = line.match(/^- \*\*(.+?)\*\*:\s*(.*)/)
      if (!fieldMatch) continue

      const [, key, value] = fieldMatch
      const trimmedValue = value.trim()
      if (!trimmedValue) continue

      if (currentKR) {
        switch (key) {
          case '目标值':
            currentKR.targetValue = Number(trimmedValue)
            break
          case '单位':
            currentKR.unit = trimmedValue
            break
          case '截止日期':
            currentKR.dueDate = trimmedValue
            break
          case '描述':
            currentKR.description = trimmedValue
            break
        }
      } else {
        switch (key) {
          case '类型': {
            const mapped = OKR_TYPE_CN_TO_EN[trimmedValue]
            if (mapped) objective.okrType = mapped
            break
          }
          case '优先级':
            if (['P0', 'P1', 'P2'].includes(trimmedValue)) {
              objective.priority = trimmedValue as 'P0' | 'P1' | 'P2'
            }
            break
          case '周期类型': {
            const mapped = PERIOD_TYPE_CN_TO_EN[trimmedValue]
            if (mapped) objective.periodType = mapped
            break
          }
          case '周期': {
            const dateMatch = trimmedValue.match(/\((\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})\)/)
              ?? trimmedValue.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
            if (dateMatch) {
              objective.periodStart = dateMatch[1]
              objective.periodEnd = dateMatch[2]
            }
            break
          }
          case '描述':
            objective.description = trimmedValue
            break
        }
      }
    }

    return objective
  })
}

/**
 * 根据周期类型和日期生成周期标签
 * @param periodType - 周期类型
 * @param periodStart - 周期开始日期
 * @param periodEnd - 周期结束日期
 * @returns 格式化的周期标签
 */
function formatPeriodLabel(periodType: string | undefined, periodStart: string, periodEnd: string): string {
  const year = periodStart.slice(0, 4)
  if (periodType === 'annual') {
    return `${year} (${periodStart} ~ ${periodEnd})`
  }
  if (periodType === 'semi_annual') {
    const half = Number(periodStart.slice(5, 7)) <= 6 ? 'H1' : 'H2'
    return `${year}-${half} (${periodStart} ~ ${periodEnd})`
  }
  if (periodType === 'quarterly') {
    const month = Number(periodStart.slice(5, 7))
    const q = Math.ceil(month / 3)
    return `${year}-Q${q} (${periodStart} ~ ${periodEnd})`
  }
  if (periodType === 'monthly') {
    const m = periodStart.slice(5, 7)
    return `${year}-M${m} (${periodStart} ~ ${periodEnd})`
  }
  if (periodType === 'weekly') {
    const d = new Date(periodStart)
    const oneJan = new Date(d.getFullYear(), 0, 1)
    const weekNum = Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7)
    return `${year}-W${String(weekNum).padStart(2, '0')} (${periodStart} ~ ${periodEnd})`
  }
  return `${periodStart} ~ ${periodEnd}`
}

/**
 * 将 ParsedObjective 数组渲染为规范 Markdown 文本
 * @param objectives - Objective 数组
 * @returns Markdown 文本
 */
export function renderOKRsToMarkdown(objectives: ParsedObjective[]): string {
  return objectives.map((obj) => {
    const lines: string[] = []

    lines.push(`## Objective: ${obj.title}`)

    if (obj.okrType) {
      lines.push(`- **类型**: ${OKR_TYPE_EN_TO_CN[obj.okrType] ?? obj.okrType}`)
    }
    if (obj.priority) {
      lines.push(`- **优先级**: ${obj.priority}`)
    }
    if (obj.periodType) {
      lines.push(`- **周期类型**: ${PERIOD_TYPE_EN_TO_CN[obj.periodType] ?? obj.periodType}`)
    }
    if (obj.periodStart && obj.periodEnd) {
      lines.push(`- **周期**: ${formatPeriodLabel(obj.periodType, obj.periodStart, obj.periodEnd)}`)
    }
    if (obj.description) {
      lines.push(`- **描述**: ${obj.description}`)
    }

    obj.keyResults.forEach((kr, krIdx) => {
      lines.push('')
      lines.push(`### KR ${krIdx + 1}: ${kr.title}`)
      if (kr.targetValue !== undefined) {
        lines.push(`- **目标值**: ${kr.targetValue}`)
      }
      if (kr.unit) {
        lines.push(`- **单位**: ${kr.unit}`)
      }
      if (kr.dueDate) {
        lines.push(`- **截止日期**: ${kr.dueDate}`)
      }
    })

    return lines.join('\n')
  }).join('\n\n---\n\n')
}
