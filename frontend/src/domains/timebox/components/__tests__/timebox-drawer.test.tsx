/**
 * @file timebox-drawer.test.tsx
 * @brief [023] A2 TimeboxDrawer 单测（4 PASS：创建/禁用/提交/编辑）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/app/actions/timebox', () => ({
  createTimebox: vi.fn().mockResolvedValue({ status: 'ok', timebox: { id: 'tb-1' } }),
  updateTimebox: vi.fn().mockResolvedValue({ status: 'ok', timebox: { id: 'tb-1' } }),
}))

vi.mock('@/app/actions/activity-archetype', () => ({
  getArchetypes: vi.fn().mockResolvedValue({ success: true, data: [] }),
}))

import { TimeboxDrawer } from '@/domains/timebox/components/timebox-drawer'
import { createTimebox, updateTimebox } from '@/app/actions/timebox'

describe('[023] A2 TimeboxDrawer', () => {
  beforeEach(() => {
    vi.mocked(createTimebox).mockClear()
    vi.mocked(updateTimebox).mockClear()
  })

  it('create 模式标题为「新建时间盒」', async () => {
    render(
      <TimeboxDrawer
        mode="create"
        date={new Date('2026-06-29')}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    // Sheet 同时含 visible SheetTitle + sr-only SheetDescription，断言可见的标题
    const titles = screen.getAllByText('新建时间盒')
    expect(titles.length).toBeGreaterThanOrEqual(1)
    await waitFor(() => expect(vi.mocked(createTimebox)).not.toHaveBeenCalled())
  })

  it('标题为空时保存禁用', async () => {
    render(
      <TimeboxDrawer
        mode="create"
        date={new Date('2026-06-29')}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    const btn = screen.getByText('保存时间盒').closest('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    await waitFor(() => expect(vi.mocked(createTimebox)).not.toHaveBeenCalled())
  })

  it('填标题后保存触发 createTimebox', async () => {
    const onSaved = vi.fn()
    render(
      <TimeboxDrawer
        mode="create"
        date={new Date('2026-06-29')}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    )
    // 等 ArchetypePicker effect 落幕后再操作
    await waitFor(() => expect(vi.mocked(createTimebox)).not.toHaveBeenCalled())
    fireEvent.change(screen.getByPlaceholderText('例如：专注写作'), {
      target: { value: '写作' },
    })
    fireEvent.click(screen.getByText('保存时间盒'))
    await waitFor(() => expect(vi.mocked(createTimebox)).toHaveBeenCalled())
  })

  it('edit 模式提交触发 updateTimebox（非 createTimebox）', async () => {
    render(
      <TimeboxDrawer
        mode="edit"
        editTarget={
          {
            id: 'tb-1',
            title: '旧标题',
            startTime: '2026-06-29T09:00:00Z',
            endTime: '2026-06-29T10:00:00Z',
            notes: '',
          } as any
        }
        date={new Date('2026-06-29')}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    await waitFor(() => expect(vi.mocked(createTimebox)).not.toHaveBeenCalled())
    fireEvent.change(screen.getByPlaceholderText('例如：专注写作'), {
      target: { value: '新标题' },
    })
    fireEvent.click(screen.getByText('保存时间盒'))
    await waitFor(() => expect(vi.mocked(updateTimebox)).toHaveBeenCalledWith(
      'tb-1',
      expect.objectContaining({ title: '新标题' }),
    ))
    expect(vi.mocked(createTimebox)).not.toHaveBeenCalled()
  })
})
