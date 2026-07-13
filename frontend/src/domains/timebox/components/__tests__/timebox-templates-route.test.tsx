/**
 * @file timebox-templates-route.test
 * @brief 时间盒模板独立路由 domain 入口的服务端预取与容器渲染测试
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TimeboxTemplate } from '@/lib/db/repositories/timebox-template'
import { TimeboxTemplatesRoute } from '../timebox-templates-route'

vi.mock('@/domains/timebox/lib/server/load-templates', () => ({
  loadTimeboxTemplates: vi.fn().mockResolvedValue([]),
}))

vi.mock('../timebox-template-editor', () => ({
  TimeboxTemplateEditor: ({ initialTemplates }: { initialTemplates: TimeboxTemplate[] }) => (
    <div data-testid="timebox-template-editor">{initialTemplates.length}</div>
  ),
}))

describe('TimeboxTemplatesRoute', () => {
  it('预取模板并在 min-h-full flex flex-col 容器中渲染编辑器', async () => {
    const view = render(await TimeboxTemplatesRoute())

    expect(screen.getByTestId('timebox-template-editor')).toHaveTextContent('0')
    expect(view.container.firstElementChild).toHaveClass('min-h-full', 'flex', 'flex-col')
  })
})
