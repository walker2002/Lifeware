/**
 * @file habit-creation-card 单测
 * @brief [019.1] 验证 HabitCreationCard 手写化：serverErrors 直传 HabitForm（接上回填断点）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { HabitCreationCard } from '../surfaces/HabitCreationCard'

/** 捕获 HabitForm 接收的 props（屏蔽真实表单渲染） */
const captured = { current: null as Record<string, unknown> | null }
vi.mock('@/domains/habits/components/habit-form', () => ({
  HabitForm: (props: Record<string, unknown>) => {
    captured.current = props
    return null
  },
}))

describe('HabitCreationCard [019.1] 手写化', () => {
  beforeEach(() => { captured.current = null })

  it('把 serverErrors 直传给 HabitForm（接上 Lane B 回填断点）', () => {
    render(
      <HabitCreationCard
        surfaceType="habit-creation-card"
        dataModel={{ startDate: '2026-06-22' }}
        onDataChange={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
        serverErrors={['标题不能为空']}
      />,
    )
    expect(captured.current?.serverErrors).toEqual(['标题不能为空'])
  })

  it('把 dataModel 作为 initial 传给 HabitForm（默认值由 HabitForm 自身 fallback 提供）', () => {
    render(
      <HabitCreationCard
        surfaceType="habit-creation-card"
        dataModel={{ startDate: '2026-06-22' }}
        onDataChange={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(captured.current?.initial).toEqual({ startDate: '2026-06-22' })
  })

  it('把 onConfirm 作为 onSubmit 传给 HabitForm', () => {
    const onConfirm = vi.fn()
    render(
      <HabitCreationCard
        surfaceType="habit-creation-card"
        dataModel={{}}
        onDataChange={() => {}}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )
    // onSubmit 经类型桥接包装（HabitFormFields↔Record，见 HabitCreationCard.tsx），
    // 故断言行为等价而非引用相等：调用 onSubmit 应触发 onConfirm
    const onSubmit = captured.current?.onSubmit as (fields: unknown) => void
    onSubmit({ title: '晨跑' })
    expect(onConfirm).toHaveBeenCalledWith({ title: '晨跑' })
  })
})
