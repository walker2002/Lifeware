/**
 * @file edit-appointment.test
 * @brief [026.01] 重写测试覆盖双视图 + 分页 + 删除集成 + archetype 透传
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditAppointment } from '@/domains/timebox/cnui/surfaces/EditAppointment'
import type { AppointmentDraftFields } from '@/domains/timebox/cnui/surfaces/AppointmentFormFields'

const makeItem = (overrides: Partial<AppointmentDraftFields & { status: string }> = {}) => ({
  id: 'a-1',
  title: '看牙医',
  startTime: '2026-07-15T14:00:00Z',
  durationMin: 60,
  detail: null,
  people: [],
  status: 'scheduled',
  ...overrides,
})

describe('EditAppointment selecting mode', () => {
  it('renders list of items', () => {
    const items = [makeItem({ id: 'a-1' }), makeItem({ id: 'a-2', title: '约张三' })]
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText('看牙医')).toBeInTheDocument()
    expect(screen.getByText('约张三')).toBeInTheDocument()
  })

  it('shows pagination when items > PAGE_SIZE', () => {
    const items = Array.from({ length: 12 }, (_, i) => makeItem({ id: `a-${i}`, title: `约定 ${i}` }))
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/1\/3/)).toBeInTheDocument()
    expect(screen.getByText('下一页 ›')).toBeInTheDocument()
  })

  it('hides pagination when items <= PAGE_SIZE', () => {
    const items = Array.from({ length: 3 }, (_, i) => makeItem({ id: `a-${i}`, title: `约定 ${i}` }))
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.queryByText('下一页 ›')).toBeNull()
  })

  it('clicking 下一页 moves to next page', async () => {
    const items = Array.from({ length: 12 }, (_, i) => makeItem({ id: `a-${i}`, title: `约定 ${i}` }))
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    await userEvent.click(screen.getByText('下一页 ›'))
    expect(screen.getByText(/2\/3/)).toBeInTheDocument()
  })

  it('clicking item switches to editing mode', async () => {
    const onDataChange = vi.fn()
    const items = [makeItem({ id: 'a-1' })]
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={onDataChange} onConfirm={() => {}} />)
    await userEvent.click(screen.getByText('看牙医'))
    expect(screen.getByText(/编辑约定/)).toBeInTheDocument()
  })

  it('shows parseReason hint when provided', () => {
    const items = [makeItem({ id: 'a-1' })]
    render(<EditAppointment dataModel={{ items, mode: 'selecting', originalPrompt: '改成下午', parseReason: '未识别到具体时间' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/未识别到具体时间/)).toBeInTheDocument()
  })

  it('renders empty state when items is empty', () => {
    render(<EditAppointment dataModel={{ items: [], mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/暂无计划/)).toBeInTheDocument()
  })
})

describe('EditAppointment editing mode', () => {
  it('renders AppointmentFormFields with prefill', () => {
    const prefill = { ...makeItem({ id: 'a-1' }), activityArchetypeId: 'arch-1' }
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByDisplayValue('看牙医')).toBeInTheDocument()
    expect(screen.getByText(/编辑约定/)).toBeInTheDocument()
  })

  it('shows 删除 button when status is scheduled', () => {
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
  })

  it('hides 删除 button when status is expired', () => {
    const prefill = makeItem({ id: 'a-1', status: 'expired' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.queryByRole('button', { name: '删除' })).toBeNull()
  })

  it('AlertDialog opens when 删除 clicked', async () => {
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.getByText(/确认删除约定/)).toBeInTheDocument()
  })

  it('confirming delete calls onConfirm with operation=delete', async () => {
    const onConfirm = vi.fn()
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    await userEvent.click(screen.getByRole('button', { name: /确认/ }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ operation: 'delete' }))
  })

  it('点击 保存 calls onConfirm with operation=update', async () => {
    const onConfirm = vi.fn()
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ operation: 'update' }))
  })

  it('点击 返回列表 switches back to selecting', async () => {
    const onDataChange = vi.fn()
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    const items = [makeItem({ id: 'a-1' }), makeItem({ id: 'a-2' })]
    render(<EditAppointment dataModel={{ items, mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={onDataChange} onConfirm={() => {}} />)
    await userEvent.click(screen.getByText('返回列表'))
    expect(screen.getByText(/选择要修改的约定/)).toBeInTheDocument()
  })

  it('disables 保存 when title is empty', () => {
    const prefill = makeItem({ id: 'a-1', status: 'scheduled', title: '' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })
})