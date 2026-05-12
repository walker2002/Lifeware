# OKR 文件导入功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户上传文件（Markdown/Excel/Word/TXT），AI 自动提取 OKR，用户在编辑器中确认后批量保存为草稿。

**Architecture:** 前端预处理文件→纯文本，Server Action 调用 DashScope qwen-plus 提取结构化 OKR，渲染为规范 Markdown 供用户编辑，保存时重新解析 Markdown 并逐个创建 OKR。导入编辑视图通过 OKRWorkspace 新增 `import` 模式触发，独立于现有 OKRPanel。

**Tech Stack:** Next.js Server Actions, DashScope qwen-plus (已有 openai SDK), xlsx, mammoth, react-simple-code-editor + prismjs, react-markdown

---

## 文件结构

### 新建文件

| 文件 | 职责 |
|------|------|
| `frontend/src/lib/okr-import/types.ts` | 导入相关类型定义 |
| `frontend/src/lib/okr-import/markdown-parser.ts` | Markdown ↔ ParsedObjective 双向转换 |
| `frontend/src/lib/okr-import/file-parser.ts` | 客户端文件解析（.md/.txt/.xlsx/.docx → 纯文本） |
| `frontend/src/app/actions/okr-import.ts` | Server Actions：importOKRFromFile + saveImportedOKRs |
| `frontend/src/components/okr/okr-import-dialog.tsx` | 文件上传对话框 |
| `frontend/src/components/okr/okr-import-panel.tsx` | 导入编辑视图（Banner + 编辑器 + 导航） |

### 修改文件

| 文件 | 变更 |
|------|------|
| `frontend/src/components/okr/okr-workspace.tsx` | PanelMode 新增 `import`，渲染 OKRImportPanel |
| `frontend/src/components/okr/okr-directory.tsx` | 新增"文件导入"和"模板下载"按钮 |

---

### Task 1: 安装依赖

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: 安装所需依赖包**

Run:
```bash
cd /home/walker/lifeware/frontend && npm install xlsx mammoth react-simple-code-editor prismjs react-markdown
```

Run:
```bash
cd /home/walker/lifeware/frontend && npm install -D @types/prismjs
```

- [ ] **Step 2: 验证安装成功**

Run: `cd /home/walker/lifeware/frontend && npm ls xlsx mammoth react-simple-code-editor prismjs react-markdown`
Expected: 所有包显示版本号，无 `missing` 或 `invalid`

- [ ] **Step 3: 提交**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: 添加 OKR 导入功能依赖包 (xlsx, mammoth, react-simple-code-editor, prismjs, react-markdown)"
```

---

### Task 2: 类型定义 + Markdown 解析器（TDD）

**Files:**
- Create: `frontend/src/lib/okr-import/types.ts`
- Create: `frontend/src/lib/okr-import/markdown-parser.ts`
- Create: `frontend/src/lib/__tests__/okr-import-markdown.test.ts`

- [ ] **Step 1: 编写类型定义**

Create `frontend/src/lib/okr-import/types.ts`:

```typescript
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
```

- [ ] **Step 2: 编写 Markdown 解析器测试**

Create `frontend/src/lib/__tests__/okr-import-markdown.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseOKRMarkdown, renderOKRsToMarkdown } from '@/lib/okr-import/markdown-parser'

describe('parseOKRMarkdown', () => {
  it('解析包含单个目标和两个 KR 的 Markdown', () => {
    const md = `## Objective: 提升产品质量
- **类型**: 承诺型
- **优先级**: P1
- **周期类型**: 季
- **周期**: 2026-Q2 (2026-04-01 ~ 2026-06-30)
- **描述**: 通过系统化质量管理提升产品整体质量

### KR 1: 代码覆盖率提升至 85%
- **目标值**: 85
- **单位**: %
- **截止日期**: 2026-06-30

### KR 2: 客户满意度评分达到 4.5
- **目标值**: 4.5
- **单位**: 分
- **截止日期**: 2026-06-30`

    const result = parseOKRMarkdown(md)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('提升产品质量')
    expect(result[0].okrType).toBe('committed')
    expect(result[0].priority).toBe('P1')
    expect(result[0].periodType).toBe('quarterly')
    expect(result[0].periodStart).toBe('2026-04-01')
    expect(result[0].periodEnd).toBe('2026-06-30')
    expect(result[0].description).toBe('通过系统化质量管理提升产品整体质量')
    expect(result[0].keyResults).toHaveLength(2)
    expect(result[0].keyResults[0].title).toBe('代码覆盖率提升至 85%')
    expect(result[0].keyResults[0].targetValue).toBe(85)
    expect(result[0].keyResults[0].unit).toBe('%')
    expect(result[0].keyResults[0].dueDate).toBe('2026-06-30')
    expect(result[0].keyResults[1].title).toBe('客户满意度评分达到 4.5')
    expect(result[0].keyResults[1].targetValue).toBe(4.5)
    expect(result[0].keyResults[1].unit).toBe('分')
  })

  it('解析多个目标（用 --- 分隔）', () => {
    const md = `## Objective: 目标一
- **类型**: 承诺型
- **优先级**: P1
- **周期类型**: 季
- **周期**: 2026-Q2 (2026-04-01 ~ 2026-06-30)

### KR 1: KR一
- **目标值**: 100
- **单位**: 个

---

## Objective: 目标二
- **类型**: 愿景型
- **优先级**: P2
- **周期类型**: 年
- **周期**: 2026 (2026-01-01 ~ 2026-12-31)

### KR 1: KR二
- **目标值**: 50
- **单位**: %`

    const result = parseOKRMarkdown(md)
    expect(result).toHaveLength(2)
    expect(result[0].title).toBe('目标一')
    expect(result[0].okrType).toBe('committed')
    expect(result[1].title).toBe('目标二')
    expect(result[1].okrType).toBe('visionary')
    expect(result[1].priority).toBe('P2')
    expect(result[1].periodType).toBe('annual')
    expect(result[1].periodStart).toBe('2026-01-01')
    expect(result[1].periodEnd).toBe('2026-12-31')
  })

  it('可选字段缺失时返回 undefined', () => {
    const md = `## Objective: 简单目标

### KR 1: 简单KR`

    const result = parseOKRMarkdown(md)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('简单目标')
    expect(result[0].okrType).toBeUndefined()
    expect(result[0].priority).toBeUndefined()
    expect(result[0].periodStart).toBeUndefined()
    expect(result[0].keyResults).toHaveLength(1)
    expect(result[0].keyResults[0].targetValue).toBeUndefined()
  })

  it('空字符串返回空数组', () => {
    expect(parseOKRMarkdown('')).toHaveLength(0)
    expect(parseOKRMarkdown('   ')).toHaveLength(0)
  })
})

describe('renderOKRsToMarkdown', () => {
  it('将 ParsedObjective 数组渲染为规范 Markdown', () => {
    const objectives = [
      {
        title: '提升产品质量',
        okrType: 'committed' as const,
        priority: 'P1' as const,
        periodType: 'quarterly',
        periodStart: '2026-04-01',
        periodEnd: '2026-06-30',
        description: '系统化质量管理',
        keyResults: [
          { title: '代码覆盖率 85%', targetValue: 85, unit: '%' },
        ],
      },
    ]

    const md = renderOKRsToMarkdown(objectives)
    expect(md).toContain('## Objective: 提升产品质量')
    expect(md).toContain('- **类型**: 承诺型')
    expect(md).toContain('- **优先级**: P1')
    expect(md).toContain('- **周期类型**: 季')
    expect(md).toContain('- **周期**: 2026-Q2 (2026-04-01 ~ 2026-06-30)')
    expect(md).toContain('- **描述**: 系统化质量管理')
    expect(md).toContain('### KR 1: 代码覆盖率 85%')
    expect(md).toContain('- **目标值**: 85')
    expect(md).toContain('- **单位**: %')
  })

  it('多个目标之间用 --- 分隔', () => {
    const objectives = [
      { title: '目标A', keyResults: [{ title: 'KR1' }] },
      { title: '目标B', keyResults: [{ title: 'KR2' }] },
    ]
    const md = renderOKRsToMarkdown(objectives)
    expect(md).toContain('---')
    expect(md).toContain('## Objective: 目标A')
    expect(md).toContain('## Objective: 目标B')
  })

  it('roundtrip: render → parse 保持数据一致', () => {
    const original = [
      {
        title: '提升用户留存',
        okrType: 'committed' as const,
        priority: 'P0' as const,
        periodType: 'monthly',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
        keyResults: [
          { title: '留存率达 80%', targetValue: 80, unit: '%', dueDate: '2026-05-31' },
          { title: 'DAU 突破 1万', targetValue: 10000, unit: '人' },
        ],
      },
    ]
    const md = renderOKRsToMarkdown(original)
    const parsed = parseOKRMarkdown(md)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].title).toBe('提升用户留存')
    expect(parsed[0].okrType).toBe('committed')
    expect(parsed[0].priority).toBe('P0')
    expect(parsed[0].periodStart).toBe('2026-05-01')
    expect(parsed[0].keyResults).toHaveLength(2)
    expect(parsed[0].keyResults[0].targetValue).toBe(80)
    expect(parsed[0].keyResults[1].targetValue).toBe(10000)
  })
})
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `cd /home/walker/lifeware/frontend && npx vitest run src/lib/__tests__/okr-import-markdown.test.ts`
Expected: FAIL — `Cannot find module '@/lib/okr-import/markdown-parser'`

- [ ] **Step 4: 实现 Markdown 解析器和渲染器**

Create `frontend/src/lib/okr-import/markdown-parser.ts`:

```typescript
import type { ParsedObjective, ParsedKeyResult } from './types'

// 中文周期类型 → 系统英文值
const PERIOD_TYPE_CN_TO_EN: Record<string, string> = {
  '周': 'weekly',
  '月': 'monthly',
  '季': 'quarterly',
  '半年': 'semi_annual',
  '年': 'annual',
}

// 系统英文值 → 中文周期类型
const PERIOD_TYPE_EN_TO_CN: Record<string, string> = {
  'weekly': '周',
  'monthly': '月',
  'quarterly': '季',
  'semi_annual': '半年',
  'annual': '年',
}

// OKR 类型中文 → 英文
const OKR_TYPE_CN_TO_EN: Record<string, 'committed' | 'visionary'> = {
  '承诺型': 'committed',
  '愿景型': 'visionary',
}

// OKR 类型英文 → 中文
const OKR_TYPE_EN_TO_CN: Record<string, string> = {
  'committed': '承诺型',
  'visionary': '愿景型',
}

/**
 * 解析规范的 OKR Markdown 文本为 ParsedObjective 数组
 * 格式参考 docs/superpowers/specs/2026-05-11-okr-import-design.md 第3节
 */
export function parseOKRMarkdown(markdown: string): ParsedObjective[] {
  if (!markdown.trim()) return []

  // 按 ## Objective: 标题分割为块
  const blocks = markdown.split(/(?=^## Objective:)/m).filter(b => b.trim().startsWith('## Objective:'))

  return blocks.map(block => {
    const lines = block.trim().split('\n')
    const objective: ParsedObjective = { title: '', keyResults: [] }
    let currentKR: ParsedKeyResult | null = null

    for (const line of lines) {
      // 匹配目标标题: ## Objective: xxx
      const objMatch = line.match(/^##\s+Objective:\s*(.+)/)
      if (objMatch) {
        objective.title = objMatch[1].trim()
        continue
      }

      // 匹配 KR 标题: ### KR N: xxx
      const krMatch = line.match(/^###\s+KR\s+\d+:\s*(.+)/)
      if (krMatch) {
        currentKR = { title: krMatch[1].trim() }
        objective.keyResults.push(currentKR)
        continue
      }

      // 匹配字段行: - **key**: value
      const fieldMatch = line.match(/^- \*\*(.+?)\*\*:\s*(.*)/)
      if (!fieldMatch) continue

      const [, key, value] = fieldMatch
      const trimmedValue = value.trim()
      if (!trimmedValue) continue

      if (currentKR) {
        // KR 级别字段
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
        // Objective 级别字段
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
            // 格式: "2026-Q2 (2026-04-01 ~ 2026-06-30)" 或 "2026-04-01 ~ 2026-06-30"
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
 */
function formatPeriodLabel(periodType: string | undefined, periodStart: string, periodEnd: string): string {
  const year = periodStart.slice(0, 4)
  const cnType = periodType ? PERIOD_TYPE_EN_TO_CN[periodType] : undefined

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
    // 从日期推算周数
    const d = new Date(periodStart)
    const oneJan = new Date(d.getFullYear(), 0, 1)
    const weekNum = Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7)
    return `${year}-W${String(weekNum).padStart(2, '0')} (${periodStart} ~ ${periodEnd})`
  }
  return `${periodStart} ~ ${periodEnd}`
}

/**
 * 将 ParsedObjective 数组渲染为规范 Markdown 文本
 */
export function renderOKRsToMarkdown(objectives: ParsedObjective[]): string {
  return objectives.map((obj, idx) => {
    const lines: string[] = []

    // 目标标题
    lines.push(`## Objective: ${obj.title}`)

    // 目标字段
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

    // 关键结果
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
```

- [ ] **Step 5: 运行测试，确认全部通过**

Run: `cd /home/walker/lifeware/frontend && npx vitest run src/lib/__tests__/okr-import-markdown.test.ts`
Expected: PASS — 所有测试用例通过

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/okr-import/types.ts frontend/src/lib/okr-import/markdown-parser.ts frontend/src/lib/__tests__/okr-import-markdown.test.ts
git commit -m "feat(okr-import): 添加类型定义和 Markdown 解析/渲染器"
```

---

### Task 3: 文件解析工具（客户端）

**Files:**
- Create: `frontend/src/lib/okr-import/file-parser.ts`

- [ ] **Step 1: 实现客户端文件解析工具**

Create `frontend/src/lib/okr-import/file-parser.ts`:

```typescript
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.xlsx', '.docx']

/**
 * 校验文件：格式和大小
 * 返回错误信息，校验通过返回 null
 */
export function validateFile(file: File): string | null {
  const ext = getFileExtension(file.name)
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return `不支持的文件格式: ${ext}。支持: ${SUPPORTED_EXTENSIONS.join(', ')}`
  }
  if (file.size === 0) {
    return '文件为空，请选择有内容的文件'
  }
  if (file.size > MAX_FILE_SIZE) {
    return '文件过大，请选择 5MB 以内的文件'
  }
  return null
}

/**
 * 解析上传文件为纯文本
 */
export async function parseFileToText(file: File): Promise<string> {
  const ext = getFileExtension(file.name)

  switch (ext) {
    case '.md':
    case '.txt':
      return parseTextFile(file)
    case '.xlsx':
      return parseExcelFile(file)
    case '.docx':
      return parseWordFile(file)
    default:
      throw new Error(`不支持的文件格式: ${ext}`)
  }
}

function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  return idx === -1 ? '' : filename.slice(idx).toLowerCase()
}

async function parseTextFile(file: File): Promise<string> {
  return file.text()
}

async function parseExcelFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const parts: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    // 逐行转为文本，保留基本结构
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
    for (const row of data) {
      const line = row.filter(cell => cell != null && String(cell).trim()).join(' | ')
      if (line) parts.push(line)
    }
    parts.push('') // sheet 之间空行
  }

  return parts.join('\n')
}

async function parseWordFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/lib/okr-import/file-parser.ts
git commit -m "feat(okr-import): 添加客户端文件解析工具 (md/txt/xlsx/docx)"
```

---

### Task 4: Server Action — importOKRFromFile（LLM 提取）

**Files:**
- Create: `frontend/src/app/actions/okr-import.ts`

- [ ] **Step 1: 实现导入 Server Action**

Create `frontend/src/app/actions/okr-import.ts`:

```typescript
"use server"

import type { ParsedObjective, ImportReport, ImportResult, SaveImportResult } from "@/lib/okr-import/types"
import { renderOKRsToMarkdown, parseOKRMarkdown } from "@/lib/okr-import/markdown-parser"
import { chat } from "@/lib/llm/client"
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

    // 调用 LLM
    const response = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `文件名: ${fileName}\n\n${fileContent}` },
      ],
      { temperature: 0.3, maxTokens: 4096 },
    )

    const rawText = response.choices[0]?.message?.content ?? ''

    // 提取 JSON（兼容 LLM 可能包裹 ```json ... ``` 的情况）
    const jsonStr = extractJSON(rawText)
    const parsed = JSON.parse(jsonStr)

    const objectives: ParsedObjective[] = parsed.objectives ?? []
    const report: ImportReport = parsed.report ?? buildDefaultReport(objectives)

    // 渲染为 Markdown
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

    // 校验关键性字段：任一缺失则拒绝全部保存
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

    // 逐个保存
    let savedCount = 0
    for (const okr of okrs) {
      const objResult = await createObjective({
        title: okr.title,
        description: okr.description,
        okrType: okr.okrType ?? 'committed',
        priority: okr.priority ?? 'P1',
        periodType: okr.periodType ?? 'quarterly',
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

function extractJSON(text: string): string {
  // 尝试提取 ```json ... ``` 包裹的内容
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) return codeBlockMatch[1].trim()

  // 尝试直接找 JSON 对象（以 { 开头）
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
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/app/actions/okr-import.ts
git commit -m "feat(okr-import): 添加 Server Actions (importOKRFromFile + saveImportedOKRs)"
```

---

### Task 5: OKRImportDialog — 文件上传对话框

**Files:**
- Create: `frontend/src/components/okr/okr-import-dialog.tsx`

- [ ] **Step 1: 实现文件上传对话框**

Create `frontend/src/components/okr/okr-import-dialog.tsx`:

```typescript
"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { validateFile, parseFileToText } from "@/lib/okr-import/file-parser"
import { importOKRFromFile } from "@/app/actions/okr-import"
import type { ImportResult } from "@/lib/okr-import/types"

interface OKRImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: (result: ImportResult) => void
}

const ACCEPT_TYPES = ".md,.txt,.xlsx,.docx"

export function OKRImportDialog({ open, onOpenChange, onImportComplete }: OKRImportDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    // 前端校验
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsProcessing(true)
    try {
      // 客户端解析文件为文本
      const text = await parseFileToText(file)

      // 调用 Server Action 进行 AI 提取
      const result = await importOKRFromFile(text, file.name)

      if (!result.markdown && result.parsedOKRs.length === 0) {
        setError(result.report.warnings[0] ?? 'AI 未能从文件中提取任何 OKR，请检查文件内容')
        return
      }

      onImportComplete(result)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件处理失败')
    } finally {
      setIsProcessing(false)
      // 重置 input，允许再次选择同一文件
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>导入 OKR</DialogTitle>
          <DialogDescription>
            上传包含 OKR 的文件，AI 将自动识别并提取目标与关键结果。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            支持格式: Markdown (.md)、纯文本 (.txt)、Excel (.xlsx)、Word (.docx)，文件大小限制 5MB
          </p>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_TYPES}
            onChange={handleFileChange}
            disabled={isProcessing}
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
          />
        </div>

        {isProcessing && (
          <div className="text-sm text-muted-foreground text-center py-2">
            AI 正在分析文件内容...
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: 验证 Dialog 组件存在**

Run: `ls /home/walker/lifeware/frontend/src/components/ui/dialog.tsx`
Expected: 文件存在。如果不存在，需要用 npx shadcn@latest add dialog 安装。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/okr/okr-import-dialog.tsx
git commit -m "feat(okr-import): 添加文件上传对话框组件"
```

---

### Task 6: OKRImportPanel — 导入编辑视图

**Files:**
- Create: `frontend/src/components/okr/okr-import-panel.tsx`

- [ ] **Step 1: 实现导入编辑视图**

Create `frontend/src/components/okr/okr-import-panel.tsx`:

```typescript
"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import type { ImportReport } from "@/lib/okr-import/types"

interface OKRImportPanelProps {
  initialMarkdown: string
  report: ImportReport
  onSave: (markdown: string) => Promise<{ success: boolean; error?: string; savedCount?: number }>
  onCancel: () => void
}

export function OKRImportPanel({ initialMarkdown, report, onSave, onCancel }: OKRImportPanelProps) {
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code')
  const [currentObjIndex, setCurrentObjIndex] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // 计算 Objective 数量用于导航
  const objectiveCount = useMemo(() => {
    const matches = markdown.match(/^## Objective:/gm)
    return matches ? matches.length : 0
  }, [markdown])

  const handlePrev = () => {
    setCurrentObjIndex(Math.max(0, currentObjIndex - 1))
    scrollToObjective(currentObjIndex - 1)
  }

  const handleNext = () => {
    setCurrentObjIndex(Math.min(objectiveCount - 1, currentObjIndex + 1))
    scrollToObjective(currentObjIndex + 1)
  }

  // 跳转到指定 Objective 的位置（通过 textarea 滚动）
  const scrollToObjective = (index: number) => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-okr-import-editor]')
    if (!textarea) return

    const lines = markdown.split('\n')
    let objCount = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('## Objective:')) {
        objCount++
        if (objCount === index) {
          // 计算该行在 textarea 中的大致位置
          const charsBefore = lines.slice(0, i).join('\n').length
          textarea.scrollTop = charsBefore * 0.6 // 近似滚动位置
          break
        }
      }
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    const result = await onSave(markdown)
    if (!result.success) {
      setSaveError(result.error ?? '保存失败')
    }
    setIsSaving(false)
  }

  // 报告 Banner 颜色
  const bannerStyle = report.confidence === 'high'
    ? 'bg-green-50 text-green-800 border-green-200'
    : report.confidence === 'medium'
      ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
      : 'bg-red-50 text-red-800 border-red-200'

  return (
    <div className="flex flex-col h-full">
      {/* 提取报告 Banner */}
      <div className={`mx-4 mt-4 mb-2 rounded-md border p-3 text-sm ${bannerStyle}`}>
        <div className="font-medium">
          识别到 {report.totalObjectives} 个目标、{report.totalKRs} 个关键结果
          {report.confidence !== 'high' && `（置信度: ${report.confidence === 'medium' ? '中' : '低'}）`}
        </div>
        {report.missingFields.length > 0 && (
          <div className="mt-1 text-xs">
            缺失信息: {report.missingFields.join('；')}
          </div>
        )}
        {report.warnings.length > 0 && (
          <div className="mt-1 text-xs">
            注意: {report.warnings.join('；')}
          </div>
        )}
      </div>

      {/* 模式切换 */}
      <div className="px-4 pb-2 flex gap-1">
        <button
          type="button"
          onClick={() => setViewMode('code')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            viewMode === 'code' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}
        >
          代码
        </button>
        <button
          type="button"
          onClick={() => setViewMode('preview')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            viewMode === 'preview' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}
        >
          预览
        </button>
      </div>

      {/* 编辑器/预览区 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {viewMode === 'code' ? (
          <textarea
            data-okr-import-editor
            value={markdown}
            onChange={e => setMarkdown(e.target.value)}
            className="w-full h-full min-h-[400px] p-3 rounded-md border font-mono text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="OKR Markdown 内容..."
          />
        ) : (
          <div className="prose prose-sm max-w-none p-3 rounded-md border bg-background">
            <MarkdownPreview content={markdown} />
          </div>
        )}
      </div>

      {/* 保存错误提示 */}
      {saveError && (
        <div className="mx-4 mb-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {saveError}
        </div>
      )}

      {/* 底部操作栏 */}
      <div className="border-t px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrev}
            disabled={currentObjIndex <= 0}
          >
            ← 上一个
          </Button>
          <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
            {objectiveCount > 0 ? `${currentObjIndex + 1}/${objectiveCount}` : '0/0'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={currentObjIndex >= objectiveCount - 1}
          >
            下一个 →
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving || objectiveCount === 0}>
            {isSaving ? '保存中...' : `保存全部 (${objectiveCount})`}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * 简单的 Markdown 预览组件
 * 使用 react-markdown 渲染
 */
function MarkdownPreview({ content }: { content: string }) {
  const [ReactMarkdownComp, setReactMarkdownComp] = useState<React.ComponentType<{ children: string }> | null>(null)

  useEffect(() => {
    import('react-markdown').then(mod => {
      setReactMarkdownComp(() => mod.default)
    })
  }, [])

  if (!ReactMarkdownComp) {
    // fallback: 简单的文本展示
    return <pre className="whitespace-pre-wrap text-sm">{content}</pre>
  }

  return <ReactMarkdownComp>{content}</ReactMarkdownComp>
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/okr/okr-import-panel.tsx
git commit -m "feat(okr-import): 添加导入编辑视图组件 (Banner + 编辑器 + 预览 + 导航)"
```

---

### Task 7: 集成 — 修改 OKRWorkspace 和 OKRDirectory

**Files:**
- Modify: `frontend/src/components/okr/okr-workspace.tsx`
- Modify: `frontend/src/components/okr/okr-directory.tsx`

- [ ] **Step 1: 修改 OKRWorkspace 添加 import 模式**

Edit `frontend/src/components/okr/okr-workspace.tsx`:

1) 在文件顶部追加导入:

```typescript
import { OKRImportPanel } from "./okr-import-panel"
import { OKRImportDialog } from "./okr-import-dialog"
import type { ImportResult } from "@/lib/okr-import/types"
import { saveImportedOKRs } from "@/app/actions/okr-import"
```

2) 修改 PanelMode 类型（第 12 行）:

```typescript
type PanelMode = "empty" | "detail" | "edit" | "create" | "import"
```

3) 在 `OKRWorkspace` 函数内，`isCreating` state 后面追加 import 相关 state:

```typescript
const [importOpen, setImportOpen] = useState(false)
const [importResult, setImportResult] = useState<ImportResult | null>(null)
```

4) 在 `handleActivate` 回调后面追加 import 相关回调:

```typescript
const handleImportComplete = useCallback((result: ImportResult) => {
  setImportResult(result)
  setMode("import")
}, [])

const handleSaveImport = useCallback(async (markdown: string) => {
  const result = await saveImportedOKRs(markdown)
  if (result.success) {
    setImportResult(null)
    setMode("empty")
    await hook.refresh()
  }
  return result
}, [hook])

const handleCancelImport = useCallback(() => {
  setImportResult(null)
  setMode("empty")
}, [])
```

5) 替换 return 部分（从 `return (` 开始到文件末尾），将 OKRPanel 改为条件渲染:

```typescript
  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 border-r overflow-y-auto">
        <OKRDirectory
          objectives={filteredObjectives}
          selectedId={selectedId}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onSelect={handleSelect}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onCreate={handleCreate}
          onImport={() => setImportOpen(true)}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {mode === "import" && importResult ? (
          <OKRImportPanel
            initialMarkdown={importResult.markdown}
            report={importResult.report}
            onSave={handleSaveImport}
            onCancel={handleCancelImport}
          />
        ) : (
          <OKRPanel
            mode={mode === "import" ? "empty" : mode}
            data={detailData}
            isCreating={isCreating}
            onBack={handleBack}
            onEdit={handleEdit}
            onSaveCreate={handleSaveCreate}
            onSaveEdit={handleSaveEdit}
            onActivate={handleActivate}
            onChangeStatus={handleStatusChange}
            onAddKR={selectedId ? (input) => hook.addKR(selectedId, input) : undefined}
            onUpdateKRProgress={hook.updateKRProgress}
            onDeleteKR={hook.deleteKR}
            onReload={selectedId ? async () => { const data = await hook.loadDetail(selectedId); setDetailData(data) } : undefined}
          />
        )}
      </div>
      <OKRImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportComplete={handleImportComplete}
      />
    </div>
  )
```

- [ ] **Step 2: 修改 OKRDirectory 添加按钮**

Edit `frontend/src/components/okr/okr-directory.tsx`:

1) 在 OKRDirectoryProps 接口中追加 `onImport` 属性:

在 `onCreate: () => void` 后面追加:

```typescript
onImport?: () => void
```

2) 在函数参数解构中追加 `onImport`:

将 `onCreate,` 改为 `onCreate, onImport,`

3) 在顶部按钮区域，将 `+ 新建` 按钮旁边增加导入按钮。找到这段:

```tsx
<div className="flex items-center justify-between">
  <h2 className="font-semibold text-sm">OKR 目标</h2>
  <Button size="sm" onClick={onCreate}>+ 新建</Button>
</div>
```

替换为:

```tsx
<div className="flex items-center justify-between">
  <h2 className="font-semibold text-sm">OKR 目标</h2>
  <div className="flex gap-1">
    {onImport && (
      <Button variant="outline" size="sm" onClick={onImport}>导入</Button>
    )}
    <Button variant="ghost" size="sm" onClick={downloadTemplate} title="下载导入模板">
      模板
    </Button>
    <Button size="sm" onClick={onCreate}>+ 新建</Button>
  </div>
</div>
```

4) 在 `OKRDirectory` 函数内部、`return` 之前添加模板下载函数:

```typescript
const downloadTemplate = () => {
  const template = `# OKR 导入模板

> **字段说明**
> - **类型**: 承诺型（完成型目标）| 愿景型（挑战型目标）
> - **优先级**: P0（必须完成）| P1（应该完成，默认）| P2（有余力则做）
> - **周期类型**: 周 | 月 | 季 | 半年 | 年
> - **周期格式**: <type>标识 或 起始日期 ~ 结束日期

---

## Objective: 目标标题
- **类型**: 承诺型
- **优先级**: P1
- **周期类型**: 季
- **周期**: 2026-Q2 (2026-04-01 ~ 2026-06-30)
- **描述**: 目标的详细说明

### KR 1: 关键结果标题
- **目标值**: 100
- **单位**: %
- **截止日期**: 2026-06-30

### KR 2: 关键结果标题
- **目标值**: 50
- **单位**: 个
- **截止日期**: 2026-06-30
`
  const blob = new Blob([template], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'okr-import-template.md'
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 3: 验证编译通过**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: 无类型错误（或仅有与本次变更无关的既有错误）

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/okr/okr-workspace.tsx frontend/src/components/okr/okr-directory.tsx
git commit -m "feat(okr-import): 集成导入功能到 OKR 工作区（Workspace + Directory）"
```

---

### Task 8: 端到端验证

**Files:** 无变更

- [ ] **Step 1: 启动开发服务器**

Run: `cd /home/walker/lifeware/frontend && npm run dev`

- [ ] **Step 2: 手动验证导入流程**

在浏览器中验证:
1. 打开 OKR 页面，确认目录区有"导入"按钮
2. 点击"导入"按钮，确认弹出文件选择对话框
3. 选择一个 .md 文件（包含 OKR 内容），确认 AI 提取并显示编辑器
4. 确认 Banner 显示提取报告
5. 切换代码/预览模式
6. 点击上一个/下一个导航
7. 点击"保存全部"，确认保存成功后回到空状态
8. 确认左侧列表出现新创建的 OKR（草稿状态）

- [ ] **Step 3: 运行全部测试**

Run: `cd /home/walker/lifeware/frontend && npx vitest run`
Expected: 所有既有测试 + 新增 Markdown 解析测试通过
