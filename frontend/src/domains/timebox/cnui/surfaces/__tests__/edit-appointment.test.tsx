/**
 * @file edit-appointment.test.tsx
 * @brief [026] T17 P2 CNUI EditAppointment surface 渲染测试
 *
 * 守护 3 个分支：
 * - items=0 → "暂无计划/执行中的约定" 空态
 * - items>0 → 列表（点击 item 进入编辑表单）
 * - 编辑表单 submit → 调 onConfirm(dataModel with selected)
 *
 * 不依赖 DB（纯 RTL 渲染 + onConfirm spy）。
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { EditAppointment } from '../EditAppointment'
import type { AppointmentDraftFields } from '../AppointmentFormFields'

type EditItem = AppointmentDraftFields & { status: string }

/** 构造 items（2 条） */
function makeItems(): EditItem[] {
  return [
    { id: 'i1', title: '看牙医', startTime: '2026-07-10T09:00:00.000Z', durationMin: 30, detail: '', people: [], status: 'scheduled' },
    { id: 'i2', title: '买菜', startTime: '2026-07-10T14:00:00.000Z', durationMin: 20, detail: '', people: [], status: 'in_progress' },
  ]
}

describe('[026] T17 <EditAppointment> 渲染稳定性', () => {
  it('items.length=0 渲染「暂无计划/执行中的约定」空态', () => {
    render(
      <EditAppointment
        surfaceType="editAppointment"
        dataModel={{ items: [] }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('暂无计划/执行中的约定')).toBeInTheDocument()
  })

  it('items>0 渲染列表：标题 + 状态标签 + 时间 + 时长', () => {
    render(
      <EditAppointment
        surfaceType="editAppointment"
        dataModel={{ items: makeItems() }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('选择要修改的约定（仅计划/执行中）')).toBeInTheDocument()
    expect(screen.getByText('看牙医')).toBeInTheDocument()
    expect(screen.getByText('买菜')).toBeInTheDocument()
    // status 标签
    expect(screen.getByText('计划')).toBeInTheDocument()
    expect(screen.getByText('执行中')).toBeInTheDocument()
  })

  it('点击 item 进入编辑表单：渲染「编辑约定」标题 + 字段', () => {
    render(
      <EditAppointment
        surfaceType="editAppointment"
        dataModel={{ items: makeItems() }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('看牙医').closest('button')!)
    // 进入 form 态：标题变为「编辑约定（计划）」
    expect(screen.getByText('编辑约定（计划）')).toBeInTheDocument()
    // 字段预填
    expect((screen.getByLabelText('事件名称') as HTMLInputElement).value).toBe('看牙医')
    expect((screen.getByLabelText('时长(分)') as HTMLInputElement).value).toBe('30')
  })

  it('编辑表单：修改 title + submit 调 onConfirm(dataModel with selected)', () => {
    const onConfirm = vi.fn()
    const onDataChange = vi.fn()
    render(
      <EditAppointment
        surfaceType="editAppointment"
        dataModel={{ items: makeItems() }}
        onDataChange={onDataChange}
        onConfirm={onConfirm}
      />,
    )
    fireEvent.click(screen.getByText('看牙医').closest('button')!)
    const titleInput = screen.getByLabelText('事件名称') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: '复诊牙医' } })
    fireEvent.click(screen.getByText('保存').closest('button')!)
    // onConfirm 收到 dataModel（含 selected 含修改后的 title）
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const arg = onConfirm.mock.calls[0][0] as Record<string, unknown>
    const selected = arg.selected as EditItem
    expect(selected.id).toBe('i1')
    expect(selected.title).toBe('复诊牙医')
    expect(selected.status).toBe('scheduled')
  })

  it('编辑表单：title 空 → 保存按钮 disabled', () => {
    render(
      <EditAppointment
        surfaceType="editAppointment"
        dataModel={{ items: makeItems() }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('看牙医').closest('button')!)
    const titleInput = screen.getByLabelText('事件名称') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: '' } })
    const save = screen.getByText('保存').closest('button') as HTMLButtonElement
    expect(save.disabled).toBe(true)
  })

  it('编辑表单：点「返回列表」回到列表态（selectedId 重置）', () => {
    render(
      <EditAppointment
        surfaceType="editAppointment"
        dataModel={{ items: makeItems() }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('看牙医').closest('button')!)
    expect(screen.getByText('编辑约定（计划）')).toBeInTheDocument()
    fireEvent.click(screen.getByText('返回列表'))
    expect(screen.getByText('选择要修改的约定（仅计划/执行中）')).toBeInTheDocument()
  })

  it('isDone=true 渲染「✅ 约定已更新」', () => {
    render(
      <EditAppointment
        surfaceType="editAppointment"
        dataModel={{ items: makeItems() }}
        onDataChange={vi.fn()}
        onConfirm={vi.fn()}
        isDone
      />,
    )
    expect(screen.getByText('✅ 约定已更新')).toBeInTheDocument()
  })
})
