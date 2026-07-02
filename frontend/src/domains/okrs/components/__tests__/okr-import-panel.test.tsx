/**
 * @file okr-import-panel.test
 * @brief OKRImportPanel 代码视图高度 + 无分页 测试
 *
 * 覆盖（[024.2] 需求）：
 *  1. textarea 有固定高度 h-[60vh]（修复「只显示 3 行」——旧版仅有 max-h 无显式高度）
 *  2. textarea 自带滚动溢出（overflow-y-auto），可连续浏览整个 .md
 *  3. 已取消目标级分页导航：不存在「目标 X/M」计数与「上一个/下一个」按钮
 *  4. 保存按钮仍显示目标计数「保存全部 (N)」
 *
 * 注：textarea 高度/滚动断言通过 className 匹配实现，避免依赖 jsdom 渲染尺寸。
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

describe('OKRImportPanel 代码视图高度 + 无分页', () => {
  it('textarea 应有固定高度 h-[60vh]（修复只显示 3 行）', () => {
    render(
      <OKRImportPanel
        initialMarkdown={shortMarkdown}
        report={report}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const textarea = screen.getByPlaceholderText('OKR Markdown 内容...')
    expect(textarea.className).toMatch(/h-\[60vh\]/)
  })

  it('textarea 应有滚动溢出能力（overflow-y-auto），可浏览整个 .md', () => {
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

  it('已取消分页：不应出现「目标 X/M」计数', () => {
    render(
      <OKRImportPanel
        initialMarkdown={shortMarkdown}
        report={report}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByText(/目标\s*1\/1/)).toBeNull()
  })

  it('已取消分页：不应出现上/下翻页按钮', () => {
    render(
      <OKRImportPanel
        initialMarkdown={shortMarkdown}
        report={report}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /上一个/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /下一个/ })).toBeNull()
  })

  it('保存按钮显示目标计数「保存全部 (1)」', () => {
    render(
      <OKRImportPanel
        initialMarkdown={shortMarkdown}
        report={report}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /保存全部\s*\(1\)/ })).toBeInTheDocument()
  })
})
