// LLM 提取结果中的单个目标
export interface ParsedObjective {
  title: string
  description?: string
  okrType?: 'committed' | 'visionary'
  priority?: 'P0' | 'P1' | 'P2'
  periodType?: string
  periodStart?: string
  periodEnd?: string
  keyResults: ParsedKeyResult[]
}

// LLM 提取结果中的单个关键结果
export interface ParsedKeyResult {
  title: string
  description?: string
  targetValue?: number
  unit?: string
  dueDate?: string
}

// LLM 返回的提取报告
export interface ImportReport {
  totalObjectives: number
  totalKRs: number
  missingFields: string[]
  warnings: string[]
  confidence: 'high' | 'medium' | 'low'
}

// Server Action 返回的完整导入结果
export interface ImportResult {
  markdown: string
  report: ImportReport
  parsedOKRs: ParsedObjective[]
}

// 保存结果
export interface SaveImportResult {
  success: boolean
  error?: string
  savedCount?: number
}
