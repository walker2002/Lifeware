/**
 * @file timeboxes-workspace.standalone.test
 * @brief [page-thin] D3/F1 回归：standalone prop 决定 root 高度 class
 *
 * 防回归：standalone prop 错配会破 AppShell 嵌入（app/page.tsx:103）或独立页高度。
 */
import { describe, it, expect } from 'vitest'
import { renderWithTz } from '@/contexts/__tests__/test-utils'
import { TimeboxesWorkspace } from '../timeboxes-workspace'

describe('TimeboxesWorkspace standalone prop', () => {
  it('standalone=true → root 含 h-screen', () => {
    const { container } = renderWithTz(<TimeboxesWorkspace standalone />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('h-screen')
    expect(root.className).not.toContain('h-full')
  })

  it('默认（embedded）→ root 含 h-full 不含 h-screen', () => {
    const { container } = renderWithTz(<TimeboxesWorkspace />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('h-full')
    expect(root.className).not.toContain('h-screen')
  })
})
