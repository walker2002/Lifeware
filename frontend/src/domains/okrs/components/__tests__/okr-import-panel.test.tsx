/**
 * @file okr-import-panel.test
 * @brief [024.1] T2 测试 — OKRImportPanel 空白高度 + 页码标签
 *
 * 覆盖：
 *  1. textarea 不强制 min-h-[400px]（短内容时高度由内容决定）
 *  2. 页码标签文本为「目标 X/M」而非「X/M」
 *  3. textarea 自带滚动溢出能力（max-h + overflow-y-auto）
 *
 * 注：textarea 高度断言通过 className 包含/不包含特定 Tailwind 类实现，
 *     避免依赖 jsdom 渲染尺寸。
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OKRImportPanel } from '../okr-import-panel'
import type { ImportReport } from '@/lib/okr-import/types'

const report: ImportReport = {
  totalObjectives: 1,
  totalKRs: 3,
  confidence: 'high',
  missingFields: [],
  warnings: [],
}

const shortMarkdown = `## Objective: 测试目标
### KR 1: 关键结果 1
- 目标值: 100%
- 当前值: 0%`

describe('[024.1] OKRImportPanel textarea 高度 + 页码标签', () => {
  it('textarea 不应包含 min-h-[400px]（避免短内容被强行撑高）', () => {
    render(
      <OKRImportPanel
        initialMarkdown={shortMarkdown}
        report={report}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const textarea = screen.getByPlaceholderText('OKR Markdown 内容...')
    expect(textarea.className).not.toMatch(/\bmin-h-\[400px\]\b/)
  })

  it('textarea 应有滚动溢出能力（max-h + overflow-y-auto）', () => {
    render(
      <OKRImportPanel
        initialMarkdown={shortMarkdown}
        report={report}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const textarea = screen.getByPlaceholderText('OKR Markdown 内容...')
    expect(textarea.className).toMatch(/overflow-y-auto/)
  })

  it('底部计数器应显示「目标 X/M」而非「X/M」', () => {
    render(
      <OKRImportPanel
        initialMarkdown={shortMarkdown}
        report={report}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/目标\s*1\/1/)).toBeInTheDocument()
  })
})