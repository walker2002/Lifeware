/**
 * @file appointment-route.test
 * @brief [page-thin] D7/5A：appointment server 入口 render 测试
 *
 * mock load helper 避免触 DB；mock AppointmentWorkspace 仅记录 props +
 * 渲染 data-testid；动态 import async server component 后断言
 *   - 入口容器自带 h-screen / flex / flex-col（D4/F2：容器归入口所有）
 *   - AppointmentWorkspace 已渲染（data-testid 在 DOM）
 *   - initialItems 正确透传（mock 记录的 props）
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { AppointmentSummary } from '@/usom/types/summaries'

// mock load helper（避免触 DB）
vi.mock('@/domains/timebox/lib/server/load-appointments', () => ({
  loadAppointmentsForPage: vi.fn().mockResolvedValue([]),
}))

// mock AppointmentWorkspace：记录 props + 渲染 data-testid
const workspaceCalls: { initialItems: AppointmentSummary[] }[] = []
vi.mock('@/domains/timebox/components/appointment-workspace', () => ({
  AppointmentWorkspace: (props: { initialItems: AppointmentSummary[] }) => {
    workspaceCalls.push({ initialItems: props.initialItems })
    return <div data-testid="appointment-workspace-mock" />
  },
}))

// 动态 import（async server component）
const { AppointmentRoute } = await import('../appointment-route')

describe('AppointmentRoute', () => {
  it('渲染 h-screen/flex/flex-col 容器 + AppointmentWorkspace + initialItems 透传', async () => {
    workspaceCalls.length = 0
    const { container, getByTestId } = render(await AppointmentRoute())
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('h-screen')
    expect(root.className).toContain('flex')
    expect(root.className).toContain('flex-col')
    expect(getByTestId('appointment-workspace-mock')).toBeTruthy()
    expect(workspaceCalls).toHaveLength(1)
    expect(workspaceCalls[0]!.initialItems).toEqual([])
  })
})
