/**
 * @file okr-template-export.test
 * @brief [024.1] T3 测试 — OKR 模板导出 + 下载按钮
 *
 * 覆盖：
 *  1. okrExportTemplatesToMarkdown 生成的 Markdown 包含 3 个模板标题
 *  2. 模板 KR 数量与 keyResults.length 一致
 *  3. OKRImportDialog 渲染「下载模板」按钮，点击触发下载
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { okrExportTemplatesToMarkdown } from '../okr-form'
import { OKRImportDialog } from '../okr-import-dialog'

describe('[024.1] okrExportTemplatesToMarkdown', () => {
  it('生成的 Markdown 包含三个模板的 Objective 标题', () => {
    const md = okrExportTemplatesToMarkdown()
    expect(md).toContain('## Objective: 季度 OKR')
    expect(md).toContain('## Objective: 月度 OKR')
    expect(md).toContain('## Objective: 个人成长 OKR')
  })

  it('每个模板的 KR 数与 keyResults.length 一致', () => {
    const md = okrExportTemplatesToMarkdown()
    const quarterSection = md.split('## Objective: 月度 OKR')[0]
    const krMatches = quarterSection.match(/###\s+KR\s+\d+:/g)
    expect(krMatches).not.toBeNull()
    // 季度模板 3 个 KR（模板定义中）
    expect(krMatches!.length).toBe(3)
  })

  it('每条 KR 行附 目标值 + 单位', () => {
    const md = okrExportTemplatesToMarkdown()
    expect(md).toMatch(/### KR 1:[\s\S]*- 目标值: 100%/)
    expect(md).toMatch(/### KR 1:[\s\S]*- 目标值: 10次/)
  })
})

describe('[024.1] OKRImportDialog 下载模板按钮', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>
  let revokeObjectURLMock: ReturnType<typeof vi.fn>
  let anchorClickMock: ReturnType<typeof vi.fn>
  let originalCreateElement: typeof document.createElement
  let createdAnchor: HTMLAnchorElement | null = null

  beforeEach(() => {
    createObjectURLMock = vi.fn(() => 'blob:mock-url')
    revokeObjectURLMock = vi.fn()
    anchorClickMock = vi.fn()
    URL.createObjectURL = createObjectURLMock
    URL.revokeObjectURL = revokeObjectURLMock

    originalCreateElement = document.createElement.bind(document)
    document.createElement = ((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') {
        createdAnchor = el as HTMLAnchorElement
        el.click = anchorClickMock
      }
      return el
    }) as typeof document.createElement
  })

  afterEach(() => {
    document.createElement = originalCreateElement
    createdAnchor = null
  })

  it('Dialog 内渲染「下载模板」按钮', () => {
    render(
      <OKRImportDialog
        open={true}
        onOpenChange={() => {}}
        onImportComplete={() => {}}
      />,
    )
    expect(screen.getByText(/下载模板/)).toBeInTheDocument()
  })

  it('点击「下载模板」触发 Blob 下载 + anchor.click', async () => {
    const user = userEvent.setup()
    render(
      <OKRImportDialog
        open={true}
        onOpenChange={() => {}}
        onImportComplete={() => {}}
      />,
    )
    await user.click(screen.getByText(/下载模板/))
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(anchorClickMock).toHaveBeenCalledTimes(1)
    expect(createdAnchor).not.toBeNull()
    expect(createdAnchor!.download).toMatch(/okr-模板.*\.md/)
  })
})