/**
 * @file activity-archetypes-page.test
 * @brief Activity Archetype domain 入口的服务端预取与容器渲染测试
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'
import { ActivityArchetypesPage } from '../activity-archetypes-page'

vi.mock('@/domains/timebox/lib/server/load-activity-archetypes', () => ({
  loadActivityArchetypes: vi.fn().mockResolvedValue([]),
}))

vi.mock('../archetype-table', () => ({
  ArchetypeTable: ({ initialData }: { initialData: ActivityArchetype[] }) => (
    <div data-testid="archetype-table">{initialData.length}</div>
  ),
}))

describe('ActivityArchetypesPage', () => {
  it('预取数据并在 space-y-4 容器中渲染 ArchetypeTable', async () => {
    const view = render(await ActivityArchetypesPage())

    expect(screen.getByTestId('archetype-table')).toHaveTextContent('0')
    expect(view.container.firstElementChild).toHaveClass('space-y-4')
  })
})
