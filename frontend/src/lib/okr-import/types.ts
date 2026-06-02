/**
 * @file types
 * @brief OKR 导入类型定义
 * 
 * 定义 OKR 导入相关的数据结构
 */

/** LLM 提取结果中的单个目标 */
export interface ParsedObjective {
  /** 目标标题 */
  title: string
  /** 目标描述 */
  description?: string
  /** OKR 类型 */
  okrType?: 'committed' | 'visionary'
  /** 优先级 */
  priority?: 'P0' | 'P1' | 'P2'
  /** 周期类型 */
  periodType?: string
  /** 周期开始日期 */
  periodStart?: string
  /** 周期结束日期 */
  periodEnd?: string
  /** 关键结果列表 */
  keyResults: ParsedKeyResult[]
}

/** LLM 提取结果中的单个关键结果 */
export interface ParsedKeyResult {
  /** 关键结果标题 */
  title: string
  /** 关键结果描述 */
  description?: string
  /** 目标值 */
  targetValue?: number
  /** 单位 */
  unit?: string
  /** 截止日期 */
  dueDate?: string
}

/** LLM 返回的提取报告 */
export interface ImportReport {
  /** 目标总数 */
  totalObjectives: number
  /** 关键结果总数 */
  totalKRs: number
  /** 缺失字段列表 */
  missingFields: string[]
  /** 警告列表 */
  warnings: string[]
  /** 置信度 */
  confidence: 'high' | 'medium' | 'low'
}

/** Server Action 返回的完整导入结果 */
export interface ImportResult {
  /** Markdown 文本 */
  markdown: string
  /** 提取报告 */
  report: ImportReport
  /** 解析后的 OKR 列表 */
  parsedOKRs: ParsedObjective[]
}

/** 保存结果 */
export interface SaveImportResult {
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
  /** 保存数量 */
  savedCount?: number
}
