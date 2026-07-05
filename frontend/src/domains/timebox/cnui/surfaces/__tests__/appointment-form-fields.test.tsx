/**
 * @file appointment-form-fields.test.tsx
 * @brief [026] T17 P2 CNUI 公共组件渲染测试
 *
 * 守护 <AppointmentFormFields> 4 字段输入稳定性。
 * CreateAppointment / EditAppointment 共用此组件，回归会同时影响两端。
 *
 * 不依赖 DB（纯 RTL 渲染 + onChange 回调 spy）。
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { AppointmentFormFields, type AppointmentDraftFields } from '../AppointmentFormFields'

/** 构造测试用 draft 样本（id 用确定值便于 label-for 定位） */
function makeDraft(overrides: Partial<AppointmentDraftFields> = {}): AppointmentDraftFields {
  return {
    id: 'd1',
    title: '看牙医',
    startTime: '2026-07-10T09:00:00.000Z',
    durationMin: 30,
    detail: '半年复查',
    people: ['老婆', '老妈'],
    ...overrides,
  }
}

describe('[026] T17 <AppointmentFormFields> 渲染稳定性', () => {
  it('渲染 5 个 input（title/start/duration/people/detail）', () => {
    render(<AppointmentFormFields draft={makeDraft()} onChange={vi.fn()} />)
    expect(screen.getByLabelText('事件名称')).toBeInTheDocument()
    expect(screen.getByLabelText('开始')).toBeInTheDocument()
    expect(screen.getByLabelText('时长(分)')).toBeInTheDocument()
    expect(screen.getByLabelText('关系人（逗号分隔）')).toBeInTheDocument()
    expect(screen.getByLabelText('详情')).toBeInTheDocument()
  })

  it('value 回显：从 draft 正确回填 5 个字段', () => {
    render(<AppointmentFormFields draft={makeDraft()} onChange={vi.fn()} />)
    expect((screen.getByLabelText('事件名称') as HTMLInputElement).value).toBe('看牙医')
    // datetime-local 用本地时间格式：T17 不固定具体值（与时区相关），断言非空即可
    const start = (screen.getByLabelText('开始') as HTMLInputElement).value
    expect(start.length).toBeGreaterThan(0)
    expect((screen.getByLabelText('时长(分)') as HTMLInputElement).value).toBe('30')
    // people 用「，」join
    expect((screen.getByLabelText('关系人（逗号分隔）') as HTMLInputElement).value).toBe('老婆，老妈')
    expect((screen.getByLabelText('详情') as HTMLTextAreaElement).value).toBe('半年复查')
  })

  it('用户输入 title 触发 onChange({ title })', () => {
    const onChange = vi.fn()
    render(<AppointmentFormFields draft={makeDraft()} onChange={onChange} />)
    const titleInput = screen.getByLabelText('事件名称') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: '复诊牙医' } })
    expect(onChange).toHaveBeenCalledWith({ title: '复诊牙医' })
  })

  it('用户输入 duration 触发 onChange({ durationMin: number })', () => {
    const onChange = vi.fn()
    render(<AppointmentFormFields draft={makeDraft()} onChange={onChange} />)
    const dur = screen.getByLabelText('时长(分)') as HTMLInputElement
    fireEvent.change(dur, { target: { value: '60' } })
    expect(onChange).toHaveBeenCalledWith({ durationMin: 60 })
  })

  it('people 用全角逗号/半角逗号 split + trim + filter 空串', () => {
    const onChange = vi.fn()
    render(<AppointmentFormFields draft={makeDraft({ people: [] })} onChange={onChange} />)
    const people = screen.getByLabelText('关系人（逗号分隔）') as HTMLInputElement
    fireEvent.change(people, { target: { value: '张三，李四, 王五 , ,' } })
    // split 拆出 ["张三", "李四", "王五", "", ""]，trim+filter → ["张三","李四","王五"]
    expect(onChange).toHaveBeenCalledWith({ people: ['张三', '李四', '王五'] })
  })

  it('detail 可空：null 回显为空字符串', () => {
    render(<AppointmentFormFields draft={makeDraft({ detail: null })} onChange={vi.fn()} />)
    expect((screen.getByLabelText('详情') as HTMLTextAreaElement).value).toBe('')
  })
})
