/**
 * @file delete-appointment.test.tsx
 * @brief [026] T17 P2 CNUI DeleteAppointment surface 渲染测试
 *
 * 守护 3 个分支：
 * - items=0 → "暂无计划/执行中的约定（过期/已完成不可删）" 空态
 * - items>0 → 多选 toggle（点 item 切勾选）
 * - 提交 → 调 onConfirm({ ...dataModel, selectedIds })
 *
 * 不依赖 DB（纯 RTL 渲染 + onConfirm spy）。
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { DeleteAppointment } from '../DeleteAppointment'

interface DeleteItem { id: string; title: string; startTime: string; status: string }

/** 构造 items（2 条） */
function makeItems(): DeleteItem[] {
  return [
    { id: 'i1', title: '看牙医', startTime: '2026-07-10T09:00:00.000Z', status: 'scheduled' },
    { id: 'i2', title: '买菜', startTime: '2026-07-10T14:00:00.000Z', status: 'in_progress' },
  ]
}

describe('[026] T17 <DeleteAppointment> 渲染稳定性', () => {
  it('items.length=0 渲染「暂无计划/执行中的约定（过期/已完成不可删）」空态', () => {
    render(
      <DeleteAppointment
        surfaceType="deleteAppointment"
        dataModel={{ items: [] }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('暂无计划/执行中的约定（过期/已完成不可删）')).toBeInTheDocument()
  })

  it('items>0 渲染列表（标题 + 状态标签）', () => {
    render(
      <DeleteAppointment
        surfaceType="deleteAppointment"
        dataModel={{ items: makeItems() }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('选择要删除的约定（仅计划/执行中，可多选）')).toBeInTheDocument()
    expect(screen.getByText('看牙医')).toBeInTheDocument()
    expect(screen.getByText('买菜')).toBeInTheDocument()
    expect(screen.getByText('计划')).toBeInTheDocument()
    expect(screen.getByText('执行中')).toBeInTheDocument()
  })

  it('未选任何 item → 删除按钮 disabled（selected.size=0）', () => {
    render(
      <DeleteAppointment
        surfaceType="deleteAppointment"
        dataModel={{ items: makeItems() }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const del = screen.getByText(/删除选中/).closest('button') as HTMLButtonElement
    expect(del.disabled).toBe(true)
    // 标签显示计数 0
    expect(del.textContent).toContain('删除选中（0）')
  })

  it('点击 item 切勾选：勾选态有「✓」+ 计数 +1', () => {
    render(
      <DeleteAppointment
        surfaceType="deleteAppointment"
        dataModel={{ items: makeItems() }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('看牙医').closest('button')!)
    // 勾选后按钮 enable + 计数 1
    const del = screen.getByText(/删除选中/).closest('button') as HTMLButtonElement
    expect(del.disabled).toBe(false)
    expect(del.textContent).toContain('删除选中（1）')
    // 勾选后渲染 ✓ 标记
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('再次点击已勾选 item → 取消勾选（计数回 0，✓ 消失）', () => {
    render(
      <DeleteAppointment
        surfaceType="deleteAppointment"
        dataModel={{ items: makeItems() }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const itemBtn = screen.getByText('看牙医').closest('button')!
    fireEvent.click(itemBtn) // 勾选
    expect(screen.getByText('✓')).toBeInTheDocument()
    fireEvent.click(itemBtn) // 取消
    expect(screen.queryByText('✓')).toBeNull()
    const del = screen.getByText(/删除选中/).closest('button') as HTMLButtonElement
    expect(del.disabled).toBe(true)
  })

  it('多选 2 条 → submit 调 onConfirm({ ...dataModel, selectedIds: [i1, i2] })', () => {
    const onConfirm = vi.fn()
    render(
      <DeleteAppointment
        surfaceType="deleteAppointment"
        dataModel={{ items: makeItems() }}
        onDataChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    )
    fireEvent.click(screen.getByText('看牙医').closest('button')!)
    fireEvent.click(screen.getByText('买菜').closest('button')!)
    const del = screen.getByText(/删除选中/).closest('button') as HTMLButtonElement
    expect(del.textContent).toContain('删除选中（2）')
    fireEvent.click(del)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const arg = onConfirm.mock.calls[0][0] as Record<string, unknown>
    expect(arg.selectedIds).toEqual(['i1', 'i2'])
    // dataModel 其它字段透传
    expect(arg.items).toEqual(makeItems())
  })

  it('isDone=true 渲染「✅ N 个约定已删除」', () => {
    render(
      <DeleteAppointment
        surfaceType="deleteAppointment"
        dataModel={{ items: makeItems() }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
        isDone
      />,
    )
    expect(screen.getByText('✅ 2 个约定已删除')).toBeInTheDocument()
  })
})
